import { z } from 'zod'

/**
 * WhatsApp vía n8n: la forma de lo que n8n le manda a la app, validada y
 * normalizada.
 *
 * n8n es entrada no confiable, igual que un CSV o la salida de un modelo: viene
 * de la red y se valida con Zod en el límite. Aquí viven los dos payloads —un
 * mensaje entrante del cliente y el reporte de un envío— y la normalización del
 * teléfono, que es pura y por eso se prueba con casos, no en producción.
 */

/** E.164 tal como lo exige el CHECK de `wa_conversations`: `+` y 8–16 dígitos. */
const E164 = /^\+[1-9][0-9]{7,15}$/

/**
 * Lleva un teléfono a E.164 (`+52...`). WhatsApp lo entrega de varias formas
 * (`5215512345678`, `52 55 1234 5678`, `whatsapp:+52...`): se le quita el
 * prefijo y los separadores y se antepone `+`. Devuelve `null` si no queda un
 * número válido — uno que no cuadra no se enruta a medias.
 */
export function normalizarTelefono(raw: string): string | null {
  const sinPrefijo = raw.trim().replace(/^whatsapp:/i, '')
  const digitos = sinPrefijo.replace(/\D/g, '')
  if (digitos.length === 0) return null
  const e164 = `+${digitos}`
  return E164.test(e164) ? e164 : null
}

const mediaSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'document']).default('image'),
  url: z.url(),
  caption: z.string().nullish(),
})

/** Un mensaje entrante del cliente, tal como n8n lo reenvía desde Meta. */
export const entranteSchema = z.object({
  tipo: z.literal('mensaje'),
  wa_phone: z.string().min(1),
  /** El id del proveedor: se usa para no duplicar un webhook reintentado. */
  wa_message_id: z.string().min(1),
  text: z.string().nullish(),
  media: z.array(mediaSchema).default([]),
  /** Cómo se llama el contacto en WhatsApp, para estrenar el hilo con nombre. */
  display_name: z.string().nullish(),
})

/** El reporte que manda n8n después de intentar enviar un saliente. */
export const reporteSchema = z.object({
  tipo: z.literal('reporte'),
  /** Nuestro id de `wa_messages`, el que la app le pasó a n8n al aprobar. */
  message_id: z.uuid(),
  status: z.enum(['enviado', 'fallido']),
  /** El id que Meta le asignó al mensaje ya enviado. */
  wa_message_id: z.string().nullish(),
  error: z.string().nullish(),
})

/**
 * Todo lo que entra por `/api/jobs/whatsapp`, discriminado por `tipo`. Que sea
 * unión cerrada es a propósito: un payload con un `tipo` que no reconocemos se
 * rechaza en el límite, no se interpreta a medias.
 */
export const payloadN8nSchema = z.discriminatedUnion('tipo', [entranteSchema, reporteSchema])

export type PayloadN8n = z.infer<typeof payloadN8nSchema>
export type EntranteWhatsApp = z.infer<typeof entranteSchema>
export type ReporteWhatsApp = z.infer<typeof reporteSchema>
export type MediaWhatsApp = z.infer<typeof mediaSchema>

/**
 * Lee una lista de adjuntos guardada en jsonb sin confiar en su forma. Es
 * nuestro dato, pero jsonb no tiene tipo: un adjunto viejo con otra forma no
 * debe tumbar la bandeja, así que lo que no cumple se descarta.
 */
export function parsearMedia(value: unknown): MediaWhatsApp[] {
  const parsed = z.array(mediaSchema).safeParse(value ?? [])
  return parsed.success ? parsed.data : []
}

/* -------------------------------------------------------------------------- */
/*  Vistas de la bandeja de salientes                                          */
/*                                                                             */
/*  Tipos que cruzan de la carga (server-only) al componente cliente. Viven    */
/*  aquí, en un módulo sin directiva, por la misma trampa que documenta        */
/*  CLAUDE.md: un valor de un módulo 'use client' importado en el servidor     */
/*  llega como referencia, no como valor. Los tipos no, pero se agrupan aquí   */
/*  para no volver a cruzar esa línea sin querer.                              */
/* -------------------------------------------------------------------------- */

/** Un borrador de saliente esperando aprobación. */
export interface SalienteWhatsApp {
  id: string
  body: string | null
  status: 'borrador' | 'aprobado'
  /** El agente que lo redactó, o `null` si lo escribió una persona. */
  authoredByAgent: string | null
  /** Fotos y propuestas adjuntas, en el orden en que se anexaron. */
  media: MediaWhatsApp[]
  createdAt: string
}

/** Una conversación con al menos un saliente pendiente, y su contexto. */
export interface HiloWhatsApp {
  conversationId: string
  clienteNombre: string
  waPhone: string
  /** El último mensaje del cliente, para juzgar la respuesta sin cambiar de vista. */
  ultimoEntrante: { id: string; body: string | null; createdAt: string } | null
  salientes: SalienteWhatsApp[]
}

/** La clase de retro, espejo del CHECK de `wa_feedback`. */
export type TipoRetro = 'aprobacion' | 'cambio' | 'comentario'

/** Una retro del cliente todavía sin resolver. */
export interface RetroWhatsApp {
  id: string
  clienteNombre: string
  body: string
  kind: TipoRetro
  createdAt: string
}

/**
 * Lo que la app le manda a n8n para que envíe un saliente ya aprobado. n8n no
 * toca la base: recibe a dónde, qué texto y qué adjuntos, y devuelve el reporte
 * citando `message_id` — nuestro uuid, para que el `enviado` caiga en la fila
 * correcta.
 */
export interface EnvioN8n {
  message_id: string
  to: string
  text: string | null
  media: MediaWhatsApp[]
}

/**
 * Arma el payload de envío a partir de un saliente ya aprobado y el teléfono de
 * su conversación. Es pura: no toca la red ni la base, así que se prueba con
 * casos.
 *
 * Devuelve `null` cuando no hay nada que mandar —ni texto ni adjuntos— o cuando
 * el `media` guardado no cuadra con el contrato. En ambos casos preferimos no
 * enviar a enviar a medias: un WhatsApp vacío o con un adjunto roto es peor que
 * ninguno, y el borrador se queda para arreglarlo.
 */
export function construirEnvioN8n(
  mensaje: { id: string; body: string | null; media: unknown },
  telefono: string,
): EnvioN8n | null {
  const media = z.array(mediaSchema).safeParse(mensaje.media ?? [])
  if (!media.success) return null

  const texto = mensaje.body?.trim() ? mensaje.body : null
  if (!texto && media.data.length === 0) return null

  return { message_id: mensaje.id, to: telefono, text: texto, media: media.data }
}
