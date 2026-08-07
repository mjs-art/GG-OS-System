import { NextResponse } from 'next/server'
import { normalizarTelefono, payloadN8nSchema } from '@/domain/whatsapp'
import { serverEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { systemClock } from '@/lib/time'

/**
 * El puente entre n8n y la app para WhatsApp.
 *
 * n8n tiene las credenciales de Meta; esta ruta solo recibe lo que n8n reenvía:
 * un **mensaje entrante** del cliente, o el **reporte** de un saliente que ya se
 * envió. Vive bajo `api/jobs` porque escribe con `service_role` (no hay sesión
 * de usuario: quien llama es n8n), y ese cliente admin solo se permite aquí.
 *
 * La autorización es un secreto compartido en `x-studio-secret`, no una sesión.
 * Sin `N8N_INBOUND_SECRET` configurado, la ruta rechaza todo: nada entra a
 * ciegas.
 *
 * La regla #1 la sigue guardando la base, no esta ruta: marcar un saliente como
 * `enviado` exige que ya estuviera aprobado (CHECK `wa_enviado_exige_aprobacion`),
 * así que un reporte no puede "enviar" algo que nadie autorizó.
 */
export async function POST(request: Request): Promise<Response> {
  const secreto = serverEnv().N8N_INBOUND_SECRET
  if (!secreto) {
    return NextResponse.json(
      { ok: false, message: 'WhatsApp no está configurado (falta N8N_INBOUND_SECRET).' },
      { status: 503 },
    )
  }
  if (request.headers.get('x-studio-secret') !== secreto) {
    return NextResponse.json({ ok: false, message: 'No autorizado.' }, { status: 401 })
  }

  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = payloadN8nSchema.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'El payload de n8n no es válido.' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const ahora = systemClock.now().toISOString()
  const evento = parsed.data

  /* --- Reporte de un envío: 'enviado' | 'fallido' -------------------------- */
  if (evento.tipo === 'reporte') {
    const parche =
      evento.status === 'enviado'
        ? {
            status: 'enviado',
            sent_at: ahora,
            ...(evento.wa_message_id ? { wa_message_id: evento.wa_message_id } : {}),
          }
        : { status: 'fallido' }

    const { data, error } = await admin
      .from('wa_messages')
      .update(parche)
      .eq('id', evento.message_id)
      .eq('direction', 'outbound')
      .select('id')

    // Si el saliente no estaba aprobado, el CHECK de la base detiene el
    // 'enviado' y esto devuelve error — correcto: no se puede "enviar" sin
    // aprobación ni siquiera reportándolo.
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 422 })
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, message: 'No existe ese saliente.' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  }

  /* --- Mensaje entrante del cliente ---------------------------------------- */
  const telefono = normalizarTelefono(evento.wa_phone)
  if (!telefono) {
    return NextResponse.json({ ok: false, message: 'El teléfono no es válido.' }, { status: 400 })
  }

  const { data: conversacion } = await admin
    .from('wa_conversations')
    .select('id, org_id, client_id')
    .eq('wa_phone', telefono)
    .maybeSingle()

  // Un número que no está ligado a ningún cliente no se puede atribuir. No se
  // guarda huérfano: se acepta el webhook (para que n8n no reintente en bucle)
  // y se dice que se ignoró. El estudio liga el número al dar de alta al hilo.
  if (!conversacion) {
    return NextResponse.json(
      { ok: true, ignorado: 'no hay conversación para ese número' },
      { status: 202 },
    )
  }

  const { error } = await admin.from('wa_messages').insert({
    org_id: conversacion.org_id,
    client_id: conversacion.client_id,
    conversation_id: conversacion.id,
    direction: 'inbound',
    status: 'received',
    body: evento.text ?? null,
    media: evento.media,
    wa_message_id: evento.wa_message_id,
  })

  // Webhook reintentado: el UNIQUE (org_id, wa_message_id) lo frena. Es
  // idempotente, así que un duplicado no es falla — el mensaje ya estaba.
  if (error && error.code !== '23505') {
    return NextResponse.json({ ok: false, message: error.message }, { status: 422 })
  }

  await admin.from('wa_conversations').update({ last_message_at: ahora }).eq('id', conversacion.id)

  return NextResponse.json({ ok: true })
}
