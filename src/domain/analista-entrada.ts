import type { AgentInput } from '@/agents/registry'

/**
 * De la base a la entrada del Analista (el contrato).
 *
 * Puro y sin IO: el compositor (`correrAnalista`) lee las filas y llama aquí. Dos
 * cosas que la base NO tiene y este módulo resuelve con honestidad:
 *
 *   · `engagement_pct` no es una columna: se calcula como interacciones sobre
 *     alcance. Sin alcance no hay porcentaje (0, no una división por cero), y se
 *     acota a [0,100] como pide el contrato.
 *   · `retention_3s_pct` no se captura todavía en ningún lado, así que va `null`
 *     —que es justo lo que el contrato espera fuera de reel—. Inventar un número
 *     de retención sería peor que no tenerlo.
 */

type AnalistaInput = AgentInput<'analista'>
type PiezaContrato = AnalistaInput['piece_performance'][number]
type NoPublicadaContrato = AnalistaInput['unpublished_pieces'][number]
type TotalesMes = AnalistaInput['monthly_totals']

/**
 * Engagement como porcentaje del alcance. Una pieza que rebasa el 100% de su
 * alcance en interacciones (pasa con lo viral) se reporta como 100: el tope es lo
 * honesto que el contrato permite decir.
 */
export function engagementPct(interactions: number, reach: number): number {
  if (reach <= 0) return 0
  return Math.min(100, Math.round((interactions / reach) * 1000) / 10)
}

/** La pieza publicada + su última medición, como la lee el compositor. */
export interface PiezaMedida {
  piece_id: string
  format: PiezaContrato['format']
  pillar: string
  published_at: string
  hook: string | null
  reach: number
  interactions: number
  saves: number
  shares: number
}

export function construirPiecePerformance(rows: readonly PiezaMedida[]): PiezaContrato[] {
  return rows.map((r) => ({
    piece_id: r.piece_id,
    format: r.format,
    pillar: r.pillar,
    published_at: r.published_at,
    hook: r.hook,
    reach: r.reach,
    saves: r.saves,
    shares: r.shares,
    engagement_pct: engagementPct(r.interactions, r.reach),
    retention_3s_pct: null,
  }))
}

/** La pieza que aún no sale. `publish_at` llega como timestamp; el contrato pide fecha. */
export interface PiezaPendiente {
  piece_id: string
  publish_at: string
  format: NoPublicadaContrato['format']
  pillar: string
  hook: string | null
  status: NoPublicadaContrato['status']
}

export function construirNoPublicadas(rows: readonly PiezaPendiente[]): NoPublicadaContrato[] {
  return rows.map((r) => ({
    piece_id: r.piece_id,
    scheduled_on: r.publish_at.slice(0, 10),
    format: r.format,
    pillar: r.pillar,
    hook: r.hook,
    status: r.status,
  }))
}

export interface TotalesCrudos {
  reach: number
  impressions: number
  saves: number
  shares: number
  profile_visits: number
  link_clicks: number
  new_followers: number
}

const TOTALES_EN_CERO: TotalesMes = {
  reach: 0,
  impressions: 0,
  saves: 0,
  shares: 0,
  profile_visits: 0,
  link_clicks: 0,
  new_followers: 0,
}

/**
 * Los totales del mes, o todo en cero cuando aún no se capturan. Un mes sin
 * datos es un estado real (se trabaja con un mes de adelanto); cero es la verdad,
 * no un error.
 */
export function totalesDeMes(row: TotalesCrudos | null): TotalesMes {
  if (!row) return TOTALES_EN_CERO
  return {
    reach: row.reach,
    impressions: row.impressions,
    saves: row.saves,
    shares: row.shares,
    profile_visits: row.profile_visits,
    link_clicks: row.link_clicks,
    new_followers: row.new_followers,
  }
}
