'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Registra la decisión del cliente sobre una pieza.
 *
 * Insert y no update: `approvals` es append-only. "Ya lo habías aprobado"
 * tiene que ser demostrable, y si la última decisión sobrescribiera a la
 * anterior, el historial de una pieza que se aprobó, se cambió y se volvió a
 * aprobar quedaría reducido a una línea.
 */

const schema = z.object({
  decision: z.enum(['aprobado', 'cambios']),
  nota: z.string().max(4000).nullish(),
})

export interface EstadoDecision {
  status: 'inicial' | 'listo' | 'error'
  message?: string
}

export async function decidirPieza(
  clientId: string,
  pieceId: string,
  _prev: EstadoDecision,
  formData: FormData,
): Promise<EstadoDecision> {
  const parsed = schema.safeParse({
    decision: formData.get('decision'),
    nota: formData.get('nota'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'No se entendió la respuesta. Vuelve a intentar.' }
  }

  const { decision, nota } = parsed.data

  // La base tiene el mismo CHECK, pero atraparlo aquí da un mensaje humano en
  // vez de un error de constraint.
  if (decision === 'cambios' && !nota?.trim()) {
    return { status: 'error', message: 'Escribe qué le cambiamos para que el estudio sepa.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { status: 'error', message: 'Se cerró tu sesión. Vuelve a abrir la liga del correo.' }
  }

  /**
   * No se verifica aquí que el usuario tenga acceso a esta pieza.
   *
   * La política `approvals: el portal decide` ya exige que sea contacto del
   * cliente, que `decided_by` sea él mismo, y que la pieza esté visible para
   * él. Un `client_id` o un `piece_id` manipulados desde el navegador no pasan
   * el WITH CHECK y el insert falla. Repetir esa lógica en TypeScript sería
   * una segunda fuente de verdad que algún día se desincroniza.
   */
  const { error } = await supabase.from('approvals').insert({
    org_id: (await orgDe(clientId)) ?? '',
    client_id: clientId,
    piece_id: pieceId,
    decided_by: user.id,
    decision,
    note: nota?.trim() || null,
  })

  if (error) {
    return {
      status: 'error',
      message: 'No se pudo guardar tu respuesta. Vuelve a intentar en un momento.',
    }
  }

  revalidatePath('/aprobar/[token]', 'page')

  return {
    status: 'listo',
    message: decision === 'aprobado' ? 'Aprobada. Gracias.' : 'Mandamos tu cambio al estudio.',
  }
}

/**
 * El `org_id` está desnormalizado en `approvals` y el trigger de la base exige
 * que coincida con el del cliente. Se lee del propio cliente en vez de
 * confiarlo al navegador: mandarlo desde el formulario sería darle al cliente
 * la oportunidad de escribir en otra org, y aunque el trigger lo detendría, no
 * hay razón para ofrecerle el intento.
 */
async function orgDe(clientId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('clients').select('org_id').eq('id', clientId).maybeSingle()
  return data?.org_id ?? null
}
