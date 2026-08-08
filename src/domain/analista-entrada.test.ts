import { describe, expect, it } from 'vitest'
import {
  construirNoPublicadas,
  construirPiecePerformance,
  engagementPct,
  totalesDeMes,
  type PiezaMedida,
  type PiezaPendiente,
} from '@/domain/analista-entrada'

describe('engagementPct', () => {
  it('es interacciones sobre alcance, en porcentaje', () => {
    expect(engagementPct(50, 1000)).toBe(5)
    expect(engagementPct(33, 1000)).toBe(3.3) // redondea a un decimal
  })

  it('sin alcance es 0, no una división por cero', () => {
    expect(engagementPct(10, 0)).toBe(0)
    expect(engagementPct(0, 0)).toBe(0)
  })

  it('acota a 100 cuando las interacciones rebasan el alcance', () => {
    expect(engagementPct(1500, 1000)).toBe(100)
  })
})

describe('construirPiecePerformance', () => {
  const medida: PiezaMedida = {
    piece_id: '00000000-0000-4000-8000-000000000001',
    format: 'reel',
    pillar: 'Detrás de la barra',
    published_at: '2026-07-10T18:00:00.000Z',
    hook: 'lo que nadie te dijo del mezcal',
    reach: 2000,
    interactions: 240,
    saves: 80,
    shares: 12,
  }

  it('calcula el engagement y deja la retención en null (no la capturamos)', () => {
    const [p] = construirPiecePerformance([medida])
    expect(p?.engagement_pct).toBe(12) // 240/2000
    expect(p?.retention_3s_pct).toBeNull()
    expect(p?.reach).toBe(2000)
    expect(p?.pillar).toBe('Detrás de la barra')
    expect(p?.published_at).toBe('2026-07-10T18:00:00.000Z')
  })
})

describe('construirNoPublicadas', () => {
  it('recorta el timestamp de publish_at a la fecha que pide el contrato', () => {
    const pendiente: PiezaPendiente = {
      piece_id: '00000000-0000-4000-8000-000000000002',
      publish_at: '2026-08-20T15:30:00.000Z',
      format: 'carrusel',
      pillar: 'Educativo',
      hook: null,
      status: 'aprobado',
    }
    const [p] = construirNoPublicadas([pendiente])
    expect(p?.scheduled_on).toBe('2026-08-20')
    expect(p?.status).toBe('aprobado')
  })
})

describe('totalesDeMes', () => {
  it('un mes sin datos es todo en cero, no un error', () => {
    expect(totalesDeMes(null)).toEqual({
      reach: 0,
      impressions: 0,
      saves: 0,
      shares: 0,
      profile_visits: 0,
      link_clicks: 0,
      new_followers: 0,
    })
  })

  it('pasa los totales tal cual cuando existen', () => {
    const row = {
      reach: 12000,
      impressions: 18000,
      saves: 340,
      shares: 60,
      profile_visits: 900,
      link_clicks: 120,
      new_followers: 45,
    }
    expect(totalesDeMes(row)).toEqual(row)
  })
})
