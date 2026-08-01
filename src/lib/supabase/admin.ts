import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * ⚠️  Cliente con service_role. SALTA TODO EL RLS.
 *
 * Está permitido en exactamente tres lugares:
 *   1. El runner de agentes (escribe agent_runs, que `authenticated` no puede).
 *   2. Aprovisionamiento: crear una org, invitar al primer owner.
 *   3. Scripts de migración de datos que corren fuera de la petición.
 *
 * Está PROHIBIDO en cualquier ruta que responda a un usuario. Si un archivo
 * bajo src/app/ importa esto, es un hallazgo de seguridad, no un detalle de
 * implementación: cualquier bug de parámetros se vuelve una fuga total.
 *
 * Regla práctica: si el `client_id` con el que vas a filtrar viene de la
 * petición, no uses este cliente. Usa el de sesión y deja que RLS decida.
 */
export function createAdminClient() {
  const env = serverEnv()

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no está configurada. ' +
        'Solo los jobs de agentes y los scripts de aprovisionamiento la necesitan.',
    )
  }

  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        // Sin esto, un token de usuario que ande en el contexto podría
        // sobrescribir al service_role y el bypass fallaría en silencio.
        detectSessionInUrl: false,
      },
    },
  )
}
