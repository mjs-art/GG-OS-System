import 'server-only'

import { z } from 'zod'
import { analistaOutputSchema } from '@/agents/contracts'
import {
  agruparRendimiento,
  serieDeSeguidores,
  type PiezaMedida,
  type PuntoSeguidores,
  type RenglonRendimiento,
} from '@/domain/metricas'
import type { PieceFormat } from '@/domain/labels'
import { createClient } from '@/lib/supabase/server'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Lecturas de la sección Resultados.
 *
 * Como en el resto de `lib/datos`, ninguna consulta filtra por org a mano: eso
 * lo hace RLS y hay pruebas de pgTAP que lo verifican.
 *
 * Lo que sí vive aquí es la decisión de **de dónde sale cada número**, que no
 * es obvia:
 *   · Los ocho totales del mes salen de `results_monthly`, capturado a mano o
 *     por CSV. No se derivan sumando piezas: el alcance de la cuenta no es la
 *     suma del alcance de las publicaciones, porque la misma persona ve varias.
 *   · Las tablas de rendimiento salen de `results_piece`, que es por pieza.
 *   · La curva de seguidores se reconstruye hacia atrás desde el total de hoy.
 *     Ver `serieDeSeguidores`.
 */

/* -------------------------------------------------------------------------- */
/*  Totales del mes                                                            */
/* -------------------------------------------------------------------------- */

export interface MetricasMes {
  mes: MonthKey
  alcance: number
  impresiones: number
  guardados: number
  compartidos: number
  interacciones: number
  seguidoresNuevos: number
  visitasPerfil: number
  clicsLink: number
  origen: 'manual' | 'csv' | 'api'
}

/* -------------------------------------------------------------------------- */
/*  Piezas medidas                                                             */
/* -------------------------------------------------------------------------- */

export interface PiezaConMetricas {
  id: string
  hook: string
  formato: PieceFormat
  pilar: string
  /** Color del pilar, o el hairline cuando la pieza no tiene pilar asignado. */
  color: string
  publicadaEn: string | null
  alcance: number
  guardados: number
  compartidos: number
  interacciones: number
}

/* -------------------------------------------------------------------------- */
/*  La lectura del Analista                                                    */
/* -------------------------------------------------------------------------- */

type ReporteAnalista = Extract<z.infer<typeof analistaOutputSchema>, { kind: 'resultado' }>['data']

export interface LecturaDelAnalista {
  reporte: ReporteAnalista
  /** Cuándo corrió. Una lectura de hace tres semanas no vale lo mismo. */
  corridaEn: string
  /** Hook de cada pieza propuesta, para no enseñar un UUID en la interfaz. */
  hookPorPieza: Record<string, string>
}

/* -------------------------------------------------------------------------- */
/*  El paquete completo de la sección                                          */
/* -------------------------------------------------------------------------- */

export interface DatosResultados {
  mes: MonthKey
  actual: MetricasMes | null
  anterior: MetricasMes | null
  seguidores: PuntoSeguidores[]
  porFormato: RenglonRendimiento[]
  porPilar: Array<RenglonRendimiento & { color: string }>
  top: PiezaConMetricas[]
  ultimas: PiezaConMetricas[]
  lectura: LecturaDelAnalista | null
}

const MESES_DE_LA_CURVA = 6

interface Medicion {
  piece_id: string
  reach: number
  saves: number
  shares: number
  interactions: number
}

function aMetricas(fila: {
  month: string
  reach: number
  impressions: number
  saves: number
  shares: number
  interactions: number
  new_followers: number
  profile_visits: number
  link_clicks: number
  source: 'manual' | 'csv' | 'api'
}): MetricasMes {
  return {
    mes: fila.month as MonthKey,
    alcance: fila.reach,
    impresiones: fila.impressions,
    guardados: fila.saves,
    compartidos: fila.shares,
    interacciones: fila.interactions,
    seguidoresNuevos: fila.new_followers,
    visitasPerfil: fila.profile_visits,
    clicsLink: fila.link_clicks,
    origen: fila.source,
  }
}

export async function datosDeResultados(clientId: string, mes: MonthKey): Promise<DatosResultados> {
  const supabase = await createClient()

  const primerMes = addMonths(mes, -(MESES_DE_LA_CURVA - 1))
  const mesAnterior = addMonths(mes, -1)

  const [mensualesRes, piezasRes, pilaresRes, redesRes] = await Promise.all([
    // Se traen los seis meses de la curva de una vez: el mes actual, el
    // anterior y la serie salen todos de aquí.
    supabase
      .from('results_monthly')
      .select('*')
      .eq('client_id', clientId)
      .gte('month', primerMes)
      .lte('month', mes)
      .order('month'),
    supabase
      .from('pieces')
      .select('id, hook, idea, format, pillar_id, publish_at')
      .eq('client_id', clientId)
      .eq('month', mes),
    supabase.from('pillars').select('id, name, color').eq('client_id', clientId),
    supabase.from('social_accounts').select('platform, followers').eq('client_id', clientId),
  ])

  const primerError = mensualesRes.error ?? piezasRes.error ?? pilaresRes.error
  if (primerError) {
    throw new Error(`No se pudieron leer los resultados: ${primerError.message}`)
  }

  // Las mediciones van en un segundo viaje, filtradas por las piezas del mes.
  // `results_piece` crece con cada importación y para siempre: traerla completa
  // funciona el primer año y se vuelve lenta sin que nada avise.
  const idsDelMes = (piezasRes.data ?? []).map((p) => p.id)
  const medicionesRes = idsDelMes.length
    ? await supabase
        .from('results_piece')
        .select('piece_id, reach, saves, shares, interactions')
        .eq('client_id', clientId)
        .in('piece_id', idsDelMes)
        .order('measured_at', { ascending: false })
    : { data: [] as Medicion[], error: null }

  if (medicionesRes.error) {
    throw new Error(`No se pudieron leer las mediciones: ${medicionesRes.error.message}`)
  }

  const mensuales = (mensualesRes.data ?? []).map(aMetricas)
  const actual = mensuales.find((m) => m.mes === mes) ?? null
  const anterior = mensuales.find((m) => m.mes === mesAnterior) ?? null

  /* --- Curva de seguidores ------------------------------------------------ */
  // Se suman las cuentas de todas las redes. Un número por red daría seis
  // líneas en una gráfica de 40px de alto, que no se lee; la sección Redes es
  // la que desglosa por plataforma. Si esa consulta falló, la curva sale
  // apoyada en cero: se ve la forma del crecimiento aunque falte la escala.
  const seguidoresHoy = (redesRes.data ?? []).reduce((total, r) => total + r.followers, 0)
  const seguidores = serieDeSeguidores(
    seguidoresHoy,
    mensuales.map((m) => ({ mes: m.mes, nuevos: m.seguidoresNuevos })),
  )

  /* --- Rendimiento por pieza ---------------------------------------------- */
  const colorPilar = new Map((pilaresRes.data ?? []).map((p) => [p.id, p.color] as const))
  const nombrePilar = new Map((pilaresRes.data ?? []).map((p) => [p.id, p.name] as const))

  // Una pieza se puede medir varias veces. Vale la última: las anteriores son
  // fotos de una publicación que todavía estaba corriendo. La consulta ya vino
  // ordenada por `measured_at` descendente, así que la primera que se ve gana.
  const ultimaMedicion = new Map<string, Medicion>()
  for (const medicion of medicionesRes.data ?? []) {
    if (!ultimaMedicion.has(medicion.piece_id)) ultimaMedicion.set(medicion.piece_id, medicion)
  }

  const piezas: PiezaConMetricas[] = []
  for (const pieza of piezasRes.data ?? []) {
    const medicion = ultimaMedicion.get(pieza.id)
    if (!medicion) continue
    piezas.push({
      id: pieza.id,
      hook: pieza.hook ?? pieza.idea ?? 'Sin hook todavía',
      formato: pieza.format,
      pilar: nombrePilar.get(pieza.pillar_id ?? '') ?? 'Sin pilar',
      color: colorPilar.get(pieza.pillar_id ?? '') ?? 'var(--color-line)',
      publicadaEn: pieza.publish_at,
      alcance: medicion.reach,
      guardados: medicion.saves,
      compartidos: medicion.shares,
      interacciones: medicion.interactions,
    })
  }

  const medidas = (clave: (p: PiezaConMetricas) => string): PiezaMedida[] =>
    piezas.map((p) => ({
      clave: clave(p),
      reach: p.alcance,
      saves: p.guardados,
      shares: p.compartidos,
      impressions: 0,
      interactions: p.interacciones,
    }))

  const porFormato = agruparRendimiento(medidas((p) => p.formato))
  const porPilar = agruparRendimiento(medidas((p) => p.pilar)).map((fila) => ({
    ...fila,
    color: piezas.find((p) => p.pilar === fila.clave)?.color ?? 'var(--color-line)',
  }))

  const top = [...piezas].sort((a, b) => b.alcance - a.alcance).slice(0, 5)
  const ultimas = [...piezas]
    .filter((p) => p.publicadaEn !== null)
    .sort((a, b) => (b.publicadaEn ?? '').localeCompare(a.publicadaEn ?? ''))
    .slice(0, 3)

  const lectura = await lecturaDelAnalista(clientId, mes, piezasRes.data ?? [])

  return { mes, actual, anterior, seguidores, porFormato, porPilar, top, ultimas, lectura }
}

/* -------------------------------------------------------------------------- */
/*  Lectura del Analista                                                       */
/* -------------------------------------------------------------------------- */

/** Solo se necesita el mes de la entrada; el resto de la corrida no se lee aquí. */
const entradaDeCorrida = z.object({ month: z.string() })

/**
 * La última lectura del Analista para ese mes.
 *
 * Se lee de `agent_runs` y NO se corre el agente aquí. Una lectura de página no
 * puede disparar una corrida: sería gasto sin control, sin registro de quién la
 * pidió, y un refresh costaría dinero. Correr al agente es una acción explícita
 * con su Server Action.
 *
 * La salida guardada se vuelve a validar contra el contrato aunque ya se haya
 * validado al escribirla: el jsonb de una corrida vieja pudo haberse escrito
 * con una versión anterior del schema, y pintar un reporte con campos faltantes
 * truena en render, del lado del servidor, con la página entera.
 */
async function lecturaDelAnalista(
  clientId: string,
  mes: MonthKey,
  piezas: ReadonlyArray<{ id: string; hook: string | null; idea: string | null }>,
): Promise<LecturaDelAnalista | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('agent_runs')
    .select('input, output, started_at')
    .eq('client_id', clientId)
    .eq('agent', 'analista')
    .eq('status', 'ok')
    .order('started_at', { ascending: false })
    .limit(10)

  // Sin lectura del Analista la sección se ve completa igual. Tumbar Resultados
  // porque la bitácora falló sería perder las ocho métricas por un extra.
  if (error) return null

  for (const corrida of data ?? []) {
    const entrada = entradaDeCorrida.safeParse(corrida.input)
    if (!entrada.success || entrada.data.month !== mes) continue

    const salida = analistaOutputSchema.safeParse(corrida.output)
    // Un escalamiento no es una lectura: es una pregunta, y vive en la Bandeja.
    if (!salida.success || salida.data.kind !== 'resultado') continue

    const hookPorPieza: Record<string, string> = {}
    for (const pieza of piezas) {
      hookPorPieza[pieza.id] = pieza.hook ?? pieza.idea ?? 'Sin hook todavía'
    }

    return { reporte: salida.data.data, corridaEn: corrida.started_at, hookPorPieza }
  }

  return null
}
