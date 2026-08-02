import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Canjea el código del magic link por una sesión.
 *
 * El `destino` viene en la URL, así que se trata como input hostil: solo se
 * aceptan rutas internas. Sin esa validación esto sería un open redirect
 * disfrazado de flujo de login, que es la peor variante — la víctima ya
 * confía porque acabó de entrar de verdad.
 */
function safeDestination(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

/**
 * Redirect con `Location` RELATIVO, a propósito.
 *
 * Esto costó una sesión de depuración y vale la pena dejarlo escrito.
 *
 * Ni `request.nextUrl.origin` ni `request.url` sirven aquí: los dos reflejan
 * la idea que el servidor tiene de sí mismo, no el host por el que de verdad
 * entró la petición. Con `next start` resolvían a `localhost:3000` mientras el
 * navegador venía de `127.0.0.1:3000`.
 *
 * El síntoma era de los peores. El intercambio del código funcionaba, la
 * cookie de sesión se escribía bien... en `127.0.0.1`. Y acto seguido el
 * redirect mandaba al usuario a `localhost`, que para el navegador es OTRO
 * origen y por lo tanto otro frasco de cookies. Sesión creada, usuario
 * deslogueado, cero errores en consola. Detrás de un proxy —Vercel— es el
 * mismo riesgo con otro nombre.
 *
 * Un `Location` relativo lo resuelve el navegador contra el origen en el que
 * YA está. Cruzar de origen deja de ser posible en vez de depender de que el
 * servidor adivine bien su propio nombre.
 */
function redirigirA(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } })
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const destino = safeDestination(request.nextUrl.searchParams.get('destino'))

  if (!code) {
    return redirigirA('/entrar?error=link_invalido')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Un link caducado o ya usado. El mensaje no distingue entre los dos:
    // ninguno de los dos casos le sirve a quien no debería estar aquí.
    return redirigirA('/entrar?error=link_invalido')
  }

  return redirigirA(destino)
}
