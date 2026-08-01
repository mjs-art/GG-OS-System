import { describe, expect, it } from 'vitest'
import { addMonths, fixedClock, formatMonthKey, parseMonthKey, toMonthKey } from './time'

describe('parseMonthKey', () => {
  it('acepta el formato canónico', () => {
    expect(parseMonthKey('2026-09')).toBe('2026-09')
  })

  it('rechaza mes 00 y mes 13', () => {
    expect(() => parseMonthKey('2026-00')).toThrow()
    expect(() => parseMonthKey('2026-13')).toThrow()
  })

  it('rechaza el mes sin cero a la izquierda', () => {
    // '2026-9' ordenaría mal como texto, que es justo cómo se ordena en la BD.
    expect(() => parseMonthKey('2026-9')).toThrow()
  })

  it('el mensaje de error dice qué se esperaba', () => {
    expect(() => parseMonthKey('septiembre')).toThrow(/AAAA-MM/)
  })
})

describe('addMonths', () => {
  it('avanza dentro del mismo año', () => {
    expect(addMonths('2026-01', 2)).toBe('2026-03')
  })

  it('cruza el fin de año hacia adelante', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
  })

  it('cruza el fin de año hacia atrás', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
  })

  it('mantiene el cero a la izquierda', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-08', 1)).toBe('2026-09')
  })

  it('aguanta saltos grandes en ambas direcciones', () => {
    expect(addMonths('2026-06', 24)).toBe('2028-06')
    expect(addMonths('2026-06', -24)).toBe('2024-06')
  })

  it('delta cero es identidad', () => {
    expect(addMonths('2026-09', 0)).toBe('2026-09')
  })
})

describe('toMonthKey', () => {
  it('usa la zona horaria del estudio, no la del servidor', () => {
    // 1 de octubre, 03:00 UTC = 30 de septiembre, 20:00 en Tijuana.
    // Un servidor en UTC diría octubre y el planner mostraría el mes
    // equivocado la última noche de cada mes.
    const clock = fixedClock('2026-10-01T03:00:00Z')
    expect(toMonthKey(clock.now())).toBe('2026-09')
  })

  it('a media mañana coincide con el mes obvio', () => {
    expect(toMonthKey(fixedClock('2026-09-15T18:00:00Z').now())).toBe('2026-09')
  })
})

describe('formatMonthKey', () => {
  it('se lee como se presenta al cliente', () => {
    expect(formatMonthKey('2026-09')).toBe('septiembre 2026')
  })
})

describe('fixedClock', () => {
  it('regresa siempre el mismo instante', () => {
    const clock = fixedClock('2026-09-01T12:00:00Z')
    expect(clock.now().getTime()).toBe(clock.now().getTime())
  })

  it('no deja mutar el instante congelado desde afuera', () => {
    const clock = fixedClock('2026-09-01T12:00:00Z')
    const first = clock.now()
    first.setFullYear(1999)
    expect(clock.now().getUTCFullYear()).toBe(2026)
  })

  it('truena con una fecha inválida en vez de regresar Invalid Date', () => {
    expect(() => fixedClock('no es fecha')).toThrow()
  })
})
