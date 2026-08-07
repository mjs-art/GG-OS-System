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

/* ==========================================================================
   RETRO — guardar la retroalimentación del cliente y convertirla en ajuste
   ========================================================================== */

const registrarRetroSchema = z.object({
  conversationId: z.uuid('No se identificó la conversación. Recarga la bandeja.'),
  /** El mensaje entrante del que sale la retro, si aplica. */
  messageId: z.uuid().nullish(),
  kind: z.enum(['aprobacion', 'cambio', 'comentario']).default('comentario'),
  body: z.string().trim().min(1, 'La retro no puede ir vacía.').max(4000),
})

/**
 * Guarda la retro del cliente. El org y el cliente NO vienen de la petición:
 * se leen de la conversación con el cliente de sesión, así que RLS ya garantizó
 * que Ana tiene acceso. Si no, la lectura vuelve vacía y no se guarda nada.
 */
export async function registrarRetro(entrada: unknown): Promise<ResultadoWhatsApp> {
  const parsed = registrarRetroSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que mandaste.' }
  }

  const { conversationId, messageId, kind, body } = parsed.data
  const supabase = await createClient()

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()
  if (errorUsuario || !user) {
    return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y sigue donde ibas.' }
  }

  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('org_id, client_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) {
    return { ok: false, mensaje: 'Esa conversación ya no existe o no tienes acceso al cliente.' }
  }

  const { error } = await supabase.from('wa_feedback').insert({
    org_id: conv.org_id,
    client_id: conv.client_id,
    conversation_id: conversationId,
    message_id: messageId ?? null,
    kind,
    body,
    month: systemClock.now().toISOString().slice(0, 7),
  })

  if (error) {
    return { ok: false, mensaje: `No se pudo guardar la retro: ${error.message}` }
  }

  revalidatePath('/whatsapp')
  return { ok: true }
}

const resolverRetroSchema = z.object({
  feedbackId: z.uuid('No se identificó la retro. Recarga la bandeja.'),
  /** Qué se hizo con la retro. Obligatoria: una retro resuelta sin nota no sirve. */
  resolution: z.string().trim().min(1, 'Escribe qué hiciste con la retro.').max(2000),
  /**
   * El aprendizaje de marca que deja la retro, opcional. Cuando viene, se
   * guarda en `human_edits` — la tabla que es el criterio de la marca aprendido.
   */
  edit: z
    .object({
      field: z.string().trim().min(1).max(60),
      oldValue: z.string().max(4000).nullish(),
      newValue: z.string().trim().min(1, 'Escribe cómo debe decir.').max(4000),
    })
    .nullish(),
})

/**
 * Resuelve una retro y, si Ana capturó el aprendizaje, lo deja en `human_edits`.
 *
 * El `.is('resolved_at', null)` cubre la carrera de dos pestañas: lo que otra ya
 * cerró no se vuelve a resolver. La retro es append-only en espíritu (se
 * resuelve, no se edita) y `human_edits` se registra a nombre propio: la RLS
 * exige `edited_by = auth.uid()`.
 */
export async function resolverRetro(entrada: unknown): Promise<ResultadoWhatsApp> {
  const parsed = resolverRetroSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que mandaste.' }
  }

  const { feedbackId, resolution, edit } = parsed.data
  const supabase = await createClient()

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()
  if (errorUsuario || !user) {
    return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y sigue donde ibas.' }
  }

  const { data: retro } = await supabase
    .from('wa_feedback')
    .select('org_id, client_id, piece_id')
    .eq('id', feedbackId)
    .maybeSingle()
  if (!retro) {
    return { ok: false, mensaje: 'Esa retro ya no existe o no tienes acceso al cliente.' }
  }

  const { data, error } = await supabase
    .from('wa_feedback')
    .update({ resolved_at: systemClock.now().toISOString(), resolved_by: user.id, resolution })
    .eq('id', feedbackId)
    .is('resolved_at', null)
    .select('id')

  if (error) {
    return { ok: false, mensaje: `No se pudo resolver la retro: ${error.message}` }
  }
  if (!data || data.length === 0) {
    return { ok: false, mensaje: 'Esa retro ya la resolvió alguien más, o ya no tienes acceso.' }
  }

  // El aprendizaje es lo valioso: queda en human_edits aunque no cuelgue de una
  // pieza (piece_id puede ser null). Que la retro ya esté resuelta y esto falle
  // se dice, pero no se deshace: la resolución es el hecho principal.
  if (edit) {
    const { error: errorEdit } = await supabase.from('human_edits').insert({
      org_id: retro.org_id,
      client_id: retro.client_id,
      piece_id: retro.piece_id ?? null,
      field: edit.field,
      old_value: edit.oldValue ?? null,
      new_value: edit.newValue,
      edited_by: user.id,
    })
    if (errorEdit) {
      return {
        ok: false,
        mensaje: `Se resolvió la retro, pero no se pudo guardar el aprendizaje: ${errorEdit.message}`,
      }
    }
  }

  revalidatePath('/whatsapp')
  return { ok: true }
}
