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

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const destino = safeDestination(searchParams.get('destino'))

  if (!code) {
    return NextResponse.redirect(`${origin}/entrar?error=link_invalido`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Un link caducado o ya usado. El mensaje no distingue entre los dos:
    // ninguno de los dos casos le sirve a quien no debería estar aquí.
    return NextResponse.redirect(`${origin}/entrar?error=link_invalido`)
  }

  return NextResponse.redirect(`${origin}${destino}`)
}
