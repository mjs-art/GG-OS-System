import 'server-only'

import {
  diaDeCampana,
  totalizar,
  type AdSetPauta,
  type AlternativaPropuesta,
  type CampanaPauta,
  type CreativoPauta,
  type DatosPauta,
  type MetricaDiaria,
  type PropuestaPauta,
  type TipoPropuesta,
} from '@/domain/pauta'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de la sección Pauta.
 *
 * Como el resto de `@/lib/datos`, ninguna consulta filtra por org ni por
 * cliente a mano: eso lo hace RLS. El `.eq('client_id', …)` que sí aparece es
 * para acotar el resultado a UN cliente, no para autorizar.
 *
 * Todo se trae en cinco consultas y se arma en memoria. La alternativa —un
 * select anidado de campaigns → ad_sets → ad_metrics— devuelve el mismo JSON
 * pero deja que PostgREST decida el plan, y con siete días por ad set eso ya
 * empieza a doler.
 */

/** Tipos de propuesta válidos. Se usa para leer el jsonb de la alternativa. */
const TIPOS_PROPUESTA: readonly string[] = [
  'pausar',
  'reactivar',
  'mover_presupuesto',
  'subir_presupuesto',
  'bajar_presupuesto',
  'cambiar_creativo',
  'cambiar_publico',
  'extender',
  'cerrar',
]

/**
 * `alternative` es jsonb libre: la escribe el agente y puede traer cualquier
 * cosa. Se lee campo por campo en vez de castear, porque un cast de `Json` a
 * una interfaz es una promesa que nadie verifica.
 */
function leerAlternativa(valor: unknown): AlternativaPropuesta {
  const obj = typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : {}
  const kind = obj['kind']
  const rationale = obj['rationale']
  const instructions = obj['instructions']

  return {
    tipo:
      typeof kind === 'string' && TIPOS_PROPUESTA.includes(kind) ? (kind as TipoPropuesta) : null,
    razonamiento: typeof rationale === 'string' && rationale.trim() !== '' ? rationale : null,
    instrucciones:
      typeof instructions === 'string' && instructions.trim() !== '' ? instructions : null,
  }
}

function leerPublico(valor: unknown): Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}
}

export async function datosPauta(clientId: string): Promise<DatosPauta> {
  const supabase = await createClient()

  const [campanasRes, adSetsRes, metricasRes, creativosRes, propuestasRes] = await Promise.all([
    supabase
      .from('campaigns')
      .select(
        'id, name, objective, platform, budget_cents, spent_cents, start_date, end_date, status, learning_goal, result_metric, learned',
      )
      .eq('client_id', clientId)
      .order('start_date', { ascending: false }),
    supabase
      .from('ad_sets')
      .select(
        'id, campaign_id, name, audience_type, audience_def, budget_cents, spent_cents, status, created_at',
      )
      .eq('client_id', clientId)
      .order('created_at'),
    supabase
      .from('ad_metrics')
      .select('ad_set_id, date, spend_cents, impressions, reach, clicks, results')
      .eq('client_id', clientId)
      .order('date'),
    supabase
      .from('ad_creatives')
      .select('id, ad_set_id, piece_id, status, pieces(format, hook, idea, publish_at, pillar_id)')
      .eq('client_id', clientId),
    supabase
      .from('ad_proposals')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
  ])

  const error =
    campanasRes.error ??
    adSetsRes.error ??
    metricasRes.error ??
    creativosRes.error ??
    propuestasRes.error
  if (error) throw new Error(`No se pudo leer la pauta: ${error.message}`)

  // Los colores de pilar son dato de la base y sirven para que la miniatura del
  // creativo se lea igual que en el planner.
  const { data: pilares } = await supabase.from('pillars').select('id, color')
  const colorPilar = new Map((pilares ?? []).map((p) => [p.id, p.color] as const))

  const diariasPorAdSet = new Map<string, MetricaDiaria[]>()
  for (const m of metricasRes.data ?? []) {
    const lista = diariasPorAdSet.get(m.ad_set_id) ?? []
    lista.push({
      fecha: m.date,
      gastoCents: m.spend_cents,
      impresiones: m.impressions,
      alcance: m.reach,
      clics: m.clicks,
      resultados: m.results,
    })
    diariasPorAdSet.set(m.ad_set_id, lista)
  }

  const adSetsPorCampana = new Map<string, AdSetPauta[]>()
  const nombreAdSet = new Map<string, string>()
  const campanaDeAdSet = new Map<string, string>()

  for (const a of adSetsRes.data ?? []) {
    const diarias = diariasPorAdSet.get(a.id) ?? []
    const totales = totalizar(diarias)

    nombreAdSet.set(a.id, a.name)
    campanaDeAdSet.set(a.id, a.campaign_id)

    const lista = adSetsPorCampana.get(a.campaign_id) ?? []
    lista.push({
      id: a.id,
      nombre: a.name,
      tipoPublico: a.audience_type,
      publico: leerPublico(a.audience_def),
      presupuestoCents: a.budget_cents,
      // El gasto sale de las métricas capturadas y no de `spent_cents` cuando
      // hay renglones: el ledger diario es lo que se importó del ads manager y
      // la columna es un resumen que se desincroniza en cuanto alguien captura
      // un día suelto. Sin métricas, la columna es lo único que hay.
      gastadoCents: diarias.length > 0 ? totales.gastoCents : a.spent_cents,
      estado: a.status,
      diarias,
      totales,
    })
    adSetsPorCampana.set(a.campaign_id, lista)
  }

  const creativosPorCampana = new Map<string, CreativoPauta[]>()
  for (const c of creativosRes.data ?? []) {
    const campanaId = campanaDeAdSet.get(c.ad_set_id)
    const pieza = c.pieces
    if (!campanaId || !pieza) continue

    const lista = creativosPorCampana.get(campanaId) ?? []
    lista.push({
      id: c.id,
      adSetId: c.ad_set_id,
      adSetNombre: nombreAdSet.get(c.ad_set_id) ?? 'Ad set',
      piezaId: c.piece_id,
      formato: pieza.format,
      titulo: pieza.hook ?? pieza.idea ?? 'Pieza sin hook',
      publicarEl: pieza.publish_at,
      estado: c.status,
      color: colorPilar.get(pieza.pillar_id ?? '') ?? null,
    })
    creativosPorCampana.set(campanaId, lista)
  }

  const cabezaCampana = new Map(
    (campanasRes.data ?? []).map(
      (c) => [c.id, { nombre: c.name, inicio: c.start_date, fin: c.end_date }] as const,
    ),
  )

  const propuestasPorCampana = new Map<string, PropuestaPauta[]>()
  for (const p of propuestasRes.data ?? []) {
    const campana = cabezaCampana.get(p.campaign_id)
    if (!campana) continue

    const lista = propuestasPorCampana.get(p.campaign_id) ?? []
    lista.push({
      id: p.id,
      campanaId: p.campaign_id,
      campanaNombre: campana.nombre,
      adSetId: p.ad_set_id,
      adSetNombre: p.ad_set_id ? (nombreAdSet.get(p.ad_set_id) ?? null) : null,
      tipo: p.kind,
      razonamiento: p.rationale,
      impacto: p.expected_impact,
      riesgo: p.risk,
      alternativa: leerAlternativa(p.alternative),
      estado: p.status,
      instrucciones: p.instructions,
      aplicadaEn: p.applied_at,
      notaAplicacion: p.applied_note,
      creadaEn: p.created_at,
      // El día se calcula con la fecha en que el Pautero escribió la propuesta,
      // no con hoy: "DÍA 4 DE 7" tiene que seguir diciendo 4 la semana que
      // viene, porque es cuándo se tomó la lectura.
      dia: diaDeCampana(p.created_at, campana.inicio, campana.fin),
    })
    propuestasPorCampana.set(p.campaign_id, lista)
  }

  const campanas: CampanaPauta[] = (campanasRes.data ?? []).map((c) => {
    const adSets = adSetsPorCampana.get(c.id) ?? []
    const totales = totalizar(adSets.flatMap((a) => a.diarias))

    return {
      id: c.id,
      nombre: c.name,
      objetivo: c.objective,
      plataforma: c.platform,
      presupuestoCents: c.budget_cents,
      gastadoCents: totales.dias > 0 ? totales.gastoCents : c.spent_cents,
      inicio: c.start_date,
      fin: c.end_date,
      estado: c.status,
      objetivoAprendizaje: c.learning_goal,
      metricaResultado: c.result_metric,
      aprendizaje: c.learned,
      adSets,
      creativos: creativosPorCampana.get(c.id) ?? [],
      propuestas: propuestasPorCampana.get(c.id) ?? [],
      totales,
    }
  })

  return {
    // Una campaña pausada o en borrador sigue necesitando atención; solo las
    // cerradas se van al histórico. Esconder una pausada sería la forma más
    // fácil de olvidar $800 congelados.
    activas: campanas.filter((c) => c.estado !== 'cerrada'),
    historico: campanas.filter((c) => c.estado === 'cerrada'),
  }
}
