import 'server-only'

import { z } from 'zod'
import { codeRuleParams } from '@/domain/brand-rules'
import type { AgentKey, PieceFormat, RuleCheck, RuleSeverity } from '@/domain/labels'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de las cinco secciones de abajo del dashboard: Redes, Marca,
 * Archivos, Pendientes y Privado.
 *
 * Igual que en `clientes.ts`, ninguna consulta filtra por org a mano: lo hace
 * RLS. El `client_id` sí se pasa, pero como filtro de negocio ("las cuentas de
 * este cliente"), no como control de acceso — si se le olvidara, la base
 * seguiría sin entregar datos de otra agencia.
 *
 * Caso aparte y el más importante del archivo: `private_notes`. Su política
 * exige `author_id = auth.uid()`, así que la consulta de aquí NO lleva ese
 * filtro. Repetirlo en TypeScript daría la falsa impresión de que la
 * privacidad depende de esta línea, y el día que alguien la borre en un
 * refactor nadie sabría que era la que importaba. La base es la que decide.
 */

/* ==========================================================================
   § REDES
   ========================================================================== */

export interface CuentaDeRed {
  id: string
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin'
  handle: string | null
  url: string | null
  followers: number
  followersDelta: number
  lastPostAt: string | null
  /** jsonb libre; se interpreta con `leerChecklist` de `@/domain/redes`. */
  profileChecklist: unknown
  unansweredDms: number
  unansweredComments: number
  postsPerWeek: number
  targetPerWeek: number
  checkedAt: string | null
}

/** Orden fijo, no alfabético: es el peso que tienen las redes para el estudio. */
const ORDEN_PLATAFORMA = ['instagram', 'facebook', 'tiktok', 'linkedin'] as const

export async function listarRedes(clientId: string): Promise<CuentaDeRed[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('client_id', clientId)

  if (error) throw new Error(`No se pudieron leer las cuentas de redes: ${error.message}`)

  return (data ?? [])
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      handle: r.handle,
      url: r.url,
      followers: r.followers,
      followersDelta: r.followers_delta,
      lastPostAt: r.last_post_at,
      profileChecklist: r.profile_checklist,
      unansweredDms: r.unanswered_dms,
      unansweredComments: r.unanswered_comments,
      // numeric(5,2) llega como number en el cliente de JS, pero el tipo
      // generado no lo garantiza en todas las versiones. Number() lo fija.
      postsPerWeek: Number(r.posts_per_week),
      targetPerWeek: Number(r.target_per_week),
      checkedAt: r.checked_at,
    }))
    .sort((a, b) => ORDEN_PLATAFORMA.indexOf(a.platform) - ORDEN_PLATAFORMA.indexOf(b.platform))
}

/* ==========================================================================
   § MARCA — el Context Card
   ========================================================================== */

export interface PreguntaFrecuente {
  pregunta: string
  respuesta: string
}

/**
 * Las FAQs son jsonb, o sea que la forma no la garantiza la base.
 *
 * Se acepta también `{q, a}` porque así las escribió el primer agente que las
 * generó y ya hay filas con esa forma. Una entrada que no cuadre con ninguna
 * de las dos se descarta en silencio en vez de tumbar la sección completa: una
 * FAQ mal formada no vale una pantalla en blanco.
 */
const faqSchema = z.union([
  z.object({ pregunta: z.string().min(1), respuesta: z.string() }),
  z.object({ q: z.string().min(1), a: z.string() }).transform((v) => ({
    pregunta: v.q,
    respuesta: v.a,
  })),
])

function leerFaqs(valor: unknown): PreguntaFrecuente[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    const parsed = faqSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export interface ContextCard {
  id: string
  version: number
  whatItIs: string | null
  positioning: string | null
  differentiators: string[]
  faqs: PreguntaFrecuente[]
  audience: string | null
  tone: string[]
  bannedWords: string[]
  approvedExamples: string[]
  cadence: string | null
  createdAt: string
}

export async function obtenerContextCard(clientId: string): Promise<ContextCard | null> {
  const supabase = await createClient()

  // La tabla es append-only: la versión vigente es simplemente la más alta.
  const { data, error } = await supabase
    .from('context_card_versions')
    .select('*')
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer el documento de marca: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    version: data.version,
    whatItIs: data.what_it_is,
    positioning: data.positioning,
    differentiators: data.differentiators ?? [],
    faqs: leerFaqs(data.faqs),
    audience: data.audience,
    tone: data.tone ?? [],
    bannedWords: data.banned_words ?? [],
    approvedExamples: data.approved_examples ?? [],
    cadence: data.cadence,
    createdAt: data.created_at,
  }
}

export interface VersionDeMarca {
  id: string
  version: number
  createdAt: string
  /** `null` = la escribió una persona. Cualquier otro valor es procedencia de agente. */
  createdByAgent: AgentKey | null
}

export async function historialDeMarca(clientId: string): Promise<VersionDeMarca[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('context_card_versions')
    .select('id, version, created_at, created_by_agent')
    .eq('client_id', clientId)
    .order('version', { ascending: false })

  if (error) throw new Error(`No se pudo leer el historial de marca: ${error.message}`)

  return (data ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    createdAt: v.created_at,
    createdByAgent: v.created_by_agent,
  }))
}

/* ==========================================================================
   § MARCA — reglas duras
   ========================================================================== */

export interface ReglaDura {
  id: string
  kind: string
  rule: string
  severity: RuleSeverity
  checkBy: RuleCheck
  /**
   * Solo importa cuando `checkBy === 'codigo'`: dice si `checkCodeRules` sabe
   * leer los parámetros. Se calcula aquí y no en el componente porque la
   * respuesta la da `@/domain/brand-rules`, que es código de negocio.
   */
  verificable: boolean
}

export async function listarReglasDuras(clientId: string): Promise<ReglaDura[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('brand_rules')
    .select('id, kind, rule, severity, check_by, params')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('severity')
    .order('created_at')

  if (error) throw new Error(`No se pudieron leer las reglas duras: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    rule: r.rule,
    severity: r.severity,
    checkBy: r.check_by,
    verificable: r.check_by === 'modelo' || codeRuleParams.safeParse(r.params).success,
  }))
}

/* ==========================================================================
   § MARCA — aprendizaje
   ========================================================================== */

export interface PiezaConNumeros {
  id: string
  hook: string | null
  format: PieceFormat
  publishAt: string | null
  pillarId: string | null
  reach: number
  saves: number
}

export interface CorreccionAprendida {
  id: string
  field: string
  oldValue: string | null
  newValue: string | null
  agent: AgentKey | null
  createdAt: string
}

export interface AprendizajeDeMarca {
  top: PiezaConNumeros[]
  ultimas: PiezaConNumeros[]
  correcciones: CorreccionAprendida[]
}

/**
 * Lo que el Analista sabe de la marca a fuerza de mirar resultados.
 *
 * Las correcciones salen de `human_edits` y no de un campo de texto escrito a
 * mano: esa tabla es el criterio de la marca aprendido de verdad, y es la
 * única fuente que no envejece sola.
 */
export async function aprendizajeDeMarca(clientId: string): Promise<AprendizajeDeMarca> {
  const supabase = await createClient()

  const [resultadosRes, publicadasRes, edicionesRes] = await Promise.all([
    supabase
      .from('results_piece')
      .select('piece_id, reach, saves')
      .eq('client_id', clientId)
      .order('reach', { ascending: false })
      .limit(5),
    supabase
      .from('pieces')
      .select('id, hook, format, publish_at, pillar_id')
      .eq('client_id', clientId)
      .eq('status', 'publicado')
      .order('publish_at', { ascending: false })
      .limit(3),
    supabase
      .from('human_edits')
      .select('id, field, old_value, new_value, agent, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const primerError = resultadosRes.error ?? publicadasRes.error ?? edicionesRes.error
  if (primerError) throw new Error(`No se pudo leer el aprendizaje: ${primerError.message}`)

  const numeros = new Map(
    (resultadosRes.data ?? []).map(
      (r) => [r.piece_id, { reach: r.reach, saves: r.saves }] as const,
    ),
  )

  // Las piezas del top se traen en una sola consulta por id, no una por pieza.
  const idsTop = [...numeros.keys()]
  const { data: piezasTop, error: errorTop } = idsTop.length
    ? await supabase
        .from('pieces')
        .select('id, hook, format, publish_at, pillar_id')
        .in('id', idsTop)
    : { data: [], error: null }

  if (errorTop) throw new Error(`No se pudieron leer las piezas del top: ${errorTop.message}`)

  const conNumeros = (p: {
    id: string
    hook: string | null
    format: PieceFormat
    publish_at: string | null
    pillar_id: string | null
  }): PiezaConNumeros => ({
    id: p.id,
    hook: p.hook,
    format: p.format,
    publishAt: p.publish_at,
    pillarId: p.pillar_id,
    reach: numeros.get(p.id)?.reach ?? 0,
    saves: numeros.get(p.id)?.saves ?? 0,
  })

  return {
    // El orden lo manda `results_piece`, no la consulta de piezas: `in()` no
    // conserva el orden de los ids que se le pasan.
    top: idsTop.flatMap((id) => {
      const pieza = (piezasTop ?? []).find((p) => p.id === id)
      return pieza ? [conNumeros(pieza)] : []
    }),
    ultimas: (publicadasRes.data ?? []).map(conNumeros),
    correcciones: (edicionesRes.data ?? []).map((e) => ({
      id: e.id,
      field: e.field,
      oldValue: e.old_value,
      newValue: e.new_value,
      agent: e.agent,
      createdAt: e.created_at,
    })),
  }
}

/* ==========================================================================
   § ARCHIVOS
   ========================================================================== */

export interface Archivo {
  id: string
  kind: string
  name: string
  url: string | null
  notes: string | null
}

export async function listarArchivos(clientId: string): Promise<Archivo[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('brand_assets')
    .select('id, kind, name, url, notes')
    .eq('client_id', clientId)
    .order('kind')
    .order('name')

  if (error) throw new Error(`No se pudieron leer los archivos: ${error.message}`)

  return (data ?? []).map((a) => ({
    id: a.id,
    kind: a.kind,
    name: a.name,
    url: a.url,
    notes: a.notes,
  }))
}

/* ==========================================================================
   § PENDIENTES
   ========================================================================== */

export interface Tarea {
  id: string
  title: string
  dependsOn: 'yo' | 'cliente' | 'agente'
  status: 'pendiente' | 'en_curso' | 'bloqueada' | 'hecha'
  dueDate: string | null
}

export async function listarTareas(clientId: string): Promise<Tarea[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, depends_on, status, due_date')
    .eq('client_id', clientId)
    // Sin fecha al final: una tarea sin fecha límite no es la más urgente.
    .order('due_date', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`No se pudieron leer los pendientes: ${error.message}`)

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    dependsOn: t.depends_on,
    status: t.status,
    dueDate: t.due_date,
  }))
}

export interface EventoPendiente {
  id: string
  title: string
  scheduledOn: string
  place: string | null
  notes: string | null
  /** Piezas que se quedan sin material si el evento no se cubre. */
  piezasEnEspera: Array<{ id: string; hook: string | null; format: PieceFormat }>
}

/**
 * Los eventos y sesiones que todavía no pasan.
 *
 * Ojo con `piezasEnEspera`: hoy **no existe** una llave entre `events` y
 * `pieces`, así que la relación se deriva por mes — las piezas de ese mes con
 * el asset todavía pendiente. Es una aproximación honesta y sirve para la
 * conversación ("si no se cubre esto, estas cinco no salen"), pero cuando la
 * tabla gane un `piece_ids` hay que reemplazar esto por la relación real. La
 * interfaz dice que la relación es por mes para que nadie la lea como exacta.
 */
export async function listarEventosPendientes(
  clientId: string,
  desde: string,
): Promise<EventoPendiente[]> {
  const supabase = await createClient()

  const { data: eventos, error } = await supabase
    .from('events')
    .select('id, title, scheduled_on, place, notes')
    .eq('client_id', clientId)
    .gte('scheduled_on', desde)
    .order('scheduled_on')

  if (error) throw new Error(`No se pudieron leer los eventos: ${error.message}`)
  if (!eventos?.length) return []

  const meses = [...new Set(eventos.map((e) => e.scheduled_on.slice(0, 7)))]

  const { data: piezas, error: errorPiezas } = await supabase
    .from('pieces')
    .select('id, hook, format, month')
    .eq('client_id', clientId)
    .eq('asset_status', 'pendiente')
    .in('month', meses)

  if (errorPiezas) {
    throw new Error(`No se pudieron leer las piezas en espera: ${errorPiezas.message}`)
  }

  return eventos.map((e) => ({
    id: e.id,
    title: e.title,
    scheduledOn: e.scheduled_on,
    place: e.place,
    notes: e.notes,
    piezasEnEspera: (piezas ?? [])
      .filter((p) => p.month === e.scheduled_on.slice(0, 7))
      .map((p) => ({ id: p.id, hook: p.hook, format: p.format })),
  }))
}

/* ==========================================================================
   § PRIVADO
   ========================================================================== */

export interface NotaPrivada {
  id: string
  body: string
  updatedAt: string
}

/**
 * Sin filtro por autor a propósito. Lo pone la política de RLS
 * `private_notes: solo quien las escribió`, y duplicarlo aquí escondería cuál
 * de las dos capas es la que de verdad protege la nota.
 */
export async function listarNotasPrivadas(clientId: string): Promise<NotaPrivada[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('private_notes')
    .select('id, body, updated_at')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`No se pudieron leer las notas privadas: ${error.message}`)

  return (data ?? []).map((n) => ({ id: n.id, body: n.body, updatedAt: n.updated_at }))
}
