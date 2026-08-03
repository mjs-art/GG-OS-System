import { describe, expect, it } from 'vitest'
import {
  leerTopPosts,
  mejoresPosts,
  TOP_POSTS_POR_CUENTA,
  type PostScrape,
} from '@/domain/referencias'

describe('mejoresPosts', () => {
  it('ordena por engagement (likes + comentarios), de más a menos', () => {
    const posts: PostScrape[] = [
      { caption: 'medio', likesCount: 10, commentsCount: 5 }, // 15
      { caption: 'top', likesCount: 100, commentsCount: 2 }, // 102
      { caption: 'bajo', likesCount: 1, commentsCount: 1 }, // 2
    ]
    expect(mejoresPosts(posts).map((p) => p.caption)).toEqual(['top', 'medio', 'bajo'])
  })

  it('recorta al límite pedido', () => {
    const posts: PostScrape[] = Array.from({ length: 10 }, (_, i) => ({
      caption: `p${i}`,
      likesCount: i,
    }))
    expect(mejoresPosts(posts, 3)).toHaveLength(3)
  })

  it('por default enseña seis, no toda la lista', () => {
    const posts: PostScrape[] = Array.from({ length: 20 }, (_, i) => ({ likesCount: i }))
    expect(mejoresPosts(posts)).toHaveLength(TOP_POSTS_POR_CUENTA)
  })

  it('trata likes y comentarios ausentes como cero, no truena', () => {
    const posts: PostScrape[] = [{ caption: 'sin numeros' }, { caption: 'con', likesCount: 3 }]
    const top = mejoresPosts(posts)
    expect(top[0]?.caption).toBe('con')
    expect(top[1]?.likes).toBe(0)
  })

  it('mapea los campos que la interfaz muestra, con nulls donde falten', () => {
    const [post] = mejoresPosts([
      {
        caption: 'hola',
        likesCount: 5,
        commentsCount: 1,
        url: 'https://x/1',
        timestamp: '2026-08-01',
      },
    ])
    expect(post).toEqual({
      caption: 'hola',
      likes: 5,
      comments: 1,
      url: 'https://x/1',
      at: '2026-08-01',
    })
  })
})

describe('leerTopPosts', () => {
  it('lee un snapshot bien formado', () => {
    const valor = [{ caption: 'a', likes: 3, comments: 1, url: 'https://x/1', at: '2026-08-01' }]
    expect(leerTopPosts(valor)).toEqual(valor)
  })

  it('rellena campos faltantes con defaults en vez de descartar el post', () => {
    expect(leerTopPosts([{ caption: 'solo caption' }])).toEqual([
      { caption: 'solo caption', likes: 0, comments: 0, url: null, at: null },
    ])
  })

  it('un jsonb que no es lista cae a vacío, no a una pantalla rota', () => {
    expect(leerTopPosts(null)).toEqual([])
    expect(leerTopPosts({ no: 'soy lista' })).toEqual([])
    expect(leerTopPosts('texto')).toEqual([])
  })
})
