import { NextResponse } from 'next/server'
import { z } from 'zod'
import { ACTORES, crearClienteApify } from '@/lib/apis/apify'
import { crearClienteInstagram } from '@/lib/apis/instagram'
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
    const apify = crearClienteApify(env.APIFY_API_TOKEN)

    for (const cuenta of cuentas) {
      const handle = cuenta.handle?.replace(/^@/, '') ?? ''
      if (!handle) {
        fallos.push(cuenta.id)
        continue
      }

      const resultados = await apify.ejecutar(ACTORES.instagram, {
        usernames: [handle],
        resultsLimit: 20,
      })

      if (!resultados || resultados.length === 0) {
        fallos.push(cuenta.id)
        continue
      }

      const posts = resultados as Array<{
        timestamp?: string
        likesCount?: number
        commentsCount?: number
      }>

      const ahora = systemClock.now()
      const semanaMs = 7 * 24 * 60 * 60 * 1000
      const postsEstaSemana = posts.filter((p) => {
        if (!p.timestamp) return false
        return ahora.getTime() - new Date(p.timestamp).getTime() <= semanaMs
      }).length

      const ultimoPost = posts.reduce<(typeof posts)[0] | null>((a, b) => {
        if (!a?.timestamp) return b
        if (!b.timestamp) return a
        return b.timestamp > a.timestamp ? b : a
      }, null)

      // Seguidores vienen del Profile Scraper, no del post scraper.
      // Por ahora, si solo tenemos el post scraper, los seguidores se mantienen.
      const { error } = await supabase
        .from('social_accounts')
        .update({
          last_post_at: ultimoPost?.timestamp ?? null,
          posts_per_week: postsEstaSemana,
          checked_at: ahora.toISOString(),
          // Scrape público: sin reach ni impresiones. El Analista lo distingue
          // del dato oficial de Meta por esta marca de procedencia.
          source: 'apify',
        })
        .eq('id', cuenta.id)

      if (error) {
        fallos.push(cuenta.id)
        console.warn(`Apify · no se pudo actualizar ${cuenta.id}: ${error.message}`)
      } else {
        actualizadas.push(cuenta.id)
      }
    }

    // También jalar seguidores si hay Profile Scraper
    for (const cuenta of cuentas) {
      const handle = cuenta.handle?.replace(/^@/, '') ?? ''
      if (!handle) continue

      const perfil = await apify.ejecutar(ACTORES.instagramPerfil, {
        usernames: [handle],
      })

      if (!perfil || perfil.length === 0) continue

      const datos = perfil[0] as { followersCount?: number }
      if (datos.followersCount) {
        await supabase
          .from('social_accounts')
          .update({ followers: datos.followersCount, source: 'apify' })
          .eq('id', cuenta.id)
      }
    }

    return NextResponse.json({
      ok: true,
      origen: 'apify',
      actualizadas: actualizadas.length,
      fallos: fallos.length,
      message:
        fallos.length > 0
          ? `${actualizadas.length} cuentas actualizadas vía Apify, ${fallos.length} fallaron.`
          : `${actualizadas.length} cuentas actualizadas vía Apify.`,
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
