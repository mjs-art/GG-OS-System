import 'server-only'

import type { HiloWhatsApp, RetroWhatsApp, SalienteWhatsApp, TipoRetro } from '@/domain/whatsapp'
import { esErrorDeSesion } from '@/lib/datos/errores'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas de la bandeja de salientes de WhatsApp.
 *
 * Igual que el resto de `lib/datos`: ninguna consulta filtra por cliente a
 * mano. Lo hace RLS —el portal no ve nada de estas tablas y el estudio solo ve
 * los clientes a los que tiene acceso—, y hay pruebas de pgTAP que lo cubren.
 * Aquí solo se lee; aprobar y enviar es una Server Action aparte.
 */

const ESTADOS_PENDIENTES = ['borrador', 'aprobado'] as const

function esEstadoPendiente(valor: string): valor is 'borrador' | 'aprobado' {
  return (ESTADOS_PENDIENTES as readonly string[]).includes(valor)
}

function contarMedia(media: unknown): number {
  return Array.isArray(media) ? media.length : 0
}

/**
 * Los salientes pendientes (borrador o aprobado, aún sin enviar), agrupados por
 * conversación y con el último mensaje del cliente como contexto. Vacío si no
 * hay nada que revisar o si la sesión ya no es válida.
 */
export async function cargarSalientesWhatsApp(): Promise<HiloWhatsApp[]> {
  const supabase = await createClient()

  const { data: pendientes, error } = await supabase
    .from('wa_messages')
    .select('id, body, status, authored_by_agent, media, created_at, conversation_id')
    .eq('direction', 'outbound')
    .in('status', [...ESTADOS_PENDIENTES])
    .is('sent_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    if (esErrorDeSesion(error)) {
      console.warn(
        `Salientes de WhatsApp: la sesión no fue aceptada (${error.code}). Se muestra vacía.`,
      )
      return []
    }
    throw new Error(`No se pudieron leer los salientes de WhatsApp: ${error.message}`)
  }
  if (!pendientes?.length) return []

  const conversacionIds = [...new Set(pendientes.map((m) => m.conversation_id))]

  const { data: conversaciones } = await supabase
    .from('wa_conversations')
    .select('id, wa_phone, clients ( name )')
    .in('id', conversacionIds)

  // El último entrante por conversación, para citar a qué se está respondiendo.
  // Se traen los entrantes de estas conversaciones ordenados del más nuevo al
  // más viejo y se toma el primero que aparece por conversación.
  const { data: entrantes } = await supabase
    .from('wa_messages')
    .select('id, conversation_id, body, created_at')
    .eq('direction', 'inbound')
    .in('conversation_id', conversacionIds)
    .order('created_at', { ascending: false })

  const ultimoEntrante = new Map<string, { id: string; body: string | null; createdAt: string }>()
  for (const m of entrantes ?? []) {
    if (!ultimoEntrante.has(m.conversation_id)) {
      ultimoEntrante.set(m.conversation_id, { id: m.id, body: m.body, createdAt: m.created_at })
    }
  }

  const datosConversacion = new Map<string, { waPhone: string; clienteNombre: string }>()
  for (const c of conversaciones ?? []) {
    datosConversacion.set(c.id, {
      waPhone: c.wa_phone,
      clienteNombre: c.clients?.name ?? 'Sin cliente',
    })
  }

  // Agrupa preservando el orden de llegada de los borradores.
  const hilos = new Map<string, HiloWhatsApp>()
  for (const m of pendientes) {
    if (!esEstadoPendiente(m.status)) continue

    let hilo = hilos.get(m.conversation_id)
    if (!hilo) {
      const conv = datosConversacion.get(m.conversation_id)
      // Sin conversación visible no hay a quién atribuir el borrador. Imposible
      // hoy con RLS parejo, pero más barato saltarlo que pintar "undefined".
      if (!conv) continue
      hilo = {
        conversationId: m.conversation_id,
        clienteNombre: conv.clienteNombre,
        waPhone: conv.waPhone,
        ultimoEntrante: ultimoEntrante.get(m.conversation_id) ?? null,
        salientes: [],
      }
      hilos.set(m.conversation_id, hilo)
    }

    const saliente: SalienteWhatsApp = {
      id: m.id,
      body: m.body,
      status: m.status,
      authoredByAgent: m.authored_by_agent,
      mediaCount: contarMedia(m.media),
      createdAt: m.created_at,
    }
    hilo.salientes.push(saliente)
  }

  return [...hilos.values()]
}

const TIPOS_RETRO = ['aprobacion', 'cambio', 'comentario'] as const

function esTipoRetro(valor: string): valor is TipoRetro {
  return (TIPOS_RETRO as readonly string[]).includes(valor)
}

/**
 * La retro del cliente que sigue abierta (sin resolver). Se resuelve cuando el
 * estudio ya hizo el ajuste; ahí el cambio de copy queda en `human_edits`.
 */
export async function cargarRetroAbierta(): Promise<RetroWhatsApp[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('wa_feedback')
    .select('id, body, kind, created_at, clients ( name )')
    .is('resolved_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    if (esErrorDeSesion(error)) return []
    throw new Error(`No se pudo leer la retro de WhatsApp: ${error.message}`)
  }

  const retros: RetroWhatsApp[] = []
  for (const fila of data ?? []) {
    retros.push({
      id: fila.id,
      clienteNombre: fila.clients?.name ?? 'Sin cliente',
      body: fila.body,
      kind: esTipoRetro(fila.kind) ? fila.kind : 'comentario',
      createdAt: fila.created_at,
    })
  }
  return retros
}
