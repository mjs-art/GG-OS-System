'use client'

import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Cliente para el navegador. Solo lleva la llave anónima, que es pública por
 * diseño: lo que protege los datos es RLS, no el secreto de esta llave.
 *
 * Úsalo únicamente para lo que necesita ser interactivo en tiempo real
 * (realtime, auth). Toda lectura y escritura de datos debe pasar por un Server
 * Component o una Server Action, donde el input se valida antes de tocar la
 * base.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  client ??= createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  return client
}
