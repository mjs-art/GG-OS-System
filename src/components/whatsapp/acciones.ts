'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { construirEnvioN8n } from '@/domain/whatsapp'
import { enviarPorN8n } from '@/lib/apis/whatsapp-n8n'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Aprobar y mandar un saliente de WhatsApp. Es la mitad humana de la regla #1:
 * ningún mensaje sale sin que una persona lo firme aquí.
 *
 * El orden importa. Primero se firma la aprobación en la base (por RLS, con
 * nombre y hora); solo entonces se le pide a n8n que lo envíe. Si el envío
 * falla, la aprobación ya quedó guardada y el mensaje se puede reintentar sin
 * volver a firmarlo. El paso a 'enviado' NO se hace aquí: lo sella el reporte
 * de n8n en `/api/jobs/whatsapp`, y el CHECK `wa_enviado_exige_aprobacion`
 * garantiza que ese sello exija esta aprobación.
 */

export type ResultadoWhatsApp = { ok: true } | { ok: false; mensaje: string }

const schema = z.object({
  messageId: z.uuid('No se identificó el mensaje. Recarga la bandeja.'),
  /**
   * El texto editado por la persona antes de aprobar. `nullish` porque puede
   * aprobarse el borrador tal cual. Si viene, se guarda en el mismo UPDATE que
   * firma la aprobación: quien edita es quien firma.
   */
  body: z.string().trim().max(4000).nullish(),
})

export async function aprobarYEnviarWhatsApp(entrada: unknown): Promise<ResultadoWhatsApp> {
  const parsed = schema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que mandaste.' }
  }

  const { messageId, body } = parsed.data

  // Sin webhook de envío no hay a dónde mandar. Se revisa antes de tocar la
  // base: aprobar algo que no se puede enviar lo dejaría a medias.
  const { N8N_SEND_WEBHOOK_URL, N8N_INBOUND_SECRET } = serverEnv()
  if (!N8N_SEND_WEBHOOK_URL || !N8N_INBOUND_SECRET) {
    return {
      ok: false,
      mensaje: 'WhatsApp todavía no está configurado para enviar. Falta el webhook de n8n.',
    }
  }

  const supabase = await createClient()

  // getUser() y no getSession(): aquí se firma quién autorizó la salida, y la
  // cookie de sesión la manda el cliente.
  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y sigue donde ibas.' }
  }

  const { data, error } = await supabase
    .from('wa_messages')
    .update({
      status: 'aprobado',
      approved_by: user.id,
      approved_at: systemClock.now().toISOString(),
      // Si Ana editó el texto, se guarda al aprobar: la versión que se manda es
      // la que ella firmó, no la que redactó el agente.
      ...(typeof body === 'string' ? { body } : {}),
    })
    .eq('id', messageId)
    .eq('direction', 'outbound')
    // Un borrador, o un reintento de algo aprobado que aún no salió. La RLS
    // exige además que sea un cliente al que tienes acceso y que `sent_at`
    // siga en null; no hace falta repetir esas reglas aquí.
    .in('status', ['borrador', 'aprobado'])
    .is('sent_at', null)
    .select('id, body, media, conversation_id')

  if (error) {
    return { ok: false, mensaje: `No se pudo aprobar: ${error.message}` }
  }

  // Un UPDATE que RLS filtró no truena: afecta cero renglones y regresa en
  // silencio. Sin revisar el conteo, diríamos que se mandó sin haber mandado.
  const fila = data?.[0]
  if (!fila) {
    return {
      ok: false,
      mensaje: 'Ese mensaje ya se envió, no existe, o ya no tienes acceso al cliente.',
    }
  }

  const { data: conversacion } = await supabase
    .from('wa_conversations')
    .select('wa_phone')
    .eq('id', fila.conversation_id)
    .maybeSingle()

  if (!conversacion?.wa_phone) {
    return { ok: false, mensaje: 'La conversación no tiene un número de WhatsApp válido.' }
  }

  const envio = construirEnvioN8n(
    { id: fila.id, body: fila.body, media: fila.media },
    conversacion.wa_phone,
  )
  if (!envio) {
    return { ok: false, mensaje: 'El mensaje no tiene texto ni adjuntos que enviar.' }
  }

  const resultado = await enviarPorN8n(
    { url: N8N_SEND_WEBHOOK_URL, secret: N8N_INBOUND_SECRET },
    envio,
  )

  if (!resultado.ok) {
    return {
      ok: false,
      mensaje: `Se aprobó, pero no se pudo mandar a WhatsApp (${resultado.motivo}). Puedes reintentar.`,
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true }
}
