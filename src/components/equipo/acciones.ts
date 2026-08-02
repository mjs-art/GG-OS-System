'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export interface EstadoInvitar {
  status: 'inicial' | 'error' | 'ok'
  mensaje?: string
}

const entrada = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email('Escribe un correo válido.').max(255),
  role: z.enum(['owner', 'staff']),
})

/**
 * El `orgId` no se vuelve a cruzar contra `orgsDelUsuario()` aquí: RLS de
 * `org_invites` ya exige `is_org_owner(org_id)` para el insert. Si alguien
 * manda un orgId ajeno, la base lo rechaza sola — no hay nada que TypeScript
 * tenga que verificar por su cuenta.
 */
export async function invitarAccion(
  _prev: EstadoInvitar,
  formData: FormData,
): Promise<EstadoInvitar> {
  const parsed = entrada.safeParse({
    orgId: formData.get('orgId'),
    email: formData.get('email'),
    role: formData.get('role'),
  })

  if (!parsed.success) {
    return { status: 'error', mensaje: parsed.error.issues[0]?.message ?? 'Revisa el formulario.' }
  }

  const supabase = await createClient()
  const { data: usuario } = await supabase.auth.getUser()
  if (!usuario.user) {
    return { status: 'error', mensaje: 'Tu sesión expiró. Vuelve a entrar.' }
  }

  const { error } = await supabase.from('org_invites').insert({
    org_id: parsed.data.orgId,
    email: parsed.data.email,
    role: parsed.data.role,
    invited_by: usuario.user.id,
  })

  if (error) {
    // 23505: unique_violation. El índice parcial solo permite una invitación
    // pendiente por correo — un mensaje humano, no el nombre del constraint.
    if (error.code === '23505') {
      return { status: 'error', mensaje: 'Ya hay una invitación pendiente para ese correo.' }
    }
    return { status: 'error', mensaje: `No se pudo invitar: ${error.message}` }
  }

  revalidatePath('/ajustes')
  return {
    status: 'ok',
    mensaje: 'Invitación creada. En cuanto esa persona entre con ese correo, se suma al equipo.',
  }
}

export async function cancelarInvitacionAccion(invitacionId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('org_invites').delete().eq('id', invitacionId)

  if (error) {
    throw new Error(`No se pudo cancelar la invitación: ${error.message}`)
  }

  revalidatePath('/ajustes')
}
