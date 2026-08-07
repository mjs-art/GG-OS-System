import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { cargarContextCard, renderContextCard } from '@/agents/context-card'
import { proveedorDeEnv } from '@/agents/correr'
import type { AgentInput } from '@/agents/registry'
import { runAgent } from '@/agents/runner'
import { createAgentStore } from '@/agents/store'
import { serverEnv } from '@/lib/env'
import type { Database } from '@/lib/supabase/database.types'
import { parseMonthKey, systemClock } from '@/lib/time'

/**
 * El compositor del agente de Cuenta cuando entra un WhatsApp del cliente:
 * redacta un BORRADOR de respuesta. No manda nada — deja el borrador en
 * `wa_messages` (outbound, 'borrador') para que Ana lo revise y apruebe
 * (regla #1). La corrida queda en `agent_runs` con su costo y su tope, igual
 * que cualquier otro agente (regla #5): esto NO es un bot de n8n contestando
 * solo, es un agente auditado que propone.
 *
 * Lee con el cliente admin porque lo dispara la ruta de entrada, donde no hay
 * sesión de usuario: quien llama es n8n. Es best-effort desde el punto de vista
 * de la ruta: el mensaje entrante ya se guardó, y si aquí no hay política,
 * Context Card o saldo, simplemente no hay borrador — nunca al revés.
 */

export type ResultadoCuentaWhatsApp =
  | { readonly ok: true; readonly tipo: 'borrador' | 'escalado'; readonly runId: string }
  | { readonly ok: true; readonly tipo: 'saltado'; readonly motivo: string }
  | { readonly ok: false; readonly code: string; readonly message: string }

/** Cuántos mensajes de la conversación se le dan al agente como contexto. */
const VENTANA = 30

export async function correrCuentaWhatsApp(
  admin: SupabaseClient<Database>,
  conversationId: string,
): Promise<ResultadoCuentaWhatsApp> {
  const { data: conv, error: errorConv } = await admin
    .from('wa_conversations')
    .select('id, org_id, client_id')
    .eq('id', conversationId)
    .maybeSingle()

  if (errorConv)
    return {
      ok: false,
      code: 'lectura',
      message: `No se pudo leer la conversación: ${errorConv.message}`,
    }
  if (!conv) return { ok: true, tipo: 'saltado', motivo: 'la conversación ya no existe' }

  const { data: cliente } = await admin
    .from('clients')
    .select('name')
    .eq('id', conv.client_id)
    .maybeSingle()
  if (!cliente) return { ok: true, tipo: 'saltado', motivo: 'el cliente ya no existe' }

  // La conversación reciente, de la más nueva a la más vieja; se invierte para
  // dárselo al agente en orden de lectura.
  const { data: recientes } = await admin
    .from('wa_messages')
    .select('direction, body, media, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(VENTANA)

  const mensajes = (recientes ?? []).slice().reverse()
  const ultimoEntrante = [...mensajes].reverse().find((m) => m.direction === 'inbound')

  // Sin un entrante no hay a qué responder. Puede pasar si el hilo solo tiene
  // salientes: no es un error, simplemente no se redacta nada.
  if (!ultimoEntrante)
    return { ok: true, tipo: 'saltado', motivo: 'no hay mensaje del cliente que responder' }

  const card = await cargarContextCard(admin, conv.client_id)
  // El agente responde en la voz de la marca; sin Context Card no tiene con qué.
  if (!card) return { ok: true, tipo: 'saltado', motivo: 'el cliente no tiene Context Card' }

  // Piezas esperando aprobación del cliente, por si el mensaje pregunta por ellas.
  const { count: pendientes } = await admin
    .from('pieces')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', conv.client_id)
    .eq('status', 'con_cliente')

  const tieneMedia = Array.isArray(ultimoEntrante.media) && ultimoEntrante.media.length > 0

  const input: AgentInput<'cuenta'> = {
    task: 'whatsapp_respuesta',
    client_id: conv.client_id,
    month: parseMonthKey(systemClock.now().toISOString().slice(0, 7)),
    context_version: card.version,
    client_name: cliente.name,
    incoming: { body: ultimoEntrante.body, has_media: tieneMedia },
    history: mensajes.map((m) => ({
      direction: m.direction === 'outbound' ? 'outbound' : 'inbound',
      body: m.body,
    })),
    pending_approvals: pendientes ?? 0,
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('cuenta', input, {
    orgId: conv.org_id,
    clientId: conv.client_id,
    contextCard: renderContextCard(card),
    contextVersion: card.version,
    // Lo disparó un evento (el WhatsApp del cliente), no una persona: no hay
    // usuario que firme el disparo.
    trigger: 'evento',
    triggeredBy: null,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: serverEnv().AGENTS_PROVIDER,
  })

  if (!result.ok) return { ok: false, code: result.error.code, message: result.error.message }

  // Escalar es correcto: el runner ya lo dejó en la Bandeja. No se redacta
  // borrador, la duda la resuelve una persona.
  if (result.output.kind === 'escalamiento')
    return { ok: true, tipo: 'escalado', runId: result.runId }

  const data = result.output.data
  // El agente corrió con task 'whatsapp_respuesta', así que su salida es esa;
  // el estrechamiento es para el compilador, no un caso que pueda ocurrir.
  if (data.task !== 'whatsapp_respuesta')
    return {
      ok: false,
      code: 'salida_inesperada',
      message: 'La salida no es una respuesta de WhatsApp.',
    }

  const { error } = await admin.from('wa_messages').insert({
    org_id: conv.org_id,
    client_id: conv.client_id,
    conversation_id: conv.id,
    direction: 'outbound',
    status: 'borrador',
    body: data.reply,
    authored_by_agent: 'cuenta',
  })

  if (error)
    return {
      ok: false,
      code: 'escritura',
      message: `El agente redactó la respuesta pero no se pudo guardar el borrador: ${error.message}`,
    }

  return { ok: true, tipo: 'borrador', runId: result.runId }
}
