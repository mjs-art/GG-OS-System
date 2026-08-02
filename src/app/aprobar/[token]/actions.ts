'use server'

import { z } from 'zod'
import { verificarTokenPortal } from '@/domain/portal-token'
import { publicEnv, serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * La puerta del portal de cliente.
 *
 * Es la única superficie del sistema que toca gente de fuera del estudio, así
 * que el diseño va al revés de lo habitual: en vez de preguntarse qué dejar
 * pasar, se pregunta qué es lo mínimo que hay que revelar.
 */

const schema = z.object({
  email: z.email('Ese correo no se ve bien. Revísalo.').max(320),
})

export interface EstadoPortal {
  status: 'inicial' | 'enviado' | 'error'
  message?: string
}

/**
 * La MISMA respuesta pase lo que pase.
 *
 * Si dijéramos "ese correo no tiene acceso", cualquiera con la liga podría
 * averiguar quién es contacto de quién probando direcciones — y la liga se
 * reenvía por WhatsApp todo el tiempo. Tampoco cambia el tiempo de respuesta
 * de forma observable, porque el trabajo pesado (mandar el correo) ocurre
 * igual de rápido en los dos casos desde afuera.
 */
const RESPUESTA_NEUTRA: EstadoPortal = {
  status: 'enviado',
  message:
    'Si ese correo tiene acceso, ya te llegó una liga para entrar. Ábrela desde este dispositivo.',
}

export async function pedirAccesoPortal(
  token: string,
  _prev: EstadoPortal,
  formData: FormData,
): Promise<EstadoPortal> {
  // `.nullish()` y no `.optional()`: FormData.get() devuelve null, no undefined.
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa el correo.' }
  }

  const env = serverEnv()
  if (!env.CLIENT_PORTAL_TOKEN_SECRET) {
    // Falta configuración del servidor. No es culpa de quien está del otro
    // lado, así que no se le echa encima un detalle que no puede arreglar.
    return {
      status: 'error',
      message: 'El portal no está disponible en este momento. Avísale a tu contacto en el estudio.',
    }
  }

  const verificado = verificarTokenPortal(token, env.CLIENT_PORTAL_TOKEN_SECRET, systemClock.now())
  if (!verificado.ok) {
    return {
      status: 'error',
      message:
        verificado.motivo === 'expirado'
          ? 'Esta liga ya venció. Pídele una nueva a tu contacto en el estudio.'
          : 'Esta liga no es válida. Pídele una nueva a tu contacto en el estudio.',
    }
  }

  /**
   * Aquí NO se consulta la lista blanca, y esa es la decisión importante.
   *
   * El primer intento leía `client_users` con service_role para decidir si
   * mandar el correo. Funcionaba, pero metía un bypass de RLS en una ruta que
   * responde a un anónimo — y ESLint lo bloqueó, con razón.
   *
   * Al buscar la alternativa resultó que la verificación sobraba. `signInWithOtp`
   * con `shouldCreateUser: false` ya solo manda correo a quien tiene cuenta, y
   * el filtro que de verdad importa —"¿es contacto de ESTE cliente?"— lo hace
   * RLS cuando la página se renderiza: si no lo es, no ve nada aunque entre.
   *
   * Quitar el chequeo mejoró dos cosas a la vez: se fue el bypass, y se fue un
   * oráculo. Cualquier función que respondiera "este correo sí es contacto de
   * este cliente" es, por definición, algo que un atacante puede consultar.
   */
  const supabase = await createClient()
  const destino = `/aprobar/${encodeURIComponent(token)}`

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?destino=${encodeURIComponent(destino)}`,
      // Nunca se crea cuenta desde aquí. El acceso se otorga invitando a la
      // persona en la app; si cualquiera pudiera registrarse, la lista blanca
      // dejaría de significar algo.
      shouldCreateUser: false,
    },
  })

  // 4xx es "ese correo no puede entrar" y se responde igual que un éxito.
  // Solo un fallo de infraestructura merece pedir que se reintente.
  if (error && (error.status === undefined || error.status >= 500)) {
    return {
      status: 'error',
      message: 'No se pudo mandar el correo. Vuelve a intentar en un momento.',
    }
  }

  return RESPUESTA_NEUTRA
}
