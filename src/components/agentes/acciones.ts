'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { AGENT_KEYS } from '@/agents/contracts'
import { AGENT_LABEL } from '@/domain/labels'
import { createClient } from '@/lib/supabase/server'

/**
 * Encender o apagar un agente.
 *
 * Es la única escritura de toda la sección. `agent_runs` es append-only y la
 * escribe el runner con service_role: desde el navegador no se puede insertar
 * ni corregir una corrida, y eso es a propósito — si se pudiera, se podrían
 * falsear costos y borrar el rastro de lo que hizo un agente.
 *
 * Quién puede hacerlo lo decide RLS (`agent_policies: solo el owner
 * configura`), no un `if` de aquí. Esta acción solo revisa **cuántos renglones
 * cambiaron**, porque un UPDATE que la política filtró no lanza error: afecta
 * cero renglones y regresa en silencio.
 */

export interface EstadoSwitch {
  status: 'inicial' | 'ok' | 'error'
  mensaje?: string
}

const schema = z.object({
  agente: z.enum(AGENT_KEYS),
  clienteId: z.uuid(),
  // FormData.get() devuelve strings; el booleano se reconstruye aquí.
  encender: z.enum(['true', 'false']).transform((valor) => valor === 'true'),
})

export async function cambiarEstadoAgente(
  _previo: EstadoSwitch,
  formData: FormData,
): Promise<EstadoSwitch> {
  // FormData.get() devuelve **null** cuando el campo no viene, no `undefined`.
  // El schema lo rechaza en vez de dejar pasar un `undefined` que se vuelva
  // "apagar todos" tres capas abajo.
  const parsed = schema.safeParse({
    agente: formData.get('agente'),
    clienteId: formData.get('clienteId'),
    encender: formData.get('encender'),
  })

  if (!parsed.success) {
    return { status: 'error', mensaje: 'No se entendió qué agente cambiar. Recarga la pantalla.' }
  }

  const { agente, clienteId, encender } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('agent_policies')
    .update({ enabled: encender })
    .eq('client_id', clienteId)
    .eq('agent', agente)
    .select('id')

  if (error) {
    return { status: 'error', mensaje: `No se pudo cambiar el agente: ${error.message}` }
  }

  // Cero renglones tiene dos causas y no se pueden distinguir desde aquí: la
  // política la filtró RLS (no eres owner), o el cliente todavía no tiene
  // renglón para ese agente. El mensaje nombra las dos en vez de acusar a la
  // primera, que es la que mandaría a alguien a pedir permisos que ya tiene.
  if (!data || data.length === 0) {
    return {
      status: 'error',
      mensaje: `No se pudo cambiar el ${AGENT_LABEL[agente]}: o no eres owner del estudio, o este cliente todavía no tiene política para ese agente.`,
    }
  }

  revalidatePath('/agentes', 'layout')

  return {
    status: 'ok',
    mensaje: encender
      ? `${AGENT_LABEL[agente]} encendido. Mídelo un mes antes de encender el segundo.`
      : `${AGENT_LABEL[agente]} apagado.`,
  }
}
