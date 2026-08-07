import 'server-only'

import { z } from 'zod'
import { AGENT_KEYS, type AgentKey } from '@/agents/contracts'
import { AGENTS } from '@/agents/registry'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import { estadoDePresupuesto, type EstadoPresupuesto } from '@/domain/presupuesto'
import { fechaEnEstudio, inicioDelDiaEnEstudio, inicioDelMesEnEstudio } from '@/lib/datos/bandeja'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/supabase/database.types'

/**
 * Lecturas de la pantalla de Agentes.
 *
 * `agent_runs` es append-only y la escribe el runner con service_role. Desde
 * aquí **solo se lee**: no hay una sola función de escritura en este archivo, y
 * lo único que se muta en toda la sección —encender o apagar un agente— vive en
 * una Server Action sobre `agent_policies`.
 *
 * La lista de los ocho agentes NO se declara aquí: sale de `@/agents/registry`,
 * que es la fuente de verdad de sus llaves, sus descripciones y de qué campos
 * escribe cada uno.
 */

/** Cuántos días pinta el sparkline. Dos semanas: se ve el patrón semanal. */
export const DIAS_SPARKLINE = 14

export type EstadoAgente = 'corriendo' | 'con_errores' | 'inactivo'

export interface MetricasAgente {
  key: AgentKey
  estado: EstadoAgente
  trabajosHoy: number
  escalamientosAbiertos: number
  /**
   * Qué tanto hay que corregirle: corridas con al menos una edición humana
   * entre corridas que terminaron bien, en el mes en curso. `null` cuando no
   * hay ninguna corrida que medir — que es distinto de 0%.
   */
  tasaEdicionPct: number | null
  /** El denominador de arriba. Sin él, "90%" de dos corridas parece un veredicto. */
  corridasMedidas: number
  costoMesCents: number
  /** Suma de `agent_policies.monthly_cap_cents` de los clientes en pantalla. */
  topeMesCents: number
  /**
   * En qué franja del tope cae el gasto del mes: `ok`, `aviso` (≥80%) o
   * `agotado` (≥100%). Derivado de costo/tope con la misma regla que usa el
   * runner para negarse a correr, así el chip del tablero y la puerta del
   * presupuesto nunca discrepan por un redondeo.
   */
  avisoPresupuesto: EstadoPresupuesto
  encendidoEn: number
  clientesConPolitica: number
  /** Corridas por día, la última posición es hoy. Siempre `DIAS_SPARKLINE` largo. */
  sparkline: number[]
  ultimaCorrida: string | null
}

export interface ClienteDeAgentes {
  id: string
  slug: string
  nombre: string
}

export interface PanelAgentes {
  agentes: MetricasAgente[]
  clientes: ClienteDeAgentes[]
  /** El cliente al que le aplica el switch. `null` = vista agregada, sin switch. */
  clienteActivo: ClienteDeAgentes | null
}

/**
 * El tablero de los ocho.
 *
 * Todo lo que se muestra queda **acotado al cliente activo** cuando hay uno.
 * Mezclar el costo de todos los clientes con el tope de uno solo produce una
 * barra de presupuesto que miente, y esa barra es la que decide si se sigue
 * gastando.
 */
export async function panelAgentes(ahora: Date, clienteSlug?: string): Promise<PanelAgentes> {
  const supabase = await createClient()

  const inicioMes = inicioDelMesEnEstudio(ahora)
  const inicioVentana = inicioDelDiaEnEstudio(ahora, DIAS_SPARKLINE - 1)
  // La ventana de lectura cubre lo que sea más viejo: el mes corriente (para
  // costo y tasa de edición) o los 14 días del sparkline. Una sola consulta.
  const desde = inicioMes < inicioVentana ? inicioMes : inicioVentana
  const inicioHoy = inicioDelDiaEnEstudio(ahora)

  // Los clientes se leen primero y aparte: la pantalla identifica al cliente
  // por su slug —que es lo que va en la URL— y las demás consultas filtran por
  // id. Un viaje extra a cambio de que la ruta no cargue uuids.
  const { data: filasCliente, error: errorClientes } = await supabase
    .from('clients')
    .select('id, slug, name')
    .is('archived_at', null)
    .order('name')

  if (errorClientes) {
    throw new Error(`No se pudieron leer los clientes: ${errorClientes.message}`)
  }

  const clientes: ClienteDeAgentes[] = (filasCliente ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    nombre: c.name,
  }))

  // Con un solo cliente en el estudio no hay nada que elegir: la vista
  // "agregada" y la del cliente son el mismo número, y dejar los switches
  // apagados esperando una selección que no existe sería un callejón.
  const clienteActivo =
    clientes.find((c) => c.slug === clienteSlug) ??
    (clientes.length === 1 ? clientes[0] : null) ??
    null
  const clienteId = clienteActivo?.id

  const [politicasRes, corridasRes, escalamientosRes, edicionesRes] = await Promise.all([
    (() => {
      const q = supabase.from('agent_policies').select('agent, enabled, monthly_cap_cents')
      return clienteId ? q.eq('client_id', clienteId) : q
    })(),
    (() => {
      const q = supabase
        .from('agent_runs')
        .select('agent, status, cost_cents, started_at')
        .gte('started_at', desde)
      return clienteId ? q.eq('client_id', clienteId) : q
    })(),
    (() => {
      const q = supabase.from('escalations').select('agent').is('resolved_at', null)
      return clienteId ? q.eq('client_id', clienteId) : q
    })(),
    (() => {
      const q = supabase.from('human_edits').select('agent, run_id').gte('created_at', inicioMes)
      return clienteId ? q.eq('client_id', clienteId) : q
    })(),
  ])

  const primerError =
    politicasRes.error ?? corridasRes.error ?? escalamientosRes.error ?? edicionesRes.error
  if (primerError) {
    throw new Error(`No se pudieron leer los agentes: ${primerError.message}`)
  }

  const dias = diasDeLaVentana(ahora)

  const agentes = AGENT_KEYS.map((key) => {
    const politicas = (politicasRes.data ?? []).filter((p) => p.agent === key)
    const corridas = (corridasRes.data ?? []).filter((r) => r.agent === key)
    const corridasDelMes = corridas.filter((r) => r.started_at >= inicioMes)

    // Solo las corridas que terminaron bien se pueden editar; contar las que
    // tronaron en el denominador bajaría la tasa de edición artificialmente y
    // haría ver mejor de lo que es al agente que más falla.
    const corridasMedidas = corridasDelMes.filter((r) => r.status === 'ok').length
    const corridasEditadas = new Set(
      (edicionesRes.data ?? [])
        .filter((e) => e.agent === key && e.run_id !== null)
        .map((e) => e.run_id),
    ).size

    const sparkline = dias.map(
      (dia) => corridas.filter((r) => fechaEnEstudio(new Date(r.started_at)) === dia).length,
    )

    const ultima = corridas.reduce<string | null>(
      (max, r) => (max === null || r.started_at > max ? r.started_at : max),
      null,
    )

    const costoMesCents = corridasDelMes.reduce((suma, r) => suma + r.cost_cents, 0)
    const topeMesCents = politicas.reduce((suma, p) => suma + p.monthly_cap_cents, 0)

    return {
      key,
      estado: estadoDe(corridas),
      trabajosHoy: corridas.filter((r) => r.started_at >= inicioHoy).length,
      escalamientosAbiertos: (escalamientosRes.data ?? []).filter((e) => e.agent === key).length,
      tasaEdicionPct:
        corridasMedidas > 0
          ? Math.min(100, Math.round((corridasEditadas / corridasMedidas) * 100))
          : null,
      corridasMedidas,
      costoMesCents,
      topeMesCents,
      avisoPresupuesto: estadoDePresupuesto(costoMesCents, topeMesCents),
      encendidoEn: politicas.filter((p) => p.enabled).length,
      clientesConPolitica: politicas.length,
      sparkline,
      ultimaCorrida: ultima,
    } satisfies MetricasAgente
  })

  return { agentes, clientes, clienteActivo }
}

/**
 * El punto de estado.
 *
 * `corriendo` gana sobre `con_errores` porque una corrida en vuelo puede
 * todavía salir bien, y el punto describe qué está pasando ahora, no qué pasó.
 * `inactivo` NO es un problema: los ocho nacen apagados a propósito.
 */
function estadoDe(corridas: readonly { status: string }[]): EstadoAgente {
  if (corridas.some((r) => r.status === 'corriendo' || r.status === 'pendiente')) return 'corriendo'
  if (corridas.some((r) => r.status === 'error')) return 'con_errores'
  return 'inactivo'
}

/** Las 14 fechas del sparkline, de la más vieja a hoy. */
function diasDeLaVentana(ahora: Date): string[] {
  return Array.from({ length: DIAS_SPARKLINE }, (_, i) =>
    fechaEnEstudio(new Date(ahora.getTime() - (DIAS_SPARKLINE - 1 - i) * 86_400_000)),
  )
}

/* -------------------------------------------------------------------------- */
/*  Bitácora de un agente                                                      */
/* -------------------------------------------------------------------------- */

export type ResultadoCorrida = 'resultado' | 'escalamiento' | 'error' | 'corriendo' | 'cancelada'

export interface EdicionHumana {
  campo: string
  antes: string | null
  despues: string | null
}

export interface CorridaBitacora {
  id: string
  /** ISO. El componente le da formato con la zona del estudio. */
  iniciadaEn: string
  cliente: string
  clienteSlug: string
  pieza: { etiqueta: string; href: string } | null
  resultado: ResultadoCorrida
  modelo: string | null
  tokensEntrada: number | null
  tokensSalida: number | null
  costoCents: number
  duracionMs: number | null
  contextVersion: number | null
  disparador: string
  input: Json
  output: Json
  error: string | null
  /** Campos de `pieces` que esta corrida escribió, cruzados con el registro. */
  camposEscritos: string[]
  /** Lo que una persona le corrigió después. El activo real del sistema. */
  edicionesHumanas: EdicionHumana[]
}

export interface DetalleAgente {
  key: AgentKey
  metricas: MetricasAgente
  corridas: CorridaBitacora[]
  clienteActivo: ClienteDeAgentes | null
  clientes: ClienteDeAgentes[]
}

/** Cuántas corridas trae la bitácora de un jalón. */
const LIMITE_BITACORA = 50

/** Varios agentes reciben la pieza en la entrada; de ahí sale el link. */
const inputConPieza = z.object({ piece_id: z.uuid() })

export async function detalleAgente(
  key: AgentKey,
  ahora: Date,
  clienteSlug?: string,
): Promise<DetalleAgente> {
  const supabase = await createClient()

  const panel = await panelAgentes(ahora, clienteSlug)
  const metricas = panel.agentes.find((a) => a.key === key)
  if (!metricas) throw new Error(`Agente desconocido: "${key}".`)

  const clienteId = panel.clienteActivo?.id

  let consulta = supabase
    .from('agent_runs')
    .select(
      `id, started_at, status, model, input, output, error, input_tokens, output_tokens,
       cost_cents, duration_ms, context_version, trigger,
       clients ( name, slug )`,
    )
    .eq('agent', key)
    .order('started_at', { ascending: false })
    .limit(LIMITE_BITACORA)

  if (clienteId) consulta = consulta.eq('client_id', clienteId)

  const { data, error } = await consulta
  if (error) throw new Error(`No se pudo leer la bitácora: ${error.message}`)

  const filas = data ?? []

  // Las piezas de las corridas listadas, en una sola consulta, para poder
  // enseñar el hook en vez de un uuid.
  const piezaDeCorrida = new Map<string, string>()
  for (const fila of filas) {
    const parsed = inputConPieza.safeParse(fila.input)
    if (parsed.success) piezaDeCorrida.set(fila.id, parsed.data.piece_id)
  }

  const piezas = new Map<string, { etiqueta: string; month: string }>()
  const ids = [...new Set(piezaDeCorrida.values())]
  if (ids.length > 0) {
    const { data: filasPieza } = await supabase
      .from('pieces')
      .select('id, hook, idea, format, month')
      .in('id', ids)
    for (const p of filasPieza ?? []) {
      piezas.set(p.id, {
        etiqueta: p.hook ?? p.idea ?? PIECE_FORMAT_LABEL[p.format],
        month: p.month,
      })
    }
  }

  const { data: ediciones } = await supabase
    .from('human_edits')
    .select('run_id, field, old_value, new_value')
    .in(
      'run_id',
      filas.map((f) => f.id),
    )

  const edicionesPorCorrida = new Map<string, EdicionHumana[]>()
  for (const e of ediciones ?? []) {
    if (!e.run_id) continue
    const lista = edicionesPorCorrida.get(e.run_id) ?? []
    lista.push({ campo: e.field, antes: e.old_value, despues: e.new_value })
    edicionesPorCorrida.set(e.run_id, lista)
  }

  const corridas: CorridaBitacora[] = filas.map((fila) => {
    const piezaId = piezaDeCorrida.get(fila.id)
    const pieza = piezaId ? piezas.get(piezaId) : undefined
    const slug = fila.clients?.slug ?? ''

    return {
      id: fila.id,
      iniciadaEn: fila.started_at,
      cliente: fila.clients?.name ?? 'Cliente sin nombre',
      clienteSlug: slug,
      pieza:
        pieza && slug
          ? { etiqueta: pieza.etiqueta, href: `/cliente/${slug}?mes=${pieza.month}#planner` }
          : null,
      resultado: resultadoDe(fila.status, fila.output),
      modelo: fila.model,
      tokensEntrada: fila.input_tokens,
      tokensSalida: fila.output_tokens,
      costoCents: fila.cost_cents,
      duracionMs: fila.duration_ms,
      contextVersion: fila.context_version,
      disparador: fila.trigger,
      input: fila.input,
      output: fila.output,
      error: fila.error,
      camposEscritos: camposEscritos(key, fila.output),
      edicionesHumanas: edicionesPorCorrida.get(fila.id) ?? [],
    }
  })

  return {
    key,
    metricas,
    corridas,
    clienteActivo: panel.clienteActivo,
    clientes: panel.clientes,
  }
}

/**
 * Escalar no es error, y por eso tiene su propio resultado en la bitácora.
 * Una corrida que terminó preguntando corrió bien: hizo exactamente lo que
 * debía hacer un agente que no sabe.
 */
function resultadoDe(status: string, output: Json): ResultadoCorrida {
  if (status === 'error') return 'error'
  if (status === 'cancelada') return 'cancelada'
  if (status === 'pendiente' || status === 'corriendo') return 'corriendo'

  if (output !== null && typeof output === 'object' && !Array.isArray(output)) {
    if (output['kind'] === 'escalamiento') return 'escalamiento'
  }
  return 'resultado'
}

/**
 * Qué campos de `pieces` tocó la corrida.
 *
 * Se cruza lo que trae la salida contra la lista blanca del registro y no se
 * confía en las llaves del jsonb: si una salida vieja trae un campo que ese
 * agente hoy no puede escribir, la bitácora no debe afirmar que lo escribió.
 */
function camposEscritos(key: AgentKey, output: Json): string[] {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) return []
  const data = output['data']
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return []

  const permitidos: readonly string[] = AGENTS[key].writes
  return Object.keys(data).filter((campo) => permitidos.includes(campo))
}
