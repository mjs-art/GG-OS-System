import 'server-only'

import { z } from 'zod'
import { fechaLocal } from '@/domain/calendario'
import type { PieceFormat, Platform } from '@/domain/labels'
import type { ScriptStatus, TrendKind, TrendMomentum } from '@/domain/tendencias'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de guiones y del radar de tendencias.
 *
 * Ninguna consulta filtra por org a mano. Lo hace RLS, y la asimetría que eso
 * produce es exactamente la que queremos: `scripts` va por cliente y `trends`
 * va por org. Un audio que despega le sirve a varios clientes a la vez; obligar
 * a capturarlo una vez por cliente perdería justo lo que hace útil al radar.
 */

/* -------------------------------------------------------------------------- */
/*  Tendencias — del ORG                                                       */
/* -------------------------------------------------------------------------- */

export interface Tendencia {
  id: string
  plataforma: Platform
  tipo: TrendKind
  titulo: string
  audioUrl: string | null
  referenciaUrl: string | null
  momentum: TrendMomentum
  /** `AAAA-MM-DD` en la zona del estudio, no en UTC. */
  vistaEl: string
  notas: string | null
  verticales: string[]
}

export async function listarTendencias(): Promise<Tendencia[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('trends')
    .select(
      'id, platform, kind, title, audio_url, reference_url, momentum, spotted_at, notes, verticals',
    )
    .order('spotted_at', { ascending: false })

  if (error) throw new Error(`No se pudo leer el radar de tendencias: ${error.message}`)

  return (data ?? []).map(normalizarTendencia)
}

interface RenglonTendencia {
  id: string
  platform: Platform
  kind: TrendKind
  title: string
  audio_url: string | null
  reference_url: string | null
  momentum: TrendMomentum
  spotted_at: string
  notes: string | null
  verticals: string[] | null
}

function normalizarTendencia(t: RenglonTendencia): Tendencia {
  return {
    id: t.id,
    plataforma: t.platform,
    tipo: t.kind,
    titulo: t.title,
    audioUrl: t.audio_url,
    referenciaUrl: t.reference_url,
    momentum: t.momentum,
    // `spotted_at` es timestamptz. Cortarlo a diez caracteres daría el día en
    // UTC, y una tendencia capturada a las 6 de la tarde en Tijuana aparecería
    // registrada mañana. Se resuelve a día calendario del estudio aquí, una vez.
    vistaEl: fechaLocal(new Date(t.spotted_at)),
    notas: t.notes,
    verticales: t.verticals ?? [],
  }
}

/* -------------------------------------------------------------------------- */
/*  Guiones — del cliente                                                      */
/* -------------------------------------------------------------------------- */

export interface Escena {
  desde: number
  hasta: number
  plano: string
  accion: string
  textoEnPantalla: string | null
  voz: string | null
}

export interface Guion {
  id: string
  estado: ScriptStatus
  fitScore: number | null
  fitReason: string | null
  duracionS: number | null
  escenas: Escena[]
  requiere: string | null
  alternativa: string | null
  /** La pieza a la que se amarra el guion. `null` cuando todavía no tiene una. */
  piezaId: string | null
  pilarId: string | null
  formato: PieceFormat | null
  publicaEl: string | null
  tendencia: Tendencia | null
}

/**
 * Las escenas viven en jsonb y jsonb no valida nada.
 *
 * Se parsea con Zod al leer y no solo al escribir porque el contenido puede
 * haber entrado por una corrida de agente vieja, por el seed o por SQL a mano.
 * Un `scenes[0].shot` que resulta ser `undefined` en el render no rompe: pinta
 * una fila vacía y nadie se entera hasta que alguien intenta grabar con eso.
 *
 * Acepta las dos formas del nombre porque el contrato del Guionista usa
 * `from_s`/`to_s` y el comentario del esquema documenta `from`/`to`. Mientras
 * las dos existan en la base, leer solo una perdería guiones en silencio.
 */
const escenaSchema = z
  .object({
    from_s: z.number().optional(),
    to_s: z.number().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
    shot: z.string().nullish(),
    action: z.string().nullish(),
    on_screen_text: z.string().nullish(),
    vo: z.string().nullish(),
  })
  .transform((s) => ({
    desde: s.from_s ?? s.from ?? 0,
    hasta: s.to_s ?? s.to ?? 0,
    plano: s.shot ?? '—',
    accion: s.action ?? '—',
    textoEnPantalla: s.on_screen_text ?? null,
    voz: s.vo ?? null,
  }))

const escenasSchema = z.array(escenaSchema).catch([])

export async function listarGuiones(clientId: string): Promise<Guion[]> {
  const supabase = await createClient()

  const { data: guiones, error } = await supabase
    .from('scripts')
    .select(
      'id, status, fit_score, fit_reason, duration_s, scenes, requirements, alternative, piece_id, trend_id, created_at',
    )
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`No se pudieron leer los guiones: ${error.message}`)
  if (!guiones?.length) return []

  const piezaIds = guiones.map((g) => g.piece_id).filter((id): id is string => id !== null)
  const tendenciaIds = guiones.map((g) => g.trend_id).filter((id): id is string => id !== null)

  // Dos consultas por lote en vez de un embed de PostgREST: las llaves foráneas
  // de `scripts` son compuestas (piece_id + client_id, trend_id + org_id) y el
  // embed obliga a nombrar la constraint, que es un acoplamiento al nombre de
  // un objeto de la migración.
  const [piezasRes, tendenciasRes] = await Promise.all([
    piezaIds.length
      ? supabase.from('pieces').select('id, format, publish_at, pillar_id').in('id', piezaIds)
      : Promise.resolve({ data: [], error: null }),
    tendenciaIds.length
      ? supabase
          .from('trends')
          .select(
            'id, platform, kind, title, audio_url, reference_url, momentum, spotted_at, notes, verticals',
          )
          .in('id', tendenciaIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  const primerError = piezasRes.error ?? tendenciasRes.error
  if (primerError) {
    throw new Error(`No se pudo completar la lectura de guiones: ${primerError.message}`)
  }

  const piezas = new Map((piezasRes.data ?? []).map((p) => [p.id, p] as const))
  const tendencias = new Map(
    (tendenciasRes.data ?? []).map((t) => [t.id, normalizarTendencia(t)] as const),
  )

  return guiones.map((g) => {
    const pieza = g.piece_id ? piezas.get(g.piece_id) : undefined

    return {
      id: g.id,
      estado: g.status,
      fitScore: g.fit_score,
      fitReason: g.fit_reason,
      duracionS: g.duration_s,
      escenas: escenasSchema.parse(g.scenes),
      requiere: g.requirements,
      alternativa: g.alternative,
      piezaId: g.piece_id,
      pilarId: pieza?.pillar_id ?? null,
      formato: pieza?.format ?? null,
      publicaEl: pieza?.publish_at ?? null,
      tendencia: g.trend_id ? (tendencias.get(g.trend_id) ?? null) : null,
    }
  })
}
