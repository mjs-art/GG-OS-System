import 'server-only'

import { systemClock } from '@/lib/time'
import type { MetricaCampaignApi } from './types'

const ADS_URL = 'https://graph.facebook.com/v21.0'

interface ClienteMetaAds {
  token: string
  adAccountId: string
}

/**
 * Cliente de solo lectura para Meta Ads API.
 *
 * **Nunca escribe.** Leer campañas, ad sets y métricas es seguro y no cuesta
 * un centavo (no usa el endpoint de modificación). Si el token es de scope
 * `ads_read`, la API rechaza cualquier intento de escritura incluso si el
 * código tratara de hacerlo.
 */
export function crearClienteMetaAds(cliente: ClienteMetaAds) {
  const { token, adAccountId } = cliente
  const base = `${ADS_URL}/act_${adAccountId.replace(/^act_/, '')}`

  async function get(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${base}${path}`)
    url.searchParams.set('access_token', token)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn(`Meta Ads API ${res.status}: ${await res.text().catch(() => '')}`)
      return null
    }
    return res.json()
  }

  return {
    cerrar() {},

    async listarCampanas(): Promise<Array<{ id: string; name: string; status: string }>> {
      const data = await get('/campaigns', {
        fields: 'id,name,status',
        limit: '50',
        filter: JSON.stringify([
          { field: 'effective_status', operator: 'IN', values: ['ACTIVE', 'PAUSED'] },
        ]),
      })
      return data?.data ?? []
    },

    async metricasCampanas(
      campanaIds: string[],
      desde: string,
      hasta: string,
    ): Promise<MetricaCampaignApi[]> {
      if (!campanaIds.length) return []

      const data = await get('/insights', {
        level: 'campaign',
        fields: 'campaign_id,reach,impressions,spend,clicks',
        time_range: JSON.stringify({ since: desde, until: hasta }),
        filter: JSON.stringify([{ field: 'campaign.id', operator: 'IN', values: campanaIds }]),
        time_increment: '1',
      })

      const resultados = data?.data as
        | Array<{
            campaign_id: string
            reach: string
            impressions: string
            spend: string
            clicks: string
            date_start: string
          }>
        | undefined

      return (resultados ?? []).map((r) => ({
        campaignId: r.campaign_id,
        reach: Number(r.reach) || 0,
        impressions: Number(r.impressions) || 0,
        spend: Number(r.spend) || 0,
        clicks: Number(r.clicks) || 0,
        measuredAt: r.date_start,
      }))
    },

    /**
     * Gasto total del mes en curso. Una sola métrica, una sola llamada, sin
     * paginación: sirve para el semáforo de presupuesto en la vista de Pauta.
     */
    async gastoDelMes(): Promise<number> {
      const ahora = systemClock.now()
      const desde = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`
      const hasta = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`

      const data = await get('/insights', {
        fields: 'spend',
        time_range: JSON.stringify({ since: desde, until: hasta }),
      })

      const resultados = data?.data as Array<{ spend: string }> | undefined
      if (!resultados?.length) return 0

      return resultados.reduce((acc, r) => acc + (Number(r.spend) || 0), 0)
    },
  }
}

/**
 * Convierte el ID de cuenta publicitaria del formato con `act_` a uno sin
 * prefijo, y viceversa. Meta acepta los dos, pero el que se guarda en la base
 * es el número limpio.
 */
export function normalizarAdAccountId(id: string): string {
  return id.replace(/^act_/, '')
}
