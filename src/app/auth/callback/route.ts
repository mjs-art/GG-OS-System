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
 * La respuesta se construye a partir del request para que los cookies que
 * `exchangeCodeForSession` escribió viajen en el redirect. Un
 * `new NextResponse(null, ...)` crea una respuesta vacía y los cookies de
 * sesión no llegan al navegador — el proxy no encuentra al usuario y lo manda
 * de vuelta a /entrar.
 *
 * En producción el `Location` se genera con el dominio real que Vercel pone
 * en el header `Host`. El caso `localhost` vs `127.0.0.1` que mordió en dev
 * local se maneja en el proxy, que ya está escrito para ese escenario.
 */
function redirigirA(request: NextRequest, path: string): NextResponse {
  const url = request.nextUrl.clone()
  const index = path.indexOf('?')
  url.pathname = index === -1 ? path : path.slice(0, index)
  url.search = index === -1 ? '' : path.slice(index)
  return NextResponse.redirect(url, 303)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const destino = safeDestination(request.nextUrl.searchParams.get('destino'))

  if (!code) {
    return redirigirA(request, '/entrar?error=link_invalido')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Un link caducado o ya usado. El mensaje no distingue entre los dos:
    // ninguno de los dos casos le sirve a quien no debería estar aquí.
    return redirigirA(request, '/entrar?error=link_invalido')
  }

  // Si alguien te invitó al equipo mientras no tenías cuenta (o mientras no
  // habías vuelto a entrar), aquí es donde esa invitación se convierte en
  // membership. Un error aquí no debe tumbar el login: en el peor caso, la
  // invitación se acepta la próxima vez que se corra este mismo código.
  await supabase.rpc('accept_pending_invites')

  return redirigirA(request, destino)
}
