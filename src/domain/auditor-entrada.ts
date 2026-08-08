import type { AgentInput } from '@/agents/registry'
import type { Json } from '@/lib/supabase/database.types'

/**
 * De `social_accounts` (la base) a la entrada del Auditor (el contrato).
 *
 * Puro y sin IO a propósito: es donde se esconden los errores de mapeo, y es lo
 * que quiero poder probar sin Supabase levantado. El compositor (`correrAuditor`)
 * solo lee las filas y llama aquí; la forma exacta que espera el agente se decide
 * en un único lugar.
 *
 * Dos renombres que importan y por eso van con nombre:
 *   · `followers_delta`  → `followers_delta_30d`  (la columna ya es a 30 días)
 *   · `target_per_week`  → `target_posts_per_week`
 * Y `profile_checklist` vive como jsonb libre en la base; aquí se estrecha a las
 * cuatro banderas que el contrato conoce, defaulteando a `false` lo que falte.
 */

type CuentaAuditor = AgentInput<'auditor'>['accounts'][number]
type ChecklistPerfil = CuentaAuditor['profile_checklist']

/** La fila de `social_accounts` que necesita el Auditor, y solo esa. */
export interface CuentaCruda {
  platform: CuentaAuditor['platform']
  handle: string | null
  url: string | null
  followers: number
  followers_delta: number
  last_post_at: string | null
  posts_per_week: number
  target_per_week: number
  profile_checklist: Json
  unanswered_dms: number
  unanswered_comments: number
}

/**
 * Lee el checklist del perfil desde jsonb sin confiar en su forma. Cualquier cosa
 * que no sea exactamente `true` cuenta como pendiente: un checklist a medio
 * llenar no debe pintar el perfil como completo.
 */
export function parsearChecklist(valor: Json): ChecklistPerfil {
  const o =
    valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}
  return {
    bio: o['bio'] === true,
    link: o['link'] === true,
    highlights: o['highlights'] === true,
    photo: o['photo'] === true,
  }
}

/** Una liga válida o `null`: un string vacío no es una URL, y el contrato pide una u otra. */
function urlONull(url: string | null): string | null {
  const t = url?.trim() ?? ''
  return t === '' ? null : t
}

/**
 * Arma el arreglo de cuentas que consume el Auditor. El `handle` cae al nombre de
 * la red cuando la base no lo tiene: el contrato lo exige no vacío, y una cuenta
 * sin handle sigue siendo auditable (cadencia, perfil, crecimiento no dependen de
 * cómo se llame).
 */
export function construirCuentasAuditor(rows: readonly CuentaCruda[]): CuentaAuditor[] {
  return rows.map((r) => ({
    platform: r.platform,
    handle: r.handle?.trim() ? r.handle.trim() : r.platform,
    url: urlONull(r.url),
    followers: r.followers,
    followers_delta_30d: r.followers_delta,
    last_post_at: r.last_post_at,
    posts_per_week: r.posts_per_week,
    target_posts_per_week: r.target_per_week,
    profile_checklist: parsearChecklist(r.profile_checklist),
    unanswered_dms: r.unanswered_dms,
    unanswered_comments: r.unanswered_comments,
  }))
}
