import { describe, expect, it } from 'vitest'
import {
  agruparRendimiento,
  calcularVariacion,
  DESVIACION_MAXIMA_PILAR,
  distribucionPorPilar,
  formatearCompacto,
  formatearContraAnterior,
  formatearNumero,
  formatearPorcentaje,
  indiceDelMejor,
  porcentaje,
  promedio,
  puntosDeLinea,
  serieDeSeguidores,
  type PiezaMedida,
} from '@/domain/metricas'
import { parseMonthKey } from '@/lib/time'

describe('calcularVariacion', () => {
  it('calcula el porcentaje contra el mes anterior', () => {
    const v = calcularVariacion(1240, 1000)
    expect(v.delta).toBe(240)
    expect(v.pct).toBeCloseTo(24)
    expect(v.tendencia).toBe('up')
    expect(v.esBueno).toBe(true)
  })

  it('una caída en una métrica de "mayor es mejor" es mala noticia', () => {
    const v = calcularVariacion(800, 1000)
    expect(v.tendencia).toBe('down')
    expect(v.esBueno).toBe(false)
    expect(v.pct).toBeCloseTo(-20)
  })

  it('en costo por resultado, bajar es la buena noticia', () => {
    const v = calcularVariacion(3100, 8400, 'menor_es_mejor')
    expect(v.tendencia).toBe('down')
    expect(v.esBueno).toBe(true)
  })

  it('en costo por resultado, subir es la mala', () => {
    const v = calcularVariacion(8400, 3100, 'menor_es_mejor')
    expect(v.tendencia).toBe('up')
    expect(v.esBueno).toBe(false)
  })

  /* El caso que rompe una división ingenua. */
  it('no inventa un porcentaje cuando el mes anterior es cero', () => {
    const v = calcularVariacion(187, 0)
    expect(v.pct).toBeNull()
    expect(v.delta).toBe(187)
    expect(v.tendencia).toBe('up')
    expect(v.etiqueta).toContain('187')
    expect(v.etiqueta).not.toContain('%')
    expect(Number.isNaN(v.pct as unknown as number)).toBe(false)
  })

  it('cero contra cero no es un cambio', () => {
    const v = calcularVariacion(0, 0)
    expect(v.tendencia).toBe('flat')
    expect(v.esBueno).toBe(false)
    expect(v.etiqueta).toBe('igual')
  })

  it('sin mes anterior lo dice, en vez de comparar contra cero', () => {
    const v = calcularVariacion(4200, null)
    expect(v.delta).toBeNull()
    expect(v.pct).toBeNull()
    expect(v.etiqueta).toBe('sin mes anterior')
  })

  it('un anterior negativo no voltea el signo del porcentaje', () => {
    // Seguidores nuevos puede ser negativo. -50 → -100 es una caída del 100%,
    // no una subida: dividir entre el valor con signo daría +100%.
    const v = calcularVariacion(-100, -50)
    expect(v.tendencia).toBe('down')
    expect(v.pct).toBeCloseTo(-100)
  })
})

describe('promedio y porcentaje', () => {
  it('el promedio de cero piezas es cero, no NaN', () => {
    expect(promedio(0, 0)).toBe(0)
    expect(promedio(500, 0)).toBe(0)
  })

  it('promedia normal', () => {
    expect(promedio(282, 3)).toBe(94)
  })

  it('el porcentaje sobre un total en cero es cero, no NaN', () => {
    expect(porcentaje(4, 0)).toBe(0)
  })
})

describe('indiceDelMejor', () => {
  const renglones = [
    { nombre: 'post', alcance: 1240, costo: 8400 },
    { nombre: 'carrusel', alcance: 2180, costo: 3100 },
    { nombre: 'reel', alcance: 3890, costo: 5200 },
  ]

  it('el mejor alcance es el más alto', () => {
    expect(indiceDelMejor(renglones, (r) => r.alcance, 'mayor_es_mejor')).toBe(2)
  })

  it('el mejor costo por resultado es el más BAJO', () => {
    expect(indiceDelMejor(renglones, (r) => r.costo, 'menor_es_mejor')).toBe(1)
  })

  it('sin renglones no hay mejor', () => {
    expect(indiceDelMejor([], (r: { alcance: number }) => r.alcance, 'mayor_es_mejor')).toBe(-1)
  })

  it('un empate se queda con el primero', () => {
    const empate = [{ v: 10 }, { v: 10 }]
    expect(indiceDelMejor(empate, (r) => r.v, 'mayor_es_mejor')).toBe(0)
  })

  it('ignora renglones sin dato en vez de resaltar un NaN', () => {
    const sucios = [{ v: Number.NaN }, { v: 5 }, { v: Number.NaN }]
    expect(indiceDelMejor(sucios, (r) => r.v, 'mayor_es_mejor')).toBe(1)
  })

  it('si ningún renglón tiene dato, no resalta ninguno', () => {
    const sucios = [{ v: Number.NaN }, { v: Number.POSITIVE_INFINITY }]
    expect(indiceDelMejor(sucios, (r) => r.v, 'menor_es_mejor')).toBe(-1)
  })
})

describe('agruparRendimiento', () => {
  const piezas: PiezaMedida[] = [
    { clave: 'reel', reach: 4000, saves: 40, shares: 30, impressions: 6000, interactions: 200 },
    { clave: 'reel', reach: 2000, saves: 20, shares: 10, impressions: 3000, interactions: 100 },
    { clave: 'post', reach: 800, saves: 8, shares: 2, impressions: 1000, interactions: 40 },
  ]

  it('promedia por clave', () => {
    const filas = agruparRendimiento(piezas)
    const reel = filas.find((f) => f.clave === 'reel')
    expect(reel?.piezas).toBe(2)
    expect(reel?.alcancePromedio).toBe(3000)
    expect(reel?.guardadosPromedio).toBe(30)
    expect(reel?.compartidosPromedio).toBe(20)
  })

  it('el engagement pesa por alcance, no promedia porcentajes', () => {
    // 300 interacciones sobre 6,000 de alcance = 5%. Promediar los dos
    // porcentajes por pieza también daría 5% aquí, así que el caso que
    // distingue es el de abajo.
    const filas = agruparRendimiento(piezas)
    expect(filas.find((f) => f.clave === 'reel')?.engagementPct).toBeCloseTo(5)
  })

  it('una pieza chica que salió bien no infla el engagement del formato', () => {
    const mezcla: PiezaMedida[] = [
      { clave: 'post', reach: 5000, saves: 0, shares: 0, impressions: 0, interactions: 50 },
      { clave: 'post', reach: 50, saves: 0, shares: 0, impressions: 0, interactions: 25 },
    ]
    const fila = agruparRendimiento(mezcla)[0]
    // Ponderado: 75/5050 ≈ 1.49%. El promedio de porcentajes daría 25.5%.
    expect(fila?.engagementPct).toBeCloseTo(1.485, 2)
  })

  it('alcance en cero no produce NaN en engagement', () => {
    const filas = agruparRendimiento([
      { clave: 'reel', reach: 0, saves: 0, shares: 0, impressions: 0, interactions: 0 },
    ])
    expect(filas[0]?.engagementPct).toBe(0)
  })

  it('sin piezas devuelve una tabla vacía', () => {
    expect(agruparRendimiento([])).toEqual([])
  })
})

describe('serieDeSeguidores', () => {
  const meses = [
    { mes: parseMonthKey('2026-04'), nuevos: 100 },
    { mes: parseMonthKey('2026-05'), nuevos: 150 },
    { mes: parseMonthKey('2026-06'), nuevos: 200 },
  ]

  it('el último punto es el total de hoy', () => {
    const serie = serieDeSeguidores(8420, meses)
    expect(serie.at(-1)).toEqual({ mes: '2026-06', total: 8420 })
  })

  it('reconstruye hacia atrás restando lo que se ganó después', () => {
    const serie = serieDeSeguidores(8420, meses)
    expect(serie.map((p) => p.total)).toEqual([8070, 8220, 8420])
  })

  it('nunca dibuja seguidores negativos aunque los deltas no cuadren', () => {
    const serie = serieDeSeguidores(50, meses)
    expect(serie.every((p) => p.total >= 0)).toBe(true)
    expect(serie[0]?.total).toBe(0)
  })

  it('sin meses capturados no hay curva', () => {
    expect(serieDeSeguidores(8420, [])).toEqual([])
  })
})

describe('puntosDeLinea', () => {
  it('reparte los puntos a lo ancho', () => {
    const puntos = puntosDeLinea([0, 5, 10], 100, 40)
    expect(puntos.map((p) => p.x)).toEqual([0, 50, 100])
    expect(puntos[0]?.y).toBe(40)
    expect(puntos[2]?.y).toBe(0)
  })

  it('una serie plana se dibuja a media altura en vez de NaN', () => {
    const puntos = puntosDeLinea([7, 7, 7], 100, 40)
    expect(puntos.every((p) => p.y === 20)).toBe(true)
  })

  it('un solo punto va al centro, sin dividir entre cero', () => {
    const puntos = puntosDeLinea([7], 100, 40)
    expect(puntos).toEqual([{ x: 50, y: 20 }])
  })

  it('sin datos no hay línea', () => {
    expect(puntosDeLinea([], 100, 40)).toEqual([])
  })

  it('el padding deja aire arriba y abajo', () => {
    const puntos = puntosDeLinea([0, 10], 100, 40, 4)
    expect(puntos[0]?.y).toBe(36)
    expect(puntos[1]?.y).toBe(4)
  })
})

describe('distribucionPorPilar', () => {
  const pilares = [
    { id: 'p1', nombre: 'Coctelería de autor', color: 'var(--color-pillar-1)', objetivoPct: 40 },
    { id: 'p2', nombre: 'Ambiente y música', color: 'var(--color-pillar-2)', objetivoPct: 35 },
    { id: 'p3', nombre: 'Detrás de la barra', color: 'var(--color-pillar-3)', objetivoPct: 25 },
  ]

  it('reparte porcentajes sobre el total de piezas', () => {
    const dist = distribucionPorPilar(
      pilares,
      new Map([
        ['p1', 8],
        ['p2', 7],
        ['p3', 5],
      ]),
    )
    expect(dist[0]?.pct).toBe(40)
    expect(dist[1]?.pct).toBe(35)
    expect(dist[2]?.pct).toBe(25)
    expect(dist.every((d) => !d.fueraDeRango)).toBe(true)
  })

  it('marca el pilar que se desvía más de diez puntos', () => {
    const dist = distribucionPorPilar(
      pilares,
      new Map([
        ['p1', 16],
        ['p2', 2],
        ['p3', 2],
      ]),
    )
    expect(dist[0]?.pct).toBe(80)
    expect(dist[0]?.fueraDeRango).toBe(true)
    expect(dist[1]?.fueraDeRango).toBe(true)
    expect(dist[0]?.desviacion).toBe(40)
  })

  it('exactamente diez puntos todavía no es desviación', () => {
    const uno = [{ id: 'p1', nombre: 'Uno', color: 'x', objetivoPct: 90 }]
    const dist = distribucionPorPilar(uno, new Map([['p1', 3]]))
    expect(dist[0]?.desviacion).toBe(DESVIACION_MAXIMA_PILAR)
    expect(dist[0]?.fueraDeRango).toBe(false)
  })

  it('un mes sin piezas está vacío, no desbalanceado', () => {
    const dist = distribucionPorPilar(pilares, new Map())
    expect(dist.every((d) => d.pct === 0)).toBe(true)
    expect(dist.every((d) => !d.fueraDeRango)).toBe(true)
  })

  it('un pilar sin piezas cuenta como cero, no se cae', () => {
    const dist = distribucionPorPilar(pilares, new Map([['p1', 10]]))
    expect(dist[2]?.piezas).toBe(0)
    expect(dist[0]?.pct).toBe(100)
  })
})

describe('formato', () => {
  it('los miles llevan separador', () => {
    expect(formatearNumero(41200)).toBe('41,200')
  })

  it('los números grandes se compactan', () => {
    expect(formatearCompacto(184000)).toBe('184K')
    expect(formatearCompacto(1500000)).toBe('1.5M')
    expect(formatearCompacto(980)).toBe('980')
  })

  it('un decimal abajo de 10% y ninguno arriba', () => {
    expect(formatearPorcentaje(2.14)).toBe('2.1%')
    expect(formatearPorcentaje(24.4)).toBe('24%')
  })

  it('un valor no finito se dice con raya, no con NaN', () => {
    expect(formatearNumero(Number.NaN)).toBe('—')
    expect(formatearPorcentaje(Number.POSITIVE_INFINITY)).toBe('—')
    expect(formatearCompacto(Number.NaN)).toBe('—')
  })

  it('la variación de un renglón del plan dice de dónde viene', () => {
    expect(formatearContraAnterior(6, 9)).toBe('↓ de 9')
    expect(formatearContraAnterior(10, 8)).toBe('↑ de 8')
    expect(formatearContraAnterior(4, 4)).toBe('igual que 4')
    expect(formatearContraAnterior(4, null)).toBe('nuevo')
  })
})
