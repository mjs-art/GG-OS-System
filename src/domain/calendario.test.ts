import { describe, expect, it } from 'vitest'
import { agruparPorDia, construirMes, fechaLocal } from './calendario'
import { fixedClock } from '@/lib/time'

describe('construirMes', () => {
  it('siempre devuelve semanas completas de siete días', () => {
    for (const mes of ['2026-01', '2026-02', '2026-08', '2026-09', '2027-02'] as const) {
      const semanas = construirMes(mes, '2026-09-14')
      for (const semana of semanas) {
        expect(semana, `${mes} tiene una semana incompleta`).toHaveLength(7)
      }
    }
  })

  it('empieza en domingo', () => {
    const semanas = construirMes('2026-09', '2026-09-14')
    expect(semanas[0]?.[0]?.diaSemana).toBe(0)
  })

  it('cubre todos los días del mes y ninguno de más', () => {
    const dias = construirMes('2026-09', '2026-09-14')
      .flat()
      .filter((d) => d.delMes)
    expect(dias).toHaveLength(30)
    expect(dias[0]?.diaDelMes).toBe(1)
    expect(dias.at(-1)?.diaDelMes).toBe(30)
  })

  it('maneja febrero bisiesto', () => {
    // 2028 es bisiesto; 2026 no.
    const bisiesto = construirMes('2028-02', '2026-09-14')
      .flat()
      .filter((d) => d.delMes)
    const normal = construirMes('2026-02', '2026-09-14')
      .flat()
      .filter((d) => d.delMes)
    expect(bisiesto).toHaveLength(29)
    expect(normal).toHaveLength(28)
  })

  it('rellena con días del mes vecino en vez de dejar huecos', () => {
    const semanas = construirMes('2026-09', '2026-09-14')
    const primera = semanas[0]
    expect(primera?.some((d) => !d.delMes)).toBe(true)
    // Y el relleno de la izquierda es del mes anterior, no del siguiente.
    expect(primera?.[0]?.fecha.startsWith('2026-08')).toBe(true)
  })

  it('cruza el fin de año en el relleno', () => {
    const enero = construirMes('2026-01', '2026-09-14')
    expect(enero[0]?.[0]?.fecha.startsWith('2025-12')).toBe(true)

    const diciembre = construirMes('2026-12', '2026-09-14')
    expect(diciembre.at(-1)?.at(-1)?.fecha.startsWith('2027-01')).toBe(true)
  })

  it('marca hoy una sola vez', () => {
    const hoy = construirMes('2026-09', '2026-09-14')
      .flat()
      .filter((d) => d.esHoy)
    expect(hoy).toHaveLength(1)
    expect(hoy[0]?.diaDelMes).toBe(14)
  })

  it('no marca ningún día si hoy cae fuera del mes mostrado', () => {
    const marcados = construirMes('2026-05', '2026-09-14')
      .flat()
      .filter((d) => d.esHoy)
    expect(marcados).toHaveLength(0)
  })
})

describe('fechaLocal', () => {
  it('usa la zona del estudio, no UTC', () => {
    // 1 de octubre 03:00 UTC = 30 de septiembre 20:00 en Tijuana.
    // Sin esto, la última noche de cada mes las piezas saltan de mes.
    expect(fechaLocal(fixedClock('2026-10-01T03:00:00Z').now())).toBe('2026-09-30')
  })
})

describe('agruparPorDia', () => {
  it('agrupa por día ignorando la hora', () => {
    const piezas = [
      { id: 'a', publishAt: '2026-09-14T19:00:00-07:00' },
      { id: 'b', publishAt: '2026-09-14T21:30:00-07:00' },
      { id: 'c', publishAt: '2026-09-15T10:00:00-07:00' },
    ]
    const mapa = agruparPorDia(piezas, (p) => p.publishAt)
    expect(mapa.get('2026-09-14')).toHaveLength(2)
    expect(mapa.get('2026-09-15')).toHaveLength(1)
  })

  it('descarta lo que no tiene fecha en vez de agruparlo bajo null', () => {
    const mapa = agruparPorDia([{ f: null }, { f: '2026-09-01' }], (x) => x.f)
    expect(mapa.size).toBe(1)
  })

  it('acepta fechas ya en formato de día', () => {
    const mapa = agruparPorDia([{ f: '2026-09-01' }], (x) => x.f)
    expect(mapa.get('2026-09-01')).toHaveLength(1)
  })
})
