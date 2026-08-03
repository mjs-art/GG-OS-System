import 'server-only'

import { leerTopPosts, type ReferenceKind, type TopPost } from '@/domain/referencias'
import { createClient } from '@/lib/supabase/server'

/**
 * Lectura de § Referencias: la competencia y las cuentas de inspiración.
 *
 * Como el resto de `lib/datos`, no filtra por org a mano: eso lo hace RLS, y hay
 * una prueba de pgTAP (`rls_referencias_test`) que verifica que el portal de
 * cliente no ve nada de esto.
 */

export interface CuentaDeReferencia {
  id: string
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin'
  handle: string
  url: string | null
  label: string | null
  kind: ReferenceKind
  followers: number
  lastPostAt: string | null
  postsPerWeek: number
  /** Snapshot de los posts con más engagement, ya recortado. */
  topPosts: TopPost[]
  checkedAt: string | null
}

/** Primero la competencia, luego la inspiración; dentro, el más grande arriba. */
const ORDEN_KIND: Record<ReferenceKind, number> = { competencia: 0, inspiracion: 1 }

export async function listarReferencias(clientId: string): Promise<CuentaDeReferencia[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reference_accounts')
    .select('*')
    .eq('client_id', clientId)

  if (error) {
    throw new Error(`No se pudieron leer las cuentas de referencia: ${error.message}`)
  }

  return (data ?? [])
    .map((r) => ({
      id: r.id,
      platform: r.platform,
      handle: r.handle,
      url: r.url,
      label: r.label,
      kind: r.kind,
      followers: r.followers,
      lastPostAt: r.last_post_at,
      // numeric(5,2) llega como number en runtime pero el tipo no lo garantiza.
      postsPerWeek: Number(r.posts_per_week),
      topPosts: leerTopPosts(r.top_posts),
      checkedAt: r.checked_at,
    }))
    .sort((a, b) => ORDEN_KIND[a.kind] - ORDEN_KIND[b.kind] || b.followers - a.followers)
}
