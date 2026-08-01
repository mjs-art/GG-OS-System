import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * Corre como el usuario que hizo la petición, así que TODA consulta pasa por
 * RLS. Ese es el punto: la autorización vive en la base, no en la app. Un
 * `select` que se le olvidó filtrar por cliente no filtra datos — la base lo
 * detiene.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Llamado desde un Server Component: las cookies son de solo
            // lectura ahí. El middleware ya refrescó la sesión, así que
            // ignorarlo es correcto y no deja al usuario deslogueado.
          }
        },
      },
    },
  )
}

/**
 * Devuelve el usuario verificado contra el servidor de auth.
 *
 * Usa getUser(), NUNCA getSession(): la sesión sale de la cookie y la cookie
 * la manda el cliente. Confiar en getSession() para decidir permisos es
 * confiar en un dato que el atacante controla.
 */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new Error('UNAUTHENTICATED')
  }

  return { supabase, user }
}
