import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * El equipo del estudio: quién puede ser responsable de una pieza.
 *
 * Igual que el resto de `lib/datos`, el `org_id` acota la consulta pero no
 * autoriza: `org_members` tiene su propia política y un miembro solo ve a su
 * equipo.
 *
 * ⚠️ LO QUE FALTA, Y HAY QUE DECIRLO: el nombre de las personas vive en
 * `auth.users.raw_user_meta_data`, y el esquema `auth` no está expuesto por
 * PostgREST — a propósito. `org_members` guarda `user_id` y `role`, nada más.
 * Resultado: de la persona con la sesión abierta sí sabemos cómo se llama
 * (`getUser()` la trae), y del resto del equipo solo tenemos su UUID.
 *
 * El arreglo de verdad es una tabla `public.profiles` con el nombre, alimentada
 * por un trigger sobre `auth.users`. Eso es una migración, y las migraciones no
 * son de este cambio. Mientras tanto se muestra una etiqueta honesta —
 * `Miembro 3f2a1b9c` — en vez de inventar un nombre: un "Ana" que en realidad
 * es otra persona es peor que un identificador feo.
 */

export type RolDeEquipo = 'owner' | 'staff'

export interface MiembroDelEstudio {
  userId: string
  role: RolDeEquipo
  /** Ya listo para pintar. Ver la nota de arriba sobre por qué a veces es un id. */
  nombre: string
  /** Es quien tiene la sesión abierta. Se marca para poder asignarse rápido. */
  esTu: boolean
}

/** La etiqueta de alguien de quien solo conocemos el identificador. */
export function nombreProvisional(userId: string): string {
  return `Miembro ${userId.slice(0, 8)}`
}

export async function listarEquipo(orgId: string): Promise<MiembroDelEstudio[]> {
  const supabase = await createClient()

  // getUser() y no getSession(): la sesión sale de la cookie y la cookie la
  // manda el cliente. Aquí solo decide una etiqueta, pero la regla no tiene
  // excepciones cómodas.
  const [miembrosRes, usuarioRes] = await Promise.all([
    supabase.from('org_members').select('user_id, role').eq('org_id', orgId),
    supabase.auth.getUser(),
  ])

  if (miembrosRes.error) {
    throw new Error(`No se pudo leer el equipo del estudio: ${miembrosRes.error.message}`)
  }

  const yo = usuarioRes.data.user
  const miNombre =
    typeof yo?.user_metadata?.['name'] === 'string' ? (yo.user_metadata['name'] as string) : null

  return (miembrosRes.data ?? [])
    .map((m) => {
      const esTu = m.user_id === yo?.id
      return {
        userId: m.user_id,
        role: m.role,
        nombre: esTu ? (miNombre ?? 'Tú') : nombreProvisional(m.user_id),
        esTu,
      }
    })
    .sort((a, b) => {
      // Tú primero: asignarse una pieza a uno mismo es el caso más común.
      if (a.esTu !== b.esTu) return a.esTu ? -1 : 1
      if (a.role !== b.role) return a.role === 'owner' ? -1 : 1
      return a.nombre.localeCompare(b.nombre, 'es-MX')
    })
}
