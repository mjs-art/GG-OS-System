'use server'

import { z } from 'zod'
import { publicEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

const schema = z.object({
  email: z.email('Ese correo no se ve bien. Revísalo.').max(320),
  // A dónde regresar después de entrar. Se valida en safeDestination.
  //
  // `nullish` y no `optional`: FormData.get() devuelve **null**, no undefined,
  // cuando el campo no viene — y no viene cuando alguien escribe /entrar
  // directo en vez de llegar rebotado desde una ruta protegida. Con
  // `.optional()` esa era la ruta más común y el login quedaba muerto.
  destino: z.string().nullish(),
})

export interface EntrarState {
  status: 'inicial' | 'enviado' | 'error'
  message?: string
}

/**
 * Solo se aceptan destinos internos.
 *
 * Un `destino` sin validar es un open redirect: alguien manda
 * /entrar?destino=https://sitio-falso.com, la víctima entra de verdad, y sale
 * a un clon que le pide sus datos con la confianza ya ganada.
 */
function safeDestination(value: string | null | undefined): string {
  if (!value) return '/'
  if (!value.startsWith('/')) return '/'
  // '//otro-sitio.com' también sale del dominio.
  if (value.startsWith('//')) return '/'
  return value
}

export async function enviarMagicLink(
  _prev: EntrarState,
  formData: FormData,
): Promise<EntrarState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    destino: formData.get('destino'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Revisa el correo que escribiste.',
    }
  }

  const supabase = await createClient()
  const destino = safeDestination(parsed.data.destino)

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?destino=${encodeURIComponent(destino)}`,
      // No crear cuenta desde aquí. El acceso se otorga invitando a la persona
      // en la app; si cualquiera pudiera registrarse, el portal de cliente
      // dejaría de ser una lista blanca.
      shouldCreateUser: false,
    },
  })

  // Ojo: la respuesta es la misma exista o no el correo. Si dijéramos "ese
  // correo no está registrado", cualquiera podría averiguar quién es cliente
  // de quién probando direcciones.
  //
  // 4xx significa "ese correo no tiene acceso" y se responde igual que un
  // éxito. Solo un fallo de infraestructura —5xx, red caída— merece decirle a
  // la persona que vuelva a intentar.
  //
  // El rango se verificó contra la API, no se supuso: un correo sin cuenta
  // devuelve **422 otp_disabled**, no 400. La versión anterior comparaba
  // contra 400 y le enseñaba "no se pudo mandar el correo" a todo el mundo,
  // incluidos los usuarios legítimos.
  const esFalloDeInfraestructura =
    error !== null && (error.status === undefined || error.status >= 500)

  if (esFalloDeInfraestructura) {
    return {
      status: 'error',
      message: 'No se pudo mandar el correo. Vuelve a intentar en un momento.',
    }
  }

  return {
    status: 'enviado',
    message: `Si ese correo tiene acceso, ya te llegó un link para entrar. Ábrelo desde este dispositivo.`,
  }
}
