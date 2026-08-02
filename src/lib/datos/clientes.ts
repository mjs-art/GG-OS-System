import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { addMonths, toMonthKey, type MonthKey } from '@/lib/time'
import type { PieceStatus } from '@/domain/labels'

/**
 * Lecturas del estudio.
 *
 * Ninguna de estas funciones filtra por org ni por cliente a mano, y eso es a
 * propósito: lo hace RLS. Si una consulta de aquí devolviera datos de otra
 * agencia sería un bug de la base, no de este archivo — y hay pruebas de pgTAP
 * que lo verifican. Escribir el `where` aquí además daría una falsa sensación
 * de seguridad el día que alguien escriba una consulta nueva sin él.
 */

export interface ResumenCliente {
  id: string
  slug: string
  name: string
  handle: string | null
  tier: string | null
  brandColor: string | null
  /** Conteo de piezas del mes por estado. Alimenta la barra de pipeline. */
  pipeline: Record<PieceStatus, number>
  totalMes: number
  aprobadas: number
  proximaPublicacion: string | null
}

const PIPELINE_VACIO: Record<PieceStatus, number> = {
  idea: 0,
  escrito: 0,
  revisado: 0,
  con_cliente: 0,
  aprobado: 0,
  publicado: 0,
}

export async function listarClientes(mes: MonthKey): Promise<ResumenCliente[]> {
  const supabase = await createClient()

  const { data: clientes, error } = await supabase
    .from('clients')
    .select('id, slug, name, handle, tier, brand_color')
    .is('archived_at', null)
    .order('name')

  if (error) throw new Error(`No se pudieron leer los clientes: ${error.message}`)
  if (!clientes?.length) return []

  // Una sola consulta para las piezas de todos los clientes del mes, en vez de
  // una por cliente. Con 11 clientes eso es la diferencia entre 1 y 12 viajes.
  const { data: piezas, error: errorPiezas } = await supabase
    .from('pieces')
    .select('client_id, status, publish_at')
    .eq('month', mes)

  if (errorPiezas) throw new Error(`No se pudieron leer las piezas: ${errorPiezas.message}`)

  const porCliente = new Map<string, { pipeline: Record<PieceStatus, number>; fechas: string[] }>()
  for (const pieza of piezas ?? []) {
    const entrada = porCliente.get(pieza.client_id) ?? {
      pipeline: { ...PIPELINE_VACIO },
      fechas: [],
    }
    entrada.pipeline[pieza.status] += 1
    if (pieza.publish_at) entrada.fechas.push(pieza.publish_at)
    porCliente.set(pieza.client_id, entrada)
  }

  return clientes.map((c) => {
    const datos = porCliente.get(c.id)
    const pipeline = datos?.pipeline ?? { ...PIPELINE_VACIO }
    const total = Object.values(pipeline).reduce((a, b) => a + b, 0)

    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      handle: c.handle,
      tier: c.tier,
      brandColor: c.brand_color,
      pipeline,
      totalMes: total,
      aprobadas: pipeline.aprobado + pipeline.publicado,
      proximaPublicacion: datos?.fechas.sort()[0] ?? null,
    }
  })
}

export interface Pilar {
  id: string
  name: string
  color: string
  targetPct: number
  position: number
}

export interface Cliente {
  id: string
  orgId: string
  slug: string
  name: string
  handle: string | null
  tier: string | null
  brandColor: string | null
  timezone: string
  pilares: Pilar[]
}

export async function obtenerCliente(slug: string): Promise<Cliente | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select(
      'id, org_id, slug, name, handle, tier, brand_color, timezone, pillars(id, name, color, target_pct, position)',
    )
    .eq('slug', slug)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer el cliente: ${error.message}`)
  if (!data) return null

  return {
    id: data.id,
    orgId: data.org_id,
    slug: data.slug,
    name: data.name,
    handle: data.handle,
    tier: data.tier,
    brandColor: data.brand_color,
    timezone: data.timezone,
    pilares: (data.pillars ?? [])
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        targetPct: Number(p.target_pct),
        position: p.position,
      }))
      .sort((a, b) => a.position - b.position),
  }
}

export interface Pieza {
  id: string
  pillarId: string | null
  month: MonthKey
  format: 'post' | 'carrusel' | 'reel'
  status: PieceStatus
  platforms: string[]
  publishAt: string | null
  slotIndex: number
  dateLocked: boolean
  idea: string | null
  hook: string | null
  script: string | null
  copyIn: string | null
  copyOut: string | null
  cta: string | null
  hashtags: string[]
  assetStatus: 'pendiente' | 'recibido'
  /**
   * Ruta en el bucket `piezas` con diagonal inicial (`/{client}/{pieza}/{archivo}`)
   * si es subida, o la URL completa si es un enlace externo. Es privada: para
   * mostrarla hace falta firmarla en el servidor. Ver `urlsDeAssets`.
   */
  assetUrl: string | null
  assetSource: AssetSource | null
  /** `AAAA-MM-DD`. La fecha de ENTREGA, que no es la de publicación. */
  dueDate: string | null
  assigneeId: string | null
  sprintId: string | null
  boosted: boolean
  /** Qué agente escribió cada campo. Vacío = lo escribió una persona. */
  authoredBy: Record<string, string>
}

export type AssetSource = 'subido' | 'enlace'

export async function listarPiezas(clientId: string, mes: MonthKey): Promise<Pieza[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('pieces')
    .select('*')
    .eq('client_id', clientId)
    .eq('month', mes)
    .order('slot_index')

  if (error) throw new Error(`No se pudieron leer las piezas: ${error.message}`)

  return (data ?? []).map((p) => ({
    id: p.id,
    pillarId: p.pillar_id,
    month: p.month as MonthKey,
    format: p.format,
    status: p.status,
    platforms: p.platforms ?? [],
    publishAt: p.publish_at,
    slotIndex: p.slot_index,
    dateLocked: p.date_locked,
    idea: p.idea,
    hook: p.hook,
    script: p.script,
    copyIn: p.copy_in,
    copyOut: p.copy_out,
    cta: p.cta,
    hashtags: p.hashtags ?? [],
    assetStatus: p.asset_status,
    // El CHECK de la base ya garantiza que `asset_source` solo puede ser uno de
    // los dos valores, y que va acompañado de `asset_url` o no va. El generador
    // de tipos la ve como `text` porque es un CHECK y no un enum.
    assetUrl: p.asset_url,
    assetSource: p.asset_source as AssetSource | null,
    dueDate: p.due_date,
    assigneeId: p.assignee_id,
    sprintId: p.sprint_id,
    boosted: p.boosted,
    authoredBy: (p.authored_by ?? {}) as Record<string, string>,
  }))
}

export interface Story {
  id: string
  month: MonthKey
  scheduledOn: string
  kind: 'diaria' | 'campana' | 'interactiva'
  status: PieceStatus
  slides: Array<{ copy?: string; sticker?: string }>
}

export async function listarStories(clientId: string, mes: MonthKey): Promise<Story[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('client_id', clientId)
    .eq('month', mes)
    .order('scheduled_on')

  if (error) throw new Error(`No se pudieron leer las stories: ${error.message}`)

  return (data ?? []).map((s) => ({
    id: s.id,
    month: s.month as MonthKey,
    scheduledOn: s.scheduled_on,
    kind: s.kind,
    status: s.status,
    slides: (s.slides ?? []) as Array<{ copy?: string; sticker?: string }>,
  }))
}

/** Los meses que ofrece el selector: seis atrás, seis adelante. */
export function mesesNavegables(actual: MonthKey): MonthKey[] {
  return Array.from({ length: 13 }, (_, i) => addMonths(actual, i - 6))
}

export function mesActual(ahora: Date): MonthKey {
  return toMonthKey(ahora)
}
