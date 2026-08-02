import 'server-only'

const APIFY_URL = 'https://api.apify.com/v2'

export interface RunInput {
  [key: string]: unknown
}

export interface RunResult {
  id: string
  status: string
  startedAt: string | null
  finishedAt: string | null
  defaultDatasetId: string
}

/**
 * Cliente genérico de Apify.
 *
 * Corre un Actor, espera a que termine (polling), y devuelve los resultados
 * del dataset. Sin token configurado, todas las funciones devuelven null.
 *
 * Los Actores de Apify ya tienen la verificación de negocio hecha — Apify
 * es quien mantiene la relación con Meta/TikTok. Nuestra app solo consume
 * los datos que el Actor ya scrapeó.
 */
export function crearClienteApify(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  async function post<T>(path: string, body?: unknown): Promise<T | null> {
    const init: RequestInit = {
      method: 'POST',
      headers,
    }
    if (body !== undefined) init.body = JSON.stringify(body)
    const res = await fetch(`${APIFY_URL}${path}`, init)
    if (!res.ok) {
      console.warn(`Apify POST ${path}: ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }
    return res.json() as T
  }

  async function get<T>(path: string): Promise<T | null> {
    const res = await fetch(`${APIFY_URL}${path}`, { headers })
    if (!res.ok) {
      console.warn(`Apify GET ${path}: ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }
    return res.json() as T
  }

  /**
   * Espera entre 1 y 5 segundos, con backoff progresivo.
   * El scrape de un perfil típico son 15-60 segundos.
   */
  function esperar(intento: number): Promise<void> {
    const ms = Math.min(1000 * Math.pow(2, intento), 15_000)
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  return {
    async ejecutar(
      actorId: string,
      input: RunInput = {},
    ): Promise<Record<string, unknown>[] | null> {
      const run = await post<{ data: RunResult }>(`/acts/${actorId}/runs`, input)
      if (!run?.data) return null

      const runId = run.data.id
      const datasetId = run.data.defaultDatasetId

      // Poll hasta que termine, con timeout de 5 minutos
      for (let intento = 0; intento < 30; intento++) {
        const estado = await get<{ data: { status: string } }>(`/acts/${actorId}/runs/${runId}`)
        if (!estado?.data) return null

        const status = estado.data.status
        if (['SUCCEEDED', 'FINISHED'].includes(status)) break
        if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
          console.warn(`Apify actor ${actorId} terminó con estado ${status}`)
          return null
        }
        if (status === 'READY') {
          await esperar(intento)
          continue
        }
        await esperar(intento)
      }

      // Obtener resultados del dataset (máximo 200 items para un perfil)
      const items = await get<{ data: { items: Record<string, unknown>[] } }>(
        `/datasets/${datasetId}/items?limit=200`,
      )

      return items?.data?.items ?? []
    },
  }
}

/**
 * Actores de Apify que ya cubren las necesidades del estudio.
 * Los IDs son los que aparecen en la URL del Actor en Apify Store.
 */
export const ACTORES = {
  /** Perfil de Instagram: posts recientes + métricas por post. */
  instagram: 'apify/instagram-scraper',
  /** Datos del perfil: seguidores, bio, categoría. */
  instagramPerfil: 'apify/instagram-profile-scraper',
  /** Perfil de TikTok: posts + métricas. */
  tiktok: 'clockworks/tiktok-scraper',
  /** Posts de una página de Facebook. */
  facebook: 'apify/facebook-posts-scraper',
} as const
