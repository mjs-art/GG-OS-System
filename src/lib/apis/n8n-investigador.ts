import 'server-only'

import { z } from 'zod'

/**
 * El lado de la transcripción del puente con n8n: a diferencia de WhatsApp
 * (fire-and-forget, n8n reporta después a `/api/jobs/whatsapp`), aquí quien
 * pega el link está esperando en la pantalla — el workflow responde con la
 * transcripción en la misma llamada HTTP (nodo "Respond to Webhook" en n8n).
 */

export interface ConfigN8nInvestigador {
  /** URL del webhook (`N8N_INVESTIGADOR_WEBHOOK_URL`). */
  url: string
}

const respuestaSchema = z.object({
  transcript: z.string().trim().min(1),
  title: z.string().trim().min(1).nullish(),
})

export type ResultadoTranscripcion =
  { ok: true; transcript: string; title: string | null } | { ok: false; motivo: string }

export async function bajarTranscripcion(
  config: ConfigN8nInvestigador,
  youtubeUrl: string,
): Promise<ResultadoTranscripcion> {
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_url: youtubeUrl }),
    })

    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.warn(`n8n investigador ${res.status}: ${detalle}`)
      return { ok: false, motivo: `n8n respondió ${res.status}` }
    }

    const crudo: unknown = await res.json().catch(() => null)
    const parsed = respuestaSchema.safeParse(crudo)
    if (!parsed.success) {
      return { ok: false, motivo: 'n8n respondió sin una transcripción reconocible' }
    }

    return { ok: true, transcript: parsed.data.transcript, title: parsed.data.title ?? null }
  } catch (error) {
    console.warn(`n8n investigador falló: ${String(error)}`)
    return { ok: false, motivo: 'no se pudo contactar al workflow de n8n' }
  }
}
