import { describe, expect, it } from 'vitest'
import {
  construirCuentasAuditor,
  parsearChecklist,
  type CuentaCruda,
} from '@/domain/auditor-entrada'

function cruda(over: Partial<CuentaCruda> = {}): CuentaCruda {
  return {
    platform: 'instagram',
    handle: '@bar_ficticio',
    url: 'https://instagram.com/bar_ficticio',
    followers: 1200,
    followers_delta: 40,
    last_post_at: '2026-08-01T18:00:00.000Z',
    posts_per_week: 3,
    target_per_week: 5,
    profile_checklist: { bio: true, link: true, highlights: false, photo: true },
    unanswered_dms: 2,
    unanswered_comments: 0,
    ...over,
  }
}

describe('parsearChecklist', () => {
  it('lee las cuatro banderas cuando vienen', () => {
    expect(parsearChecklist({ bio: true, link: true, highlights: true, photo: true })).toEqual({
      bio: true,
      link: true,
      highlights: true,
      photo: true,
    })
  })

  it('lo que falta o no es exactamente true cuenta como pendiente', () => {
    expect(parsearChecklist({ bio: true, link: 'sí', photo: 1 })).toEqual({
      bio: true,
      link: false, // 'sí' no es true
      highlights: false, // ausente
      photo: false, // 1 no es true
    })
  })

  it('un jsonb que no es objeto no truena: todo pendiente', () => {
    expect(parsearChecklist(null)).toEqual({
      bio: false,
      link: false,
      highlights: false,
      photo: false,
    })
    expect(parsearChecklist(['bio'])).toEqual({
      bio: false,
      link: false,
      highlights: false,
      photo: false,
    })
  })
})

describe('construirCuentasAuditor', () => {
  it('renombra los campos a los nombres del contrato', () => {
    const [cuenta] = construirCuentasAuditor([cruda({ followers_delta: -30, target_per_week: 7 })])
    expect(cuenta?.followers_delta_30d).toBe(-30)
    expect(cuenta?.target_posts_per_week).toBe(7)
    expect(cuenta?.posts_per_week).toBe(3)
  })

  it('un handle vacío o nulo cae al nombre de la red (el contrato lo exige no vacío)', () => {
    expect(construirCuentasAuditor([cruda({ handle: null })])[0]?.handle).toBe('instagram')
    expect(construirCuentasAuditor([cruda({ handle: '   ' })])[0]?.handle).toBe('instagram')
    expect(construirCuentasAuditor([cruda({ handle: '@real' })])[0]?.handle).toBe('@real')
  })

  it('un url vacío se vuelve null; una liga real pasa', () => {
    expect(construirCuentasAuditor([cruda({ url: '' })])[0]?.url).toBeNull()
    expect(construirCuentasAuditor([cruda({ url: '  ' })])[0]?.url).toBeNull()
    expect(construirCuentasAuditor([cruda({ url: 'https://x.com/a' })])[0]?.url).toBe(
      'https://x.com/a',
    )
  })

  it('estrecha el checklist libre a las cuatro banderas', () => {
    const [cuenta] = construirCuentasAuditor([
      cruda({ profile_checklist: { bio: true, link: false, extra: true } }),
    ])
    expect(cuenta?.profile_checklist).toEqual({
      bio: true,
      link: false,
      highlights: false,
      photo: false,
    })
  })

  it('preserva last_post_at nulo tal cual', () => {
    expect(construirCuentasAuditor([cruda({ last_post_at: null })])[0]?.last_post_at).toBeNull()
  })
})
