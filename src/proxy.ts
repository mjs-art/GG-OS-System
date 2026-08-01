import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'

/**
 * Refresca la sesión en cada navegación.
 *
 * Se llama `proxy` y no `middleware` porque Next 16 renombró la convención;
 * es el mismo punto del ciclo de petición.
 *
 * Los Server Components no pueden escribir cookies, así que si el token expira
 * a media sesión no hay quién lo renueve y el usuario se cae. Este es el único
 * lugar del ciclo que sí puede, y por eso corre aquí.
 *
 * OJO: esto NO es la capa de autorización. No decides aquí quién ve qué —
 * eso lo hace RLS en la base. Aquí solo se mantiene la sesión viva y se manda
 * al login a quien no la tenga.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() valida el token contra el servidor de auth. getSession() solo lee
  // la cookie, que la manda el cliente; usarla para decidir acceso sería
  // confiar en un dato que el atacante controla.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublic =
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/aprobar') ||
    pathname.startsWith('/auth/callback')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    url.searchParams.set('destino', pathname)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Todo menos estáticos e imágenes. El negativo se escribe así y no como
     * lista blanca porque olvidar agregar una ruta nueva a una lista blanca
     * la deja sin sesión; olvidarla aquí no rompe nada.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
}
