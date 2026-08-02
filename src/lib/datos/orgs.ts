import 'server-only'

import { createClient } from '@/lib/supabase/server'

export interface OrgDelUsuario {
  id: string
  name: string
  slug: string
}

/**
 * Las organizaciones donde el usuario con sesión es miembro del estudio.
 *
 * No filtra por usuario a mano: RLS de `orgs` ya solo devuelve las del miembro
 * (`app.is_org_member`). En la práctica es una sola —Ana Gz Studio— pero el
 * alta de clientes tiene que elegir a cuál cuelga el cliente, así que se lee la
 * lista en vez de asumir la primera.
 */
export async function orgsDelUsuario(): Promise<OrgDelUsuario[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.from('orgs').select('id, name, slug').order('name')

  if (error) throw new Error(`No se pudieron leer las organizaciones: ${error.message}`)

  return (data ?? []).map((o) => ({ id: o.id, name: o.name, slug: o.slug }))
}
