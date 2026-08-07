import { describe, expect, it } from 'vitest'
import {
  rendimientoPorFormato,
  rendimientoPorPilar,
  type MedicionDePieza,
} from './estratega-entrada'

const m = (over: Partial<MedicionDePieza>): MedicionDePieza => ({
  format: 'post',
  pillarId: 'pil-1',
  reach: 1000,
  saves: 10,
  interactions: 50,
  ...over,
})

describe('rendimiento por formato', () => {
  it('promedia por formato y omite los que no tuvieron piezas', () => {
    const filas = rendimientoPorFormato([
      m({ format: 'reel', reach: 4000 }),
      m({ format: 'reel', reach: 2000 }),
      m({ format: 'post', reach: 800 }),
    ])
    expect(filas.map((f) => f.format)).toEqual(['post', 'reel']) // no 'carrusel'
    const reel = filas.find((f) => f.format === 'reel')
    expect(reel?.pieces).toBe(2)
    expect(reel?.avg_reach).toBe(3000)
  })

  it('el engagement se saca de los totales y se acota a 100', () => {
    // interacciones (1500) > alcance (1000) daría 150%: se acota.
    const [fila] = rendimientoPorFormato([m({ reach: 1000, interactions: 1500 })])
    expect(fila?.avg_engagement_pct).toBe(100)
  })

  it('alcance cero da 0% de engagement, no NaN', () => {
    const [fila] = rendimientoPorFormato([m({ reach: 0, interactions: 0 })])
    expect(fila?.avg_engagement_pct).toBe(0)
  })

  it('el alcance en no seguidores va en cero: no se rastrea por pieza todavía', () => {
    const [fila] = rendimientoPorFormato([m({})])
    expect(fila?.avg_non_follower_reach).toBe(0)
  })
})

describe('rendimiento por pilar', () => {
  const pilares = [
    { id: 'pil-1', name: 'Producto', targetPct: 40 },
    { id: 'pil-2', name: 'Comunidad', targetPct: 60 },
  ]

  it('siempre devuelve un renglón por pilar, aunque no tenga piezas', () => {
    const filas = rendimientoPorPilar([], pilares)
    expect(filas).toHaveLength(2)
    expect(filas.every((f) => f.actual_pct === 0 && f.avg_reach === 0)).toBe(true)
  })

  it('el actual es la parte de piezas medidas que cayeron en el pilar', () => {
    const filas = rendimientoPorPilar(
      [
        m({ pillarId: 'pil-1', reach: 1000 }),
        m({ pillarId: 'pil-1', reach: 3000 }),
        m({ pillarId: 'pil-2', reach: 500 }),
      ],
      pilares,
    )
    const p1 = filas.find((f) => f.pillar === 'Producto')
    expect(p1?.actual_pct).toBeCloseTo(66.67, 1)
    expect(p1?.avg_reach).toBe(2000)
  })
})
