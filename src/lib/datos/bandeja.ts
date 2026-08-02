import 'server-only'

import { z } from 'zod'
import type { Escalamiento } from '@/domain/bandeja'
import { esErrorDeSesion } from '@/lib/datos/errores'
import { createClient } from '@/lib/supabase/server'
import { STUDIO_TIMEZONE } from '@/lib/time'

/**
 * Lecturas de la Bandeja.
 *
 * Igual que el resto de `lib/datos`: ninguna consulta filtra por org ni por
 * cliente a mano. Lo hace RLS, y hay pruebas de pgTAP que lo verifican. Aquí
 * solo se lee — `escalations` se resuelve desde una Server Action, y
 * `agent_runs` no se escribe nunca desde el navegador.
 */

/* -------------------------------------------------------------------------- */
/*  Utilidades de tiempo compartidas con lib/datos/agentes.ts                  */
/* -------------------------------------------------------------------------- */

const FORMATO_FECHA = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** `2026-08-14` en la zona del estudio. La llave con la que se agrupa por día. */
export function fechaEnEstudio(instante: Date): string {
  return FORMATO_FECHA.format(instante)
}

/**
 * El instante en que empieza una fecha **en Tijuana**, como literal que
 * Postgres entiende: `2026-08-01T00:00:00-07:00`.
 *
 * Comparar contra la medianoche UTC daría siete horas de más u ocho de menos
 * según el horario de verano, y "trabajos de hoy" saldría mal justo entre las
 * 5 y las 7 de la tarde, que es cuando alguien está viendo la pantalla.
 */
export function inicioDeFechaEnEstudio(fecha: string): string {
  // Mediodía UTC cae dentro del día en cualquier zona del continente, así que
  // el offset que se calcula aquí es el de ESA fecha — importa, porque el
  // horario de verano lo mueve dos veces al año.
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${fecha}T12:00:00Z`))

  // `longOffset` da 'GMT-07:00'; sin el 'GMT' queda el sufijo que se le pega a
  // la hora.
  const offset = partes.find((p) => p.type === 'timeZoneName')?.value.replace('GMT', '') || '+00:00'

  return `${fecha}T00:00:00${offset}`
}

/** El arranque de hoy, o el de hace N días. */
export function inicioDelDiaEnEstudio(ahora: Date, diasAtras = 0): string {
  return inicioDeFechaEnEstudio(fechaEnEstudio(new Date(ahora.getTime() - diasAtras * 86_400_000)))
}

/** El arranque del mes en curso, para el costo y la tasa de edición. */
export function inicioDelMesEnEstudio(ahora: Date): string {
  return inicioDeFechaEnEstudio(`${fechaEnEstudio(ahora).slice(0, 7)}-01`)
}

/* -------------------------------------------------------------------------- */
/*  Escalamientos abiertos                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Las opciones vienen de un `jsonb` que escribió el runner. Es nuestro dato,
 * pero jsonb no tiene tipo: una corrida vieja con otra forma no debe tumbar la
 * Bandeja completa, así que se valida y lo que no cumple se descarta.
 */
const opcionesSchema = z
  .array(z.object({ key: z.string().min(1).max(120), label: z.string().min(1).max(120) }))
  .max(5)
  .catch([])

export interface DatosBandeja {
  escalamientos: Escalamiento[]
  /** Alimenta el estado vacío: "47 piezas avanzaron hoy sin ti." */
  piezasAvanzadasHoy: number
}

export async function cargarBandeja(ahora: Date): Promise<DatosBandeja> {
  const [escalamientos, piezasAvanzadasHoy] = await Promise.all([
    listarEscalamientos(),
    contarPiezasAvanzadasHoy(ahora),
  ])

  return { escalamientos, piezasAvanzadasHoy }
}

export async function listarEscalamientos(): Promise<Escalamiento[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('escalations')
    .select(
      `id, agent, severity, question, options, created_at, piece_id,
       clients ( id, name, slug ),
       pieces ( id, format, hook, publish_at, month, pillar_id )`,
    )
    .is('resolved_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    // Un token que el servidor todavía no acepta —deriva de reloj entre
    // servicios— no es un bug de la app, y tumbar la página por eso deja al
    // usuario sin nada cuando lo único que hacía falta era recargar. El proxy
    // ya lo manda al login en la siguiente navegación si la sesión de verdad
    // murió. Se registra, no se esconde.
    if (esErrorDeSesion(error)) {
      console.warn(`Bandeja: la sesión no fue aceptada (${error.code}). Se muestra vacía.`)
      return []
    }
    throw new Error(`No se pudo leer la bandeja: ${error.message}`)
  }
  if (!data?.length) return []

  // Los colores de pilar se traen en una sola consulta aparte en vez de anidar
  // otro nivel en el select: anidar pieces → pillars obliga a Postgrest a
  // resolver dos joins por renglón y aquí solo se necesita el color.
  const pilaresNecesarios = [
    ...new Set(data.map((e) => e.pieces?.pillar_id).filter((id): id is string => Boolean(id))),
  ]

  const colorPilar = new Map<string, string>()
  if (pilaresNecesarios.length > 0) {
    const { data: pilares } = await supabase
      .from('pillars')
      .select('id, color')
      .in('id', pilaresNecesarios)
    for (const pilar of pilares ?? []) colorPilar.set(pilar.id, pilar.color)
  }

  const escalamientos: Escalamiento[] = []

  for (const fila of data) {
    const cliente = fila.clients
    // Sin cliente visible no hay tarjeta que pintar. Pasa si RLS dejó ver el
    // escalamiento pero no el cliente; es un caso imposible hoy y aun así es
    // más barato saltarlo que renderizar "undefined" en el encabezado.
    if (!cliente) continue

    const pieza = fila.pieces

    escalamientos.push({
      id: fila.id,
      agente: fila.agent,
      severidad: fila.severity,
      pregunta: fila.question,
      opciones: opcionesSchema.parse(fila.options),
      creadoEn: fila.created_at,
      cliente: { id: cliente.id, nombre: cliente.name, slug: cliente.slug },
      pieza: pieza
        ? {
            id: pieza.id,
            formato: pieza.format,
            hook: pieza.hook,
            publishAt: pieza.publish_at,
            color: colorPilar.get(pieza.pillar_id ?? '') ?? 'var(--color-line)',
            href: `/cliente/${cliente.slug}?mes=${pieza.month}#planner`,
          }
        : null,
    })
  }

  return escalamientos
}

/**
 * Piezas que se movieron hoy sin que nadie las empujara a mano.
 *
 * Se mide con `updated_at` y no con una bitácora de cambios de estado porque
 * esa bitácora no existe todavía. Es una aproximación honesta —y el número
 * solo se usa para el estado vacío—, pero conviene saberlo antes de citarlo en
 * un reporte.
 */
export async function contarPiezasAvanzadasHoy(ahora: Date): Promise<number> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('pieces')
    .select('id', { count: 'exact', head: true })
    .gte('updated_at', inicioDelDiaEnEstudio(ahora))

  // Un contador de adorno no debe tumbar la pantalla: si no se pudo leer, el
  // estado vacío se queda con su titular y sin la línea de abajo.
  if (error) return 0
  return count ?? 0
}
