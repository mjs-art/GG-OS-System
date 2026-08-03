import 'server-only'

import { resumirPostsApify, type PostApify } from '@/domain/redes'
import type { createClient } from '@/lib/supabase/server'
import { ACTORES, crearClienteApify } from './apify'

/**
 * Sincroniza las cuentas de un cliente contra los scrapers de Apify.
 *
 * Vive aparte porque lo llaman dos lugares: el job `sync-redes` y el server
 * action del botón "Sincronizar" en § Redes. Antes cada uno tenía su propia
 * copia del loop, y una copia que se corrige en un lado y no en el otro es
 * exactamente cómo el botón y el job terminan reportando números distintos
 * para la misma cuenta.
 *
 * Apify ve lo público —seguidores, cadencia, último post— y nunca reach ni
 * impresiones. Por eso todo lo que escribe marca `source: 'apify'`: el Analista
 * lo tiene que poder distinguir del dato oficial de Meta.
 *
 * Instagram por ahora. Los Actores de TikTok y Facebook ya están mapeados en
 * `ACTORES`, pero cada uno pide un `input` distinto y esos no se enchufan a
 * ciegas: se agregan cuando se puedan probar contra el Actor real.
 */

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export interface CuentaParaSync {
  id: string
  handle: string | null
}

export interface ResultadoSync {
  actualizadas: string[]
  fallos: string[]
}

export async function sincronizarCuentasApify(opts: {
  supabase: SupabaseServer
  apifyToken: string
  cuentas: readonly CuentaParaSync[]
  ahora: Date
}): Promise<ResultadoSync> {
  const { supabase, apifyToken, cuentas, ahora } = opts
  const apify = crearClienteApify(apifyToken)

  const actualizadas: string[] = []
  const fallos: string[] = []

  for (const cuenta of cuentas) {
    const handle = cuenta.handle?.replace(/^@/, '') ?? ''
    if (!handle) {
      fallos.push(cuenta.id)
      continue
    }

    const posts = await apify.ejecutar(ACTORES.instagram, {
      usernames: [handle],
      resultsLimit: 20,
    })

    if (!posts || posts.length === 0) {
      fallos.push(cuenta.id)
      continue
    }

    const resumen = resumirPostsApify(posts as PostApify[], ahora)

    // El conteo de renglones no es opcional: un UPDATE que RLS bloquea afecta
    // cero filas y regresa sin error. Sin esto contaríamos como "actualizada"
    // una cuenta que no se tocó.
    const { error, data } = await supabase
      .from('social_accounts')
      .update({
        last_post_at: resumen.ultimoPostAt,
        posts_per_week: resumen.publicacionesPorSemana,
        checked_at: ahora.toISOString(),
        source: 'apify',
      })
      .eq('id', cuenta.id)
      .select('id')

    if (error || (data ?? []).length === 0) {
      fallos.push(cuenta.id)
      continue
    }

    // Los seguidores vienen del Profile Scraper, no del de posts. Si falla, la
    // cuenta ya cuenta como actualizada: la cadencia sí entró, que es lo que
    // mueve el semáforo.
    const perfil = await apify.ejecutar(ACTORES.instagramPerfil, { usernames: [handle] })
    const datos = perfil?.[0] as { followersCount?: number } | undefined
    if (datos?.followersCount) {
      await supabase
        .from('social_accounts')
        .update({ followers: datos.followersCount, source: 'apify' })
        .eq('id', cuenta.id)
    }

    actualizadas.push(cuenta.id)
  }

  return { actualizadas, fallos }
}
