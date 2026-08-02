import 'server-only'

import type { EntradaCalendario } from '@/components/calendario/rejilla-mes'
import { PIECE_FORMAT_LABEL, STORY_KIND_LABEL } from '@/domain/labels'
import { createClient } from '@/lib/supabase/server'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Las entradas del calendario, ya normalizadas para la rejilla.
 *
 * La normalización vive del lado del servidor y no en el componente a
 * propósito: así la vista de un cliente y la de todos comparten exactamente el
 * mismo formato, y la rejilla no tiene que saber de dónde vino nada.
 */

export interface FiltroCalendario {
  /** Sin `clientId` trae los de todos los clientes visibles. */
  clientId?: string
  mes: MonthKey
}

export async function entradasDelMes({
  clientId,
  mes,
}: FiltroCalendario): Promise<EntradaCalendario[]> {
  const supabase = await createClient()

  // Un mes en due_date no es una columna como en pieces/stories: se acota por
  // rango de fechas, `[inicioMes, finMes)`.
  const inicioMes = `${mes}-01`
  const finMes = `${addMonths(mes, 1)}-01`

  // Los colores salen de los pilares en la vista de un cliente y de la marca
  // en la global. Se traen los dos y decide el llamador cuál usar.
  const [clientesRes, pilaresRes, piezasRes, storiesRes, tareasRes] = await Promise.all([
    supabase.from('clients').select('id, slug, name, brand_color').is('archived_at', null),
    supabase.from('pillars').select('id, color'),
    (() => {
      const q = supabase
        .from('pieces')
        .select('id, client_id, pillar_id, format, hook, idea, publish_at, status')
        .eq('month', mes)
        .not('publish_at', 'is', null)
      return clientId ? q.eq('client_id', clientId) : q
    })(),
    (() => {
      const q = supabase
        .from('stories')
        .select('id, client_id, kind, scheduled_on, status')
        .eq('month', mes)
      return clientId ? q.eq('client_id', clientId) : q
    })(),
    (() => {
      const q = supabase
        .from('tasks')
        .select('id, client_id, title, due_date')
        .gte('due_date', inicioMes)
        .lt('due_date', finMes)
      return clientId ? q.eq('client_id', clientId) : q
    })(),
  ])

  const primerError =
    clientesRes.error ?? pilaresRes.error ?? piezasRes.error ?? storiesRes.error ?? tareasRes.error
  if (primerError) {
    throw new Error(`No se pudo leer el calendario: ${primerError.message}`)
  }

  const clientes = new Map((clientesRes.data ?? []).map((c) => [c.id, c] as const))
  const colorPilar = new Map((pilaresRes.data ?? []).map((p) => [p.id, p.color] as const))

  /** En la vista global el color identifica al cliente; en la de un cliente, al pilar. */
  const global = !clientId

  const entradas: EntradaCalendario[] = []

  for (const p of piezasRes.data ?? []) {
    const cliente = clientes.get(p.client_id)
    if (!cliente) continue

    const color = global
      ? (cliente.brand_color ?? 'var(--color-accent)')
      : (colorPilar.get(p.pillar_id ?? '') ?? 'var(--color-line)')

    entradas.push({
      id: p.id,
      fecha: p.publish_at ?? '',
      titulo: p.hook ?? p.idea ?? 'Sin hook todavía',
      tipo: 'pieza',
      color,
      etiqueta: global ? cliente.name : PIECE_FORMAT_LABEL[p.format],
      href: `/cliente/${cliente.slug}?mes=${mes}#planner`,
    })
  }

  for (const s of storiesRes.data ?? []) {
    const cliente = clientes.get(s.client_id)
    if (!cliente) continue

    entradas.push({
      id: s.id,
      fecha: s.scheduled_on,
      titulo: STORY_KIND_LABEL[s.kind],
      tipo: 'story',
      color: global ? (cliente.brand_color ?? 'var(--color-fg-muted)') : 'var(--color-fg-muted)',
      ...(global ? { etiqueta: cliente.name } : {}),
    })
  }

  for (const t of tareasRes.data ?? []) {
    const cliente = clientes.get(t.client_id)
    if (!cliente || !t.due_date) continue

    entradas.push({
      id: t.id,
      fecha: t.due_date,
      titulo: t.title,
      tipo: 'tarea',
      color: global ? (cliente.brand_color ?? 'var(--color-fg-muted)') : 'var(--color-fg-muted)',
      ...(global ? { etiqueta: cliente.name } : {}),
    })
  }

  return entradas
}

export interface ClienteDelCalendario {
  id: string
  slug: string
  name: string
  brandColor: string | null
  piezas: number
}

/** La leyenda de la vista global: quién es cada color y cuánto trae el mes. */
export async function clientesDelCalendario(mes: MonthKey): Promise<ClienteDelCalendario[]> {
  const supabase = await createClient()

  const [clientesRes, piezasRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, slug, name, brand_color')
      .is('archived_at', null)
      .order('name'),
    supabase.from('pieces').select('client_id').eq('month', mes),
  ])

  if (clientesRes.error) throw new Error(clientesRes.error.message)

  const conteo = new Map<string, number>()
  for (const p of piezasRes.data ?? []) {
    conteo.set(p.client_id, (conteo.get(p.client_id) ?? 0) + 1)
  }

  return (clientesRes.data ?? []).map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    brandColor: c.brand_color,
    piezas: conteo.get(c.id) ?? 0,
  }))
}
