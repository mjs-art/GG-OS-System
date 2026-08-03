import { NextResponse } from 'next/server'
import { z } from 'zod'
import { crearClienteInstagram } from '@/lib/apis/instagram'
import { sincronizarCuentasApify } from '@/lib/apis/redes-sync'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

const entrada = z.object({ clientId: z.uuid() })

/**
 * Sincroniza los datos frescos de Instagram para todas las cuentas conectadas
 * de un cliente: seguidores, fecha del último post y publicaciones de la semana.
 *
 * Intenta Apify primero (sin verificación de Meta), luego Instagram Graph API.
 * Sin ningún token configurado, devuelve ok con `apiNoDisponible`.
 */
export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Falta el clientId.' }, { status: 400 })
  }
  const { clientId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  const env = serverEnv()

  const { data: cuentas } = await supabase
    .from('social_accounts')
    .select('id, platform, client_id, handle')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')

  if (!cuentas?.length) {
    return NextResponse.json({
      ok: true,
      message: 'El cliente no tiene cuentas de Instagram registradas.',
    })
  }

  const actualizadas: string[] = []
  const fallos: string[] = []

  // Apify primero — no necesita verificación de Meta
  if (env.APIFY_API_TOKEN) {
    const { actualizadas: ok, fallos: mal } = await sincronizarCuentasApify({
      supabase,
      apifyToken: env.APIFY_API_TOKEN,
      cuentas: cuentas.map((c) => ({ id: c.id, handle: c.handle })),
      ahora: systemClock.now(),
    })

    return NextResponse.json({
      ok: true,
      origen: 'apify',
      actualizadas: ok.length,
      fallos: mal.length,
      message:
        mal.length > 0
          ? `${ok.length} cuentas actualizadas vía Apify, ${mal.length} fallaron.`
          : `${ok.length} cuentas actualizadas vía Apify.`,
    })
  }

  // Fallback: Instagram Graph API directa
  const token = env.INSTAGRAM_LONG_LIVED_TOKEN
  if (!token) {
    return NextResponse.json({
      ok: true,
      apiNoDisponible: true,
      message:
        'Ni Apify ni Instagram Graph API están configurados. Las métricas se capturan a mano.',
    })
  }

  const cliente = crearClienteInstagram({ token, businessAccountId: 'me' })
  const frescos = await cliente.datosFrescos()

  if (!frescos) {
    return NextResponse.json({
      ok: false,
      message:
        'El token de Instagram no tiene acceso a la cuenta. Revisa que el token esté vigente.',
    })
  }

  for (const cuenta of cuentas) {
    const { error } = await supabase
      .from('social_accounts')
      .update({
        followers: frescos.followers,
        last_post_at: frescos.lastPostAt ?? null,
        posts_per_week: frescos.postsThisWeek,
        checked_at: systemClock.now().toISOString(),
        // Graph API oficial: sí trae insights privados. 'api', no 'apify'.
        source: 'api',
      })
      .eq('id', cuenta.id)

    if (error) {
      fallos.push(cuenta.id)
    } else {
      actualizadas.push(cuenta.id)
    }
  }

  return NextResponse.json({
    ok: true,
    origen: 'instagram-api',
    actualizadas: actualizadas.length,
    fallos: fallos.length,
    message:
      fallos.length > 0
        ? `${actualizadas.length} cuentas actualizadas, ${fallos.length} fallaron.`
        : `${actualizadas.length} cuentas actualizadas.`,
  })
}
