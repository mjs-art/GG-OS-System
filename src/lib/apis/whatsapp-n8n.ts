import 'server-only'

import type { EnvioN8n } from '@/domain/whatsapp'

/**
 * El lado de salida del puente con n8n: la app le pide a n8n que envíe un
 * saliente ya aprobado. n8n tiene las credenciales de Meta (regla #4); esta
 * función solo hace el POST al webhook de envío.
 *
 * No marca el mensaje como 'enviado': eso llega después, cuando n8n reporta de
 * vuelta a `/api/jobs/whatsapp`. Aquí solo sabemos si n8n aceptó la orden.
 */

export interface ConfigN8n {
  /** URL del webhook de envío de n8n (`N8N_SEND_WEBHOOK_URL`). */
  url: string
  /** Secreto compartido (`N8N_INBOUND_SECRET`), el mismo que valida la entrada. */
  secret: string
}

export type ResultadoEnvioN8n = { ok: true } | { ok: false; motivo: string }

export async function enviarPorN8n(
  config: ConfigN8n,
  payload: EnvioN8n,
): Promise<ResultadoEnvioN8n> {
  try {
    const res = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // El mismo secreto que la ruta de entrada compara: así n8n comprueba
        // que la orden de envío viene de la app y no de un tercero.
        'x-studio-secret': config.secret,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const detalle = await res.text().catch(() => '')
      console.warn(`n8n send ${res.status}: ${detalle}`)
      return { ok: false, motivo: `n8n respondió ${res.status}` }
    }

    return { ok: true }
  } catch (error) {
    // Timeout o red caída: la aprobación ya quedó firmada en la base, solo no
    // salió. Se reintenta sin volver a aprobar.
    console.warn(`n8n send falló: ${String(error)}`)
    return { ok: false, motivo: 'no se pudo contactar a n8n' }
  }
}
