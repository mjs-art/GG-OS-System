import 'server-only'

import { z } from 'zod'
import { accionSugeridaTipoSchema } from '@/agents/contracts'
import { esErrorDeSesion } from '@/lib/datos/errores'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de la sección Investigación.
 *
 * Igual que el resto de `lib/datos`: nada filtra por org ni por cliente a
 * mano — lo hace RLS, incluida la investigación general (`client_id` nulo),
 * que el estudio ve por ser miembro de la org. Aquí solo se lee; correr el
 * agente es la ruta `/api/jobs/investigador`.
 */

export interface AccionSugerida {
  tipo: z.infer<typeof accionSugeridaTipoSchema>
  titulo: string
  detalle: string
}

export interface Investigacion {
  id: string
  youtubeUrl: string
  videoTitle: string | null
  summary: string
  keyPoints: string[]
  suggestedActions: AccionSugerida[]
  /** `null` = investigación general, no ligada a un cliente. */
  cliente: { id: string; nombre: string; slug: string } | null
  creadoEn: string
}

/** El jsonb no tiene tipo: una fila vieja con otra forma no debe tumbar la lista. */
const keyPointsSchema = z.array(z.string()).catch([])
const suggestedActionsSchema = z
  .array(
    z.object({
      tipo: accionSugeridaTipoSchema,
      titulo: z.string(),
      detalle: z.string(),
    }),
  )
  .catch([])

const LIMITE_LISTA = 30

export async function listarInvestigaciones(): Promise<Investigacion[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('video_summaries')
    .select(
      `id, youtube_url, video_title, summary, key_points, suggested_actions, created_at,
       clients ( id, name, slug )`,
    )
    .order('created_at', { ascending: false })
    .limit(LIMITE_LISTA)

  if (error) {
    if (esErrorDeSesion(error)) {
      console.warn(`Investigaciones: la sesión no fue aceptada (${error.code}). Se muestra vacía.`)
      return []
    }
    throw new Error(`No se pudieron leer las investigaciones: ${error.message}`)
  }

  return (data ?? []).map((fila) => ({
    id: fila.id,
    youtubeUrl: fila.youtube_url,
    videoTitle: fila.video_title,
    summary: fila.summary,
    keyPoints: keyPointsSchema.parse(fila.key_points),
    suggestedActions: suggestedActionsSchema.parse(fila.suggested_actions),
    cliente: fila.clients
      ? { id: fila.clients.id, nombre: fila.clients.name, slug: fila.clients.slug }
      : null,
    creadoEn: fila.created_at,
  }))
}

export interface ClienteSelector {
  id: string
  nombre: string
}

/** Para el selector opcional "¿es para un cliente en particular?" del formulario. */
export async function listarClientesParaInvestigar(): Promise<ClienteSelector[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .is('archived_at', null)
    .order('name')

  // El selector es una comodidad del formulario: si falla, se corre sin
  // cliente en vez de tumbar la página.
  if (error) return []
  return (data ?? []).map((c) => ({ id: c.id, nombre: c.name }))
}
