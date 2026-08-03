/**
 * Cuentas de referencia: la competencia y la inspiración.
 *
 * Lo puro y probable de la sección vive aquí: cómo se elige el puñado de posts
 * que se enseñan para inspiración, y cómo se lee sin miedo el jsonb `top_posts`
 * —que lo llena un scraper y por lo tanto su forma no la garantiza nadie.
 *
 * El semáforo y la cadencia de estas cuentas son los mismos de @/domain/redes:
 * una cuenta de referencia se resume igual que una propia. Lo que cambia es el
 * uso, no el cálculo.
 */

import { z } from 'zod'
import type { PostApify } from '@/domain/redes'

/** Cuántos posts se guardan y se enseñan por cuenta. Un vistazo, no un archivo. */
export const TOP_POSTS_POR_CUENTA = 6

export type ReferenceKind = 'competencia' | 'inspiracion'

/**
 * Un post de referencia, ya recortado a lo que la interfaz muestra.
 *
 * `at` y `url` pueden faltar: un scrape a veces no los trae, y una tarjeta sin
 * fecha vale más que una sección en blanco.
 */
/**
 * `type` y no `interface` a propósito: un array de esto se guarda tal cual en el
 * jsonb `top_posts`, y el tipo `Json` de Supabase solo acepta objetos con firma
 * de índice implícita — que los alias de tipo tienen y las interfaces no.
 */
export type TopPost = {
  caption: string
  likes: number
  comments: number
  url: string | null
  at: string | null
}

/** El scrape trae más que esto; solo se nombra lo que se usa para elegir y mostrar. */
export interface PostScrape extends PostApify {
  caption?: string
  url?: string
}

function engagement(post: PostScrape): number {
  return (post.likesCount ?? 0) + (post.commentsCount ?? 0)
}

/**
 * Los posts con más engagement, de más a menos, recortados a `limite`.
 *
 * Se ordena por likes más comentarios porque es lo único público y comparable
 * entre cuentas: reach e impresiones no se ven de fuera. No es la métrica
 * perfecta, es la única honesta con datos scrapeados, y se documenta.
 */
export function mejoresPosts(
  posts: readonly PostScrape[],
  limite: number = TOP_POSTS_POR_CUENTA,
): TopPost[] {
  return [...posts]
    .sort((a, b) => engagement(b) - engagement(a))
    .slice(0, Math.max(0, limite))
    .map((post) => ({
      caption: post.caption ?? '',
      likes: post.likesCount ?? 0,
      comments: post.commentsCount ?? 0,
      url: post.url ?? null,
      at: post.timestamp ?? null,
    }))
}

/**
 * Lee el jsonb `top_posts` sin confiar en su forma.
 *
 * Cada campo tiene default y el arreglo entero cae a `[]` si viene algo que no
 * es una lista. Un snapshot mal formado no vale una pantalla rota: se muestra
 * lo que se pueda y se ignora el resto en silencio, como el resto de los jsonb
 * libres del esquema.
 */
export const topPostsSchema = z
  .array(
    z
      .object({
        caption: z.string().catch(''),
        likes: z.number().catch(0),
        comments: z.number().catch(0),
        url: z.string().nullish().catch(null),
        at: z.string().nullish().catch(null),
      })
      .transform((p) => ({
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        url: p.url ?? null,
        at: p.at ?? null,
      })),
  )
  .catch([])

export function leerTopPosts(valor: unknown): TopPost[] {
  return topPostsSchema.parse(valor)
}
