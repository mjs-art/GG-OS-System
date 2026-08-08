import { describe, expect, it } from 'vitest'
import {
  avisoDeCruce,
  estadoDePresupuesto,
  evaluarCorrida,
  puedeCorrer,
  UMBRAL_AVISO,
} from '@/domain/presupuesto'

describe('estadoDePresupuesto', () => {
  it('es ok bien por debajo del umbral', () => {
    expect(estadoDePresupuesto(0, 500)).toBe('ok')
    expect(estadoDePresupuesto(399, 500)).toBe('ok') // 79.8%
  })

  it('salta a aviso exactamente en el 80%', () => {
    expect(estadoDePresupuesto(400, 500)).toBe('aviso') // 80% justo
    expect(estadoDePresupuesto(499, 500)).toBe('aviso') // 99.8%
  })

  it('es agotado al alcanzar o pasar el tope', () => {
    expect(estadoDePresupuesto(500, 500)).toBe('agotado')
    expect(estadoDePresupuesto(650, 500)).toBe('agotado')
  })

  it('trata un tope de 0 como agotado, no como gratis infinito', () => {
    expect(estadoDePresupuesto(0, 0)).toBe('agotado')
    expect(estadoDePresupuesto(10, 0)).toBe('agotado')
  })

  it('no se cae por error de redondeo en la frontera del 80%', () => {
    // Un tope donde 0.8*tope no es entero: 0.8*333 = 266.4. El centavo 266
    // sigue por debajo, el 267 ya toca.
    expect(estadoDePresupuesto(266, 333)).toBe('ok')
    expect(estadoDePresupuesto(267, 333)).toBe('aviso')
  })

  it('UMBRAL_AVISO documenta el 80%', () => {
    expect(UMBRAL_AVISO).toBe(0.8)
  })
})

describe('puedeCorrer', () => {
  it('deja correr mientras quede margen', () => {
    expect(puedeCorrer({ topeCents: 500, gastadoCents: 0 })).toBe(true)
    expect(puedeCorrer({ topeCents: 500, gastadoCents: 499 })).toBe(true)
    expect(puedeCorrer({ topeCents: 500, gastadoCents: 400 })).toBe(true) // en aviso, aún corre
  })

  it('detiene al alcanzar o pasar el tope', () => {
    expect(puedeCorrer({ topeCents: 500, gastadoCents: 500 })).toBe(false)
    expect(puedeCorrer({ topeCents: 500, gastadoCents: 501 })).toBe(false)
  })

  it('un tope de 0 nunca deja correr', () => {
    expect(puedeCorrer({ topeCents: 0, gastadoCents: 0 })).toBe(false)
  })
})

describe('evaluarCorrida', () => {
  it('marca el cruce del 80% una sola vez, en la corrida que lo cruza', () => {
    // Justo antes del umbral; esta corrida lo cruza.
    const cruce = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 390, costoCents: 20 })
    expect(cruce.estadoAntes).toBe('ok')
    expect(cruce.estadoDespues).toBe('aviso')
    expect(cruce.cruzoAviso).toBe(true)
    expect(cruce.gastadoDespuesCents).toBe(410)
    expect(cruce.restanteCents).toBe(90)

    // Ya estaba en aviso: no vuelve a marcar el cruce.
    const yaArriba = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 410, costoCents: 20 })
    expect(yaArriba.estadoAntes).toBe('aviso')
    expect(yaArriba.cruzoAviso).toBe(false)
  })

  it('marca el cruce aunque la corrida salte directo a agotado', () => {
    const salto = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 100, costoCents: 450 })
    expect(salto.estadoAntes).toBe('ok')
    expect(salto.estadoDespues).toBe('agotado')
    expect(salto.cruzoAviso).toBe(true)
    expect(salto.restanteCents).toBe(0) // clamp: no queda negativo
    expect(salto.gastadoDespuesCents).toBe(550)
  })

  it('no marca cruce cuando se queda en ok', () => {
    const cerca = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 100, costoCents: 50 })
    expect(cerca.estadoDespues).toBe('ok')
    expect(cerca.cruzoAviso).toBe(false)
    expect(cerca.restanteCents).toBe(350)
  })

  it('una corrida de costo 0 no cambia de franja ni cruza', () => {
    const gratis = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 390, costoCents: 0 })
    expect(gratis.estadoAntes).toBe('ok')
    expect(gratis.estadoDespues).toBe('ok')
    expect(gratis.cruzoAviso).toBe(false)
  })

  it('reporta la fracción para mostrar', () => {
    const e = evaluarCorrida({ topeCents: 500, gastadoAntesCents: 200, costoCents: 50 })
    expect(e.fraccionDespues).toBeCloseTo(0.5)
  })
})

describe('avisoDeCruce', () => {
  it('arma la pregunta con el porcentaje y los montos en dólares', () => {
    const aviso = avisoDeCruce(410, 500)
    expect(aviso.pregunta).toContain('82%') // 410/500
    expect(aviso.pregunta).toContain('$4.10 de $5.00 USD')
  })

  it('ofrece subir el tope, pausar o seguir', () => {
    const keys = avisoDeCruce(410, 500).opciones.map((o) => o.key)
    expect(keys).toEqual(['subir_tope', 'pausar', 'seguir'])
  })

  it('no truena con tope 0: reporta 100%', () => {
    expect(avisoDeCruce(0, 0).pregunta).toContain('100%')
  })
})
