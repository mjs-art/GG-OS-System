import 'server-only'

import { systemClock } from '@/lib/time'
import type { DatosFrescosDeRed, DatosPostApi, MetricaDePostApi } from './types'

const GRAPH_URL = 'https://graph.instagram.com/v21.0'
const GRAPH_FB_URL = 'https://graph.facebook.com/v21.0'

interface ClienteInstagram {
  token: string
  businessAccountId: string
}

/**
 * Cliente de solo lectura para Instagram Graph API.
 *
 * Usa un token de largo plazo de una cuenta de negocio conectada a una página
 * de Facebook. Sin token configurado, las funciones devuelven null en vez de
 * tronar: el dashboard sigue funcionando con captura manual y CSV.
 */
export function crearClienteInstagram(cliente: ClienteInstagram) {
  const { token, businessAccountId } = cliente

  async function get(path: string, params: Record<string, string> = {}) {
    const url = new URL(`${GRAPH_URL}/${path}`)
    url.searchParams.set('access_token', token)
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v)
    }

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn(`Instagram API ${res.status}: ${await res.text().catch(() => '')}`)
      return null
    }
    return res.json()
  }

  function extraerInsight(insights: DatosPostApi['insights'], nombre: string): number {
    if (!insights?.data) return 0
    const metrica = insights.data.find((m) => m.name === nombre)
    return metrica?.values[0]?.value ?? 0
  }

  return {
    cerrar() {},

    async datosFrescos(): Promise<DatosFrescosDeRed | null> {
      const data = await get(`${businessAccountId}`, {
        fields: 'followers_count,media{id,timestamp,insights.metric(reach,impressions)}',
      })

      if (!data?.followers_count) return null

      const media = data.media?.data ?? []
      const ahora = systemClock.now()
      const semanaMs = 7 * 24 * 60 * 60 * 1000
      const postsEstaSemana = media.filter((m: { timestamp?: string }) => {
        if (!m.timestamp) return false
        return ahora.getTime() - new Date(m.timestamp).getTime() <= semanaMs
      }).length

      const ultimoPost =
        media.length > 0
          ? media.reduce((a: { timestamp: string }, b: { timestamp: string }) =>
              a.timestamp > b.timestamp ? a : b,
            )
          : null

      return {
        followers: data.followers_count,
        followersDelta: 0,
        lastPostAt: ultimoPost?.timestamp ?? null,
        postsThisWeek: postsEstaSemana,
      }
    },

    /**
     * Métricas de los últimos N posts.
     *
     * Instagram Graph API no expone `saves` ni `shares` directamente en su
     * endpoint `/media/insights` de cuentas de negocio. Se devuelven en 0 y se
     * documenta: la métrica precisa requiere el token de la página de Facebook y
     * el endpoint `/insights` de cada media del feed, no del creador.
     */
    async metricasPosts(limit = 20): Promise<MetricaDePostApi[]> {
      const data = await get(`${businessAccountId}/media`, {
        fields: `id,timestamp,insights.metric(${['reach', 'impressions', 'saves', 'shares', 'total_interactions'].join(',')})`,
        limit: String(limit),
      })

      if (!data?.data) return []

      const posts = data.data as DatosPostApi[]

      return posts.map((post) => ({
        pieceId: null,
        platformPostId: post.id,
        reach: extraerInsight(post.insights, 'reach'),
        impressions: extraerInsight(post.insights, 'impressions'),
        saves: extraerInsight(post.insights, 'saves'),
        shares: extraerInsight(post.insights, 'shares'),
        interactions: extraerInsight(post.insights, 'total_interactions'),
        measuredAt: post.timestamp ?? systemClock.now().toISOString(),
      }))
    },
  }
}

/**
 * Refresca un token de corto plazo a largo plazo.
 *
 * Los tokens de Instagram expiran en 1 hora. Este endpoint los convierte a 60
 * días. Se llama una vez durante el onboarding de la cuenta.
 */
export async function refrescarTokenInstagram(
  appId: string,
  appSecret: string,
  shortLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const url = new URL(`${GRAPH_URL}/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('client_secret', appSecret)
  url.searchParams.set('fb_exchange_token', shortLivedToken)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return null

  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 5_184_000 }
}

/**
 * Intercambia un token de página de Facebook por un token de Instagram Business
 * Account, necesitando el id de la página de Facebook y el id de la cuenta de
 * Instagram conectada.
 */
export async function obtenerInstagramBusinessId(
  pageToken: string,
  pageId: string,
): Promise<{ businessAccountId: string; token: string } | null> {
  const url = new URL(`${GRAPH_FB_URL}/${pageId}`)
  url.searchParams.set('fields', 'instagram_business_account')
  url.searchParams.set('access_token', pageToken)

  const res = await fetch(url.toString())
  if (!res.ok) return null

  const data = (await res.json()) as {
    instagram_business_account?: { id: string }
  }

  if (!data.instagram_business_account?.id) return null

  return {
    businessAccountId: data.instagram_business_account.id,
    token: pageToken,
  }
}
