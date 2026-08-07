import { describe, expect, it } from 'vitest'
import { clasificarPiezas, type PiezaParaPreparar } from './preparar-mes'

const base: PiezaParaPreparar = {
  id: 'p',
  status: 'idea',
  hook: null,
  idea: 'jueves de jazz',
  pillarId: 'pil-1',
  platforms: ['instagram'],
}

const pieza = (over: Partial<PiezaParaPreparar> & { id: string }): PiezaParaPreparar => ({
  ...base,
  ...over,
})

describe('clasificar piezas para preparar el mes', () => {
  it('corre solo sobre lo que está en idea, sin hook y con insumos', () => {
    const { candidatas } = clasificarPiezas([pieza({ id: 'lista' })])
    expect(candidatas.map((p) => p.id)).toEqual(['lista'])
  })

  it('nunca pisa una pieza que ya tiene hook', () => {
    // El activo real del sistema es el copy editado por una persona; reescribir
    // en lote lo borraría. Una pieza con hook cuenta como ya trabajada.
    const { candidatas, yaTrabajadas } = clasificarPiezas([pieza({ id: 'x', hook: 'ya escrito' })])
    expect(candidatas).toHaveLength(0)
    expect(yaTrabajadas).toBe(1)
  })

  it('no toca lo que ya avanzó en el pipeline aunque no tenga hook', () => {
    for (const status of ['escrito', 'revisado', 'con_cliente', 'aprobado', 'publicado'] as const) {
      const { candidatas, yaTrabajadas } = clasificarPiezas([pieza({ id: status, status })])
      expect(candidatas).toHaveLength(0)
      expect(yaTrabajadas).toBe(1)
    }
  })

  it('separa las que están sin escribir pero les falta un insumo', () => {
    const { candidatas, sinInsumos } = clasificarPiezas([
      pieza({ id: 'sin-idea', idea: '   ' }),
      pieza({ id: 'sin-pilar', pillarId: null }),
      pieza({ id: 'sin-red', platforms: [] }),
    ])
    expect(candidatas).toHaveLength(0)
    expect(sinInsumos.map((p) => p.id).sort()).toEqual(['sin-idea', 'sin-pilar', 'sin-red'])
  })

  it('trata un hook de solo espacios como sin escribir', () => {
    const { candidatas } = clasificarPiezas([pieza({ id: 'blanco', hook: '   ' })])
    expect(candidatas.map((p) => p.id)).toEqual(['blanco'])
  })

  it('reparte un mes mezclado en las tres canastas', () => {
    const clas = clasificarPiezas([
      pieza({ id: 'a' }),
      pieza({ id: 'b' }),
      pieza({ id: 'ya', hook: 'hecho' }),
      pieza({ id: 'falta', idea: null }),
    ])
    expect(clas.candidatas).toHaveLength(2)
    expect(clas.yaTrabajadas).toBe(1)
    expect(clas.sinInsumos).toHaveLength(1)
  })
})
