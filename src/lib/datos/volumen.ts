import 'server-only'

import { z } from 'zod'
import { estrategaOutputSchema, evidenceSchema } from '@/agents/contracts'
import { distribucionPorPilar, type DistribucionPilar } from '@/domain/metricas'
import {
  PIECE_FORMAT_LABEL,
  STORY_KIND_LABEL,
  type PieceFormat,
  type StoryKind,
} from '@/domain/labels'
import type { Pilar } from '@/lib/datos/clientes'
import { createClient } from '@/lib/supabase/server'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Lecturas del plan de volumen.
 *
 * El plan es lo que se le presenta al cliente, así que la regla de este archivo
 * es que **ningún número llega a la pantalla sin su razón**. Cuando la razón no
 * existe se dice "sin razón registrada" en vez de inventar una: un renglón que
 * no se puede defender en junta hay que poder verlo desde aquí.
 *
 * Las cantidades salen de `volume_plans`, que es el plan aprobado. Las del mes
 * anterior salen de las piezas que de verdad existieron, no del plan anterior:
 * "↓ de 9" tiene que decir lo que pasó, no lo que se había planeado.
 */

/* -------------------------------------------------------------------------- */
/*  Renglones                                                                  */
/* -------------------------------------------------------------------------- */

export interface RenglonVolumen {
  clave: string
  etiqueta: string
  cantidad: number
  /** Cuántas fueron el mes pasado. `null` en el primer mes del cliente. */
  anterior: number | null
  razon: string
  /** La métrica que sostiene la razón. Vacío cuando el plan no la registró. */
  metrica: string
}

export interface BulletDelEstratega {
  cambio: string
  porque: string
  dato: string
}

export interface PlanDeVolumen {
  mes: MonthKey
  total: number
  feed: RenglonVolumen[]
  totalFeed: number
  stories: RenglonVolumen[]
  totalStories: number
  pilares: DistribucionPilar[]
  /** El bloque "Por qué esta mezcla". Vacío si el Estratega no ha corrido. */
  porque: BulletDelEstratega[]
  capacidadDeclarada: number | null
  notaDeCapacidad: string | null
  aprobadoEn: string | null
}

/* -------------------------------------------------------------------------- */
/*  Schemas de lo que vive en jsonb                                            */
/*                                                                             */
/*  Un jsonb es entrada no confiable igual que un CSV: lo pudo escribir una    */
/*  versión anterior del código o una migración a mano. Se valida al leerlo.   */
/* -------------------------------------------------------------------------- */

const conteos = z.record(z.string(), z.number().int().min(0)).catch({})
const mezclaDePilares = z.record(z.string(), z.number()).catch({})

/**
 * `rationale` tiene dos formas en el mundo real: la del contrato del Estratega
 * (arreglo con evidencia) y el mapa `{formato: "razón"}` que dejó el seed y las
 * capturas a mano. Se aceptan las dos; la segunda no trae métrica y se dice.
 */
const razones = z
  .union([
    z.array(z.object({ change: z.string(), because: z.string(), evidence: evidenceSchema })),
    z.record(z.string(), z.string()),
  ])
  .catch({})

const ORDEN_FEED: readonly PieceFormat[] = ['post', 'carrusel', 'reel']
const ORDEN_STORIES: readonly StoryKind[] = ['diaria', 'campana', 'interactiva']

const SIN_RAZON = 'Sin razón registrada. Pídele al Estratega que recalcule el volumen.'

export async function planDeVolumen(
  clientId: string,
  mes: MonthKey,
  pilares: readonly Pilar[],
): Promise<PlanDeVolumen | null> {
  const supabase = await createClient()
  const mesAnterior = addMonths(mes, -1)

  const [planRes, piezasRes, storiesRes] = await Promise.all([
    supabase
      .from('volume_plans')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', mes)
      .maybeSingle(),
    // Los dos meses en una consulta: el actual da la mezcla real de pilares y
    // el anterior da el "↓ de 9" de cada renglón.
    supabase
      .from('pieces')
      .select('month, format, pillar_id')
      .eq('client_id', clientId)
      .in('month', [mes, mesAnterior]),
    supabase
      .from('stories')
      .select('month, kind')
      .eq('client_id', clientId)
      .in('month', [mes, mesAnterior]),
  ])

  if (planRes.error) throw new Error(`No se pudo leer el plan del mes: ${planRes.error.message}`)
  if (piezasRes.error) throw new Error(`No se pudieron leer las piezas: ${piezasRes.error.message}`)

  if (!planRes.data) return null

  const plan = planRes.data

  const feedCounts = conteos.parse(plan.feed_counts)
  const storyCounts = conteos.parse(plan.story_counts)
  const objetivoPorPilar = mezclaDePilares.parse(plan.pillar_mix)
  const rationale = razones.parse(plan.rationale)

  /* --- Lo que de verdad hubo el mes pasado -------------------------------- */
  const hayMesAnterior = (piezasRes.data ?? []).some((p) => p.month === mesAnterior)
  const feedAnterior = new Map<string, number>()
  for (const pieza of piezasRes.data ?? []) {
    if (pieza.month !== mesAnterior) continue
    feedAnterior.set(pieza.format, (feedAnterior.get(pieza.format) ?? 0) + 1)
  }

  const hayStoriesAnteriores = (storiesRes.data ?? []).some((s) => s.month === mesAnterior)
  const storiesAnterior = new Map<string, number>()
  for (const story of storiesRes.data ?? []) {
    if (story.month !== mesAnterior) continue
    storiesAnterior.set(story.kind, (storiesAnterior.get(story.kind) ?? 0) + 1)
  }

  /* --- Razón por renglón --------------------------------------------------- */
  const razonDe = razonPorClave(rationale)

  const feed: RenglonVolumen[] = ORDEN_FEED.map((formato) => ({
    clave: formato,
    etiqueta: PIECE_FORMAT_LABEL[formato],
    cantidad: feedCounts[formato] ?? 0,
    anterior: hayMesAnterior ? (feedAnterior.get(formato) ?? 0) : null,
    ...razonDe(formato),
  }))

  const stories: RenglonVolumen[] = ORDEN_STORIES.map((tipo) => ({
    clave: tipo,
    etiqueta: STORY_KIND_LABEL[tipo],
    cantidad: storyCounts[tipo] ?? 0,
    anterior: hayStoriesAnteriores ? (storiesAnterior.get(tipo) ?? 0) : null,
    ...razonDe(tipo),
  }))

  /* --- Distribución por pilar ---------------------------------------------- */
  // El % REAL sale de las piezas que ya existen en el planner; el objetivo, del
  // plan. Enseñar el objetivo en las dos columnas haría que la barra siempre
  // saliera perfecta, que es justo lo que la sección tiene que poder desmentir.
  const piezasPorPilar = new Map<string, number>()
  for (const pieza of piezasRes.data ?? []) {
    if (pieza.month !== mes || !pieza.pillar_id) continue
    piezasPorPilar.set(pieza.pillar_id, (piezasPorPilar.get(pieza.pillar_id) ?? 0) + 1)
  }

  const distribucion = distribucionPorPilar(
    pilares.map((p) => ({
      id: p.id,
      nombre: p.name,
      color: p.color,
      objetivoPct: objetivoPorPilar[p.id] ?? p.targetPct,
    })),
    piezasPorPilar,
  )

  const totalFeed = feed.reduce((a, r) => a + r.cantidad, 0)
  const totalStories = stories.reduce((a, r) => a + r.cantidad, 0)

  const delEstratega = await razonamientoDelEstratega(clientId, mes)

  return {
    mes,
    total: totalFeed + totalStories,
    feed,
    totalFeed,
    stories,
    totalStories,
    pilares: distribucion,
    porque: delEstratega?.bullets ?? bulletsDeRespaldo(rationale),
    capacidadDeclarada: plan.capacity_declared,
    notaDeCapacidad: delEstratega?.notaDeCapacidad ?? null,
    aprobadoEn: plan.approved_at,
  }
}

type Rationale = z.infer<typeof razones>

/** Busca la razón de un renglón en cualquiera de las dos formas de `rationale`. */
function razonPorClave(rationale: Rationale) {
  return (clave: string): { razon: string; metrica: string } => {
    if (Array.isArray(rationale)) {
      // En la forma del contrato la razón no viene indexada por formato, así
      // que se busca por mención. Es heurístico y por eso el fallback existe.
      const bullet = rationale.find((r) => r.change.toLowerCase().includes(clave))
      if (bullet) return { razon: bullet.because, metrica: bullet.evidence.text }
      return { razon: SIN_RAZON, metrica: '' }
    }
    const texto = rationale[clave]
    return texto ? { razon: texto, metrica: '' } : { razon: SIN_RAZON, metrica: '' }
  }
}

/** Cuando no hay corrida del Estratega, al menos se muestran las razones guardadas. */
function bulletsDeRespaldo(rationale: Rationale): BulletDelEstratega[] {
  if (Array.isArray(rationale)) {
    return rationale.map((r) => ({ cambio: r.change, porque: r.because, dato: r.evidence.text }))
  }
  return Object.entries(rationale).map(([clave, texto]) => ({
    cambio: clave,
    porque: texto,
    dato: '',
  }))
}

const entradaDeCorrida = z.object({ month: z.string() })

/**
 * El bloque "Por qué esta mezcla" sale de la última corrida del Estratega para
 * ese mes, no del jsonb del plan: la corrida trae la evidencia con su número, y
 * el jsonb del plan solo guarda el texto.
 *
 * Igual que en Resultados, aquí NO se corre el agente. Una lectura de página
 * que dispara una corrida es gasto sin control y sin quién la pidió.
 */
async function razonamientoDelEstratega(
  clientId: string,
  mes: MonthKey,
): Promise<{ bullets: BulletDelEstratega[]; notaDeCapacidad: string } | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('agent_runs')
    .select('input, output')
    .eq('client_id', clientId)
    .eq('agent', 'estratega')
    .eq('status', 'ok')
    .order('started_at', { ascending: false })
    .limit(10)

  if (error) return null

  for (const corrida of data ?? []) {
    const entrada = entradaDeCorrida.safeParse(corrida.input)
    if (!entrada.success || entrada.data.month !== mes) continue

    const salida = estrategaOutputSchema.safeParse(corrida.output)
    if (!salida.success || salida.data.kind !== 'resultado') continue

    return {
      bullets: salida.data.data.rationale.map((r) => ({
        cambio: r.change,
        porque: r.because,
        dato: r.evidence.text,
      })),
      notaDeCapacidad: salida.data.data.capacity_note,
    }
  }

  return null
}

/* -------------------------------------------------------------------------- */
/*  Texto para presentación                                                    */
/* -------------------------------------------------------------------------- */

/**
 * El plan en texto plano, listo para pegar en un correo o en una presentación.
 *
 * Vive del lado del servidor y no en el botón porque el texto que se le manda
 * al cliente es un entregable: tiene que ser idéntico venga de donde venga, y
 * armarlo en el navegador significa que un cambio de formato solo se ve cuando
 * alguien vuelve a dar clic.
 */
export function planComoTexto(plan: PlanDeVolumen, cliente: string, mesLegible: string): string {
  const linea = (r: RenglonVolumen) => {
    // Sin flechas ni símbolos: este texto se pega en un correo y las flechas
    // unicode se rompen en la mitad de los clientes de correo.
    const variacion =
      r.anterior === null
        ? ''
        : r.cantidad === r.anterior
          ? '  (igual)'
          : `  (${r.cantidad > r.anterior ? 'sube' : 'baja'} de ${r.anterior})`
    return `  ${r.etiqueta.padEnd(16)} ${String(r.cantidad).padStart(3)}${variacion}\n      ${r.razon}`
  }

  const bloques = [
    `${cliente.toUpperCase()} · ${mesLegible.toUpperCase()}`,
    `${plan.total} piezas`,
    '',
    `FEED (${plan.totalFeed})`,
    ...plan.feed.map(linea),
    '',
    `STORIES (${plan.totalStories})`,
    ...plan.stories.map(linea),
    '',
    'DISTRIBUCIÓN POR PILAR',
    ...plan.pilares.map(
      (p) =>
        `  ${p.nombre.padEnd(24)} ${Math.round(p.pct)}%   objetivo ${Math.round(p.objetivoPct)}%${
          p.fueraDeRango ? '   revisar' : ''
        }`,
    ),
  ]

  if (plan.porque.length > 0) {
    bloques.push('', 'POR QUÉ ESTA MEZCLA')
    for (const b of plan.porque) {
      bloques.push(`  · ${b.cambio}: ${b.porque}${b.dato ? ` (${b.dato})` : ''}`)
    }
  }

  return bloques.join('\n')
}
