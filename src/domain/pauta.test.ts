import { describe, expect, it } from 'vitest'
import {
  diaDeCampana,
  diasRestantes,
  esMejor,
  formatearMetrica,
  formatearPesos,
  formatearRango,
  mejorValor,
  METRICAS,
  parsearCsvDeAds,
  partirCsv,
  pasosDeInstrucciones,
  pctPresupuestoGastado,
  pesosACentavos,
  seriesCostoPorResultado,
  totalizar,
  type MetricaDiaria,
} from './pauta'

/* ==========================================================================
   Qué es "el mejor" valor de cada métrica
   ========================================================================== */

describe('mejorValor', () => {
  it('en CTR el mejor es el más alto', () => {
    expect(mejorValor('ctr', [1.8, 0.85])).toBe(1.8)
  })

  it('en costo por resultado el mejor es el más BAJO', () => {
    // La trampa de la sección entera: si esto se invierte, la tabla resalta en
    // accent justo el ad set al que hay que quitarle dinero.
    expect(mejorValor('costoPorResultado', [2400, 6500])).toBe(2400)
  })

  it('CPM y CPC también son al revés', () => {
    expect(mejorValor('cpm', [1500, 1330])).toBe(1330)
    expect(mejorValor('cpc', [830, 1520])).toBe(830)
  })

  it('impresiones, alcance, clics y resultados son al derecho', () => {
    expect(mejorValor('impresiones', [32890, 37280])).toBe(37280)
    expect(mejorValor('alcance', [26510, 29730])).toBe(29730)
    expect(mejorValor('clics', [640, 315])).toBe(640)
    expect(mejorValor('resultados', [21, 8])).toBe(21)
  })

  it('el gasto no se compara: gastar más no es ni mejor ni peor', () => {
    expect(mejorValor('gasto', [49000, 49000])).toBeNull()
    expect(mejorValor('gasto', [10000, 90000])).toBeNull()
  })

  it('no hay "mejor" con una sola columna', () => {
    // Resaltar la única columna que existe no informa nada y enseña a ignorar
    // el color.
    expect(mejorValor('ctr', [1.8])).toBeNull()
    expect(mejorValor('costoPorResultado', [2400])).toBeNull()
  })

  it('ignora los nulos y no los toma como cero', () => {
    // Un ad set sin resultados tiene costo por resultado null. Tratarlo como 0
    // lo volvería el ganador eterno de la tabla.
    expect(mejorValor('costoPorResultado', [2400, null, 6500])).toBe(2400)
    expect(mejorValor('costoPorResultado', [null, 6500])).toBeNull()
    expect(mejorValor('ctr', [null, null])).toBeNull()
  })

  it('toda métrica declarada tiene dirección y formato', () => {
    for (const m of METRICAS) {
      expect(['alto', 'bajo', 'ninguna']).toContain(m.mejor)
      expect(['dinero', 'entero', 'porcentaje']).toContain(m.formato)
      expect(m.label.length).toBeGreaterThan(0)
    }
  })
})

describe('esMejor', () => {
  it('marca el ganador y solo el ganador', () => {
    const valores = [2400, 6500]
    expect(esMejor('costoPorResultado', 2400, valores)).toBe(true)
    expect(esMejor('costoPorResultado', 6500, valores)).toBe(false)
  })

  it('un empate resalta a los dos', () => {
    const valores = [1.5, 1.5]
    expect(esMejor('ctr', 1.5, valores)).toBe(true)
  })

  it('un valor nulo nunca se resalta', () => {
    expect(esMejor('costoPorResultado', null, [null, 6500])).toBe(false)
  })
})

/* ==========================================================================
   Días restantes y día de campaña
   ========================================================================== */

describe('diasRestantes', () => {
  it('cuenta los días de calendario que faltan', () => {
    expect(diasRestantes('2026-08-01', '2026-08-08')).toBe(7)
  })

  it('el día del cierre son cero días restantes', () => {
    expect(diasRestantes('2026-08-08', '2026-08-08')).toBe(0)
  })

  it('una campaña vencida da cero, no un negativo', () => {
    // "Quedan −3 días" no significa nada en la tarjeta.
    expect(diasRestantes('2026-08-11', '2026-08-08')).toBe(0)
  })

  it('cruza el fin de mes y el fin de año', () => {
    expect(diasRestantes('2026-07-26', '2026-08-08')).toBe(13)
    expect(diasRestantes('2026-12-28', '2027-01-03')).toBe(6)
  })

  it('cruza el cambio de horario de verano sin perder ni ganar un día', () => {
    // En México el horario de verano ya no aplica, pero el servidor puede
    // correr en cualquier zona: por eso el cálculo es en UTC puro.
    expect(diasRestantes('2026-03-07', '2026-03-14')).toBe(7)
    expect(diasRestantes('2026-10-24', '2026-11-01')).toBe(8)
  })

  it('acepta un timestamp completo y se queda con el día', () => {
    expect(diasRestantes('2026-08-01T23:40:00Z', '2026-08-08')).toBe(7)
  })
})

describe('diaDeCampana', () => {
  it('el primer día es el día 1', () => {
    expect(diaDeCampana('2026-08-01', '2026-08-01', '2026-08-07')).toEqual({ dia: 1, total: 7 })
  })

  it('arma el "DÍA 4 DE 7" del encabezado de la propuesta', () => {
    expect(diaDeCampana('2026-08-04', '2026-08-01', '2026-08-07')).toEqual({ dia: 4, total: 7 })
  })

  it('se acota a los extremos en vez de decir "día 9 de 7"', () => {
    expect(diaDeCampana('2026-07-28', '2026-08-01', '2026-08-07').dia).toBe(1)
    expect(diaDeCampana('2026-08-20', '2026-08-01', '2026-08-07').dia).toBe(7)
  })

  it('una campaña de un solo día es "día 1 de 1"', () => {
    expect(diaDeCampana('2026-08-01', '2026-08-01', '2026-08-01')).toEqual({ dia: 1, total: 1 })
  })
})

describe('formatearRango', () => {
  it('no corre la fecha un día por la zona horaria', () => {
    // Una columna `date` se parsea como medianoche UTC; formateada en
    // America/Tijuana se volvería el 7 de agosto.
    expect(formatearRango('2026-07-26', '2026-08-08')).toBe('26 jul – 8 ago')
  })
})

/* ==========================================================================
   Presupuesto
   ========================================================================== */

describe('pctPresupuestoGastado', () => {
  it('calcula el porcentaje gastado', () => {
    expect(pctPresupuestoGastado(144000, 200000)).toBe(72)
  })

  it('con total en cero devuelve cero, no NaN ni Infinity', () => {
    // Una campaña en borrador sin presupuesto capturado no debe pintar "NaN%".
    expect(pctPresupuestoGastado(0, 0)).toBe(0)
    expect(pctPresupuestoGastado(5000, 0)).toBe(0)
    expect(Number.isFinite(pctPresupuestoGastado(5000, 0))).toBe(true)
  })

  it('un presupuesto negativo tampoco rompe', () => {
    expect(pctPresupuestoGastado(5000, -100)).toBe(0)
  })

  it('el sobregasto se enseña, no se acota a 100', () => {
    expect(pctPresupuestoGastado(220000, 200000)).toBe(110)
  })

  it('sin gasto es cero', () => {
    expect(pctPresupuestoGastado(0, 200000)).toBe(0)
  })
})

/* ==========================================================================
   Dinero
   ========================================================================== */

describe('formatearPesos', () => {
  it('arma la barra de presupuesto de la tarjeta', () => {
    expect(`${formatearPesos(144000)} de ${formatearPesos(200000)}`).toBe('$1,440 de $2,000')
  })

  it('omite los decimales cuando son cero', () => {
    expect(formatearPesos(0)).toBe('$0')
    expect(formatearPesos(100)).toBe('$1')
    expect(formatearPesos(98000)).toBe('$980')
  })

  it('conserva los centavos cuando existen', () => {
    expect(formatearPesos(1235)).toBe('$12.35')
    expect(formatearPesos(840)).toBe('$8.40')
    // Un solo centavo no se pierde ni se redondea a nada.
    expect(formatearPesos(1)).toBe('$0.01')
    expect(formatearPesos(2405)).toBe('$24.05')
  })

  it('agrupa los millares', () => {
    expect(formatearPesos(123456789)).toBe('$1,234,567.89')
  })

  it('nunca arrastra un centavo fantasma del punto flotante', () => {
    // 144000 / 100 en flotante puede dar 1440.0000000000002.
    for (const centavos of [144000, 200000, 333300, 999999, 1_000_000_00]) {
      expect(formatearPesos(centavos)).not.toContain('0000')
    }
  })

  it('formatea negativos con el signo adelante del peso', () => {
    expect(formatearPesos(-56000)).toBe('-$560')
  })
})

describe('pesosACentavos', () => {
  it('lee lo que escribe una persona en el formulario', () => {
    expect(pesosACentavos('1440')).toBe(144000)
    expect(pesosACentavos('1,440.50')).toBe(144050)
    expect(pesosACentavos('$2,000')).toBe(200000)
    expect(pesosACentavos(' 12.35 ')).toBe(1235)
  })

  it('un decimal solo son décimas, no centésimas', () => {
    expect(pesosACentavos('12.5')).toBe(1250)
  })

  it('redondea el viaje de ida y vuelta sin perder centavos', () => {
    for (const texto of ['0.01', '8.40', '1,234,567.89']) {
      const centavos = pesosACentavos(texto)
      expect(centavos).not.toBeNull()
      expect(pesosACentavos(formatearPesos(centavos ?? 0))).toBe(centavos)
    }
  })

  it('devuelve null cuando no es un monto', () => {
    expect(pesosACentavos('')).toBeNull()
    expect(pesosACentavos('N/A')).toBeNull()
    expect(pesosACentavos('12.345')).toBeNull()
    expect(pesosACentavos('mil pesos')).toBeNull()
  })
})

/* ==========================================================================
   Totales
   ========================================================================== */

const diasA: MetricaDiaria[] = [
  {
    fecha: '2026-07-26',
    gastoCents: 7000,
    impresiones: 4380,
    alcance: 3510,
    clics: 79,
    resultados: 3,
  },
  {
    fecha: '2026-07-27',
    gastoCents: 7000,
    impresiones: 4610,
    alcance: 3720,
    clics: 88,
    resultados: 3,
  },
]

describe('totalizar', () => {
  it('suma los acumulables', () => {
    const t = totalizar(diasA)
    expect(t.gastoCents).toBe(14000)
    expect(t.impresiones).toBe(8990)
    expect(t.clics).toBe(167)
    expect(t.resultados).toBe(6)
    expect(t.dias).toBe(2)
  })

  it('recalcula las razones desde los totales, no promedia las diarias', () => {
    const t = totalizar(diasA)
    // CTR de la semana = clics totales / impresiones totales.
    expect(t.ctr).toBeCloseTo((167 * 100) / 8990, 6)
    expect(t.cpcCents).toBe(Math.round(14000 / 167))
    expect(t.costoPorResultadoCents).toBe(Math.round(14000 / 6))
  })

  it('un derivado sin denominador es null, no cero', () => {
    // $0 por resultado significaría "gratis", que es lo contrario de "todavía
    // no hay ningún resultado".
    const t = totalizar([
      {
        fecha: '2026-08-01',
        gastoCents: 7000,
        impresiones: 0,
        alcance: 0,
        clics: 0,
        resultados: 0,
      },
    ])
    expect(t.ctr).toBeNull()
    expect(t.cpmCents).toBeNull()
    expect(t.cpcCents).toBeNull()
    expect(t.costoPorResultadoCents).toBeNull()
  })

  it('sin filas devuelve ceros y nulos, no truena', () => {
    const t = totalizar([])
    expect(t.gastoCents).toBe(0)
    expect(t.dias).toBe(0)
    expect(t.costoPorResultadoCents).toBeNull()
  })
})

describe('formatearMetrica', () => {
  it('usa el formato de cada métrica', () => {
    expect(formatearMetrica('gasto', 49000)).toBe('$490')
    expect(formatearMetrica('impresiones', 32890)).toBe('32,890')
    expect(formatearMetrica('ctr', 1.945)).toBe('1.95 %')
    expect(formatearMetrica('costoPorResultado', 2400)).toBe('$24')
  })

  it('un dato que no existe es una raya, no un cero', () => {
    expect(formatearMetrica('costoPorResultado', null)).toBe('—')
  })
})

/* ==========================================================================
   Serie de la gráfica
   ========================================================================== */

describe('seriesCostoPorResultado', () => {
  it('alinea los ad sets sobre el mismo eje de fechas', () => {
    const s = seriesCostoPorResultado([
      {
        id: 'a',
        nombre: 'A',
        diarias: [
          {
            fecha: '2026-07-26',
            gastoCents: 7000,
            impresiones: 1,
            alcance: 1,
            clics: 1,
            resultados: 2,
          },
          {
            fecha: '2026-07-27',
            gastoCents: 7000,
            impresiones: 1,
            alcance: 1,
            clics: 1,
            resultados: 1,
          },
        ],
      },
      {
        id: 'b',
        nombre: 'B',
        diarias: [
          {
            fecha: '2026-07-27',
            gastoCents: 6000,
            impresiones: 1,
            alcance: 1,
            clics: 1,
            resultados: 1,
          },
        ],
      },
    ])

    expect(s.fechas).toEqual(['2026-07-26', '2026-07-27'])
    expect(s.series[0]?.puntos).toEqual([3500, 7000])
    // B no corrió el día 26: hueco, no un punto pegado a la izquierda.
    expect(s.series[1]?.puntos).toEqual([null, 6000])
    expect(s.maximoCents).toBe(7000)
  })

  it('un día sin resultados es un hueco', () => {
    const s = seriesCostoPorResultado([
      {
        id: 'a',
        nombre: 'A',
        diarias: [
          {
            fecha: '2026-07-26',
            gastoCents: 7000,
            impresiones: 1,
            alcance: 1,
            clics: 1,
            resultados: 0,
          },
        ],
      },
    ])
    expect(s.series[0]?.puntos).toEqual([null])
    expect(s.maximoCents).toBe(0)
  })

  it('sin métricas devuelve series vacías', () => {
    const s = seriesCostoPorResultado([{ id: 'a', nombre: 'A', diarias: [] }])
    expect(s.fechas).toEqual([])
    expect(s.maximoCents).toBe(0)
  })
})

/* ==========================================================================
   CSV
   ========================================================================== */

describe('partirCsv', () => {
  it('respeta las comas dentro de comillas', () => {
    // Sin esto, un nombre de ad set con coma corre todas las columnas de lugar.
    expect(partirCsv('a,"B · Interés, 25-45",c')).toEqual([['a', 'B · Interés, 25-45', 'c']])
  })

  it('entiende CRLF y comillas escapadas', () => {
    expect(partirCsv('x,y\r\n1,"di ""hola"""')).toEqual([
      ['x', 'y'],
      ['1', 'di "hola"'],
    ])
  })

  it('descarta los renglones en blanco del final', () => {
    expect(partirCsv('a,b\n1,2\n\n')).toHaveLength(2)
  })

  it('se traga el BOM que pone Excel en Windows', () => {
    // Sin esto la primera columna se llama "﻿Ad set name" y no empata con
    // ningún alias: el archivo se ve idéntico y la importación falla diciendo
    // que falta la columna que sí está ahí.
    const [encabezado] = partirCsv('﻿Ad set name,Day\nA,2026-07-26')
    expect(encabezado?.[0]).toBe('Ad set name')
  })

  it('entiende el punto y coma de Excel en español', () => {
    expect(partirCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('un punto y coma dentro de un campo no cambia el separador del archivo', () => {
    expect(partirCsv('a,b\n"x; y",2')).toEqual([
      ['a', 'b'],
      ['x; y', '2'],
    ])
  })
})

describe('parsearCsvDeAds', () => {
  const meta = [
    'Ad set name,Day,Amount spent (MXN),Impressions,Reach,Link clicks,Results',
    '"A · Interés",2026-07-26,"$70.00",4380,3510,79,3',
    '"B · Similares",2026-07-26,"$70.00",5240,4180,44,1',
  ].join('\n')

  it('lee un export de Meta en inglés', () => {
    const { filas, errores } = parsearCsvDeAds(meta)
    expect(errores).toEqual([])
    expect(filas).toHaveLength(2)
    expect(filas[0]).toEqual({
      adSet: 'A · Interés',
      fecha: '2026-07-26',
      gastoCents: 7000,
      impresiones: 4380,
      alcance: 3510,
      clics: 79,
      resultados: 3,
    })
  })

  it('lee un export en español con acentos y fecha con barras', () => {
    const tiktok = [
      'Nombre del conjunto de anuncios,Día,Importe gastado,Impresiones,Alcance,Clics,Resultados',
      'A · Interés,26/07/2026,70,4380,3510,79,3',
    ].join('\n')
    const { filas, errores } = parsearCsvDeAds(tiktok)
    expect(errores).toEqual([])
    expect(filas[0]?.fecha).toBe('2026-07-26')
    expect(filas[0]?.gastoCents).toBe(7000)
  })

  it('un renglón malo se reporta y los demás se importan', () => {
    const roto = [
      'Ad set name,Day,Amount spent',
      'A,2026-07-26,70',
      'A,no-es-fecha,70',
      ',2026-07-27,70',
    ].join('\n')
    const { filas, errores } = parsearCsvDeAds(roto)
    expect(filas).toHaveLength(1)
    expect(errores).toHaveLength(2)
  })

  it('sin las columnas mínimas dice qué exportar', () => {
    const { filas, errores } = parsearCsvDeAds('Cliente,Notas\nBar,hola')
    expect(filas).toEqual([])
    expect(errores[0]).toContain('desglosado por')
  })

  it('un archivo vacío no truena', () => {
    expect(parsearCsvDeAds('').errores).toHaveLength(1)
  })
})

/* ==========================================================================
   Instrucciones
   ========================================================================== */

describe('pasosDeInstrucciones', () => {
  it('respeta los saltos de línea y quita las viñetas', () => {
    expect(pasosDeInstrucciones('1. Pausar el ad set B\n2. Subir A a $130\n')).toEqual([
      'Pausar el ad set B',
      'Subir A a $130',
    ])
    expect(pasosDeInstrucciones('- Pausar B\n- Subir A')).toEqual(['Pausar B', 'Subir A'])
  })

  it('corta por oración cuando vino todo en un renglón', () => {
    expect(
      pasosDeInstrucciones('En Meta Ads: pausar el ad set B. Subir el diario de A a $130.'),
    ).toEqual(['En Meta Ads: pausar el ad set B.', 'Subir el diario de A a $130.'])
  })

  it('no parte un monto por el punto decimal', () => {
    expect(pasosDeInstrucciones('Subir el presupuesto a $130.50 hasta el 8 de agosto.')).toEqual([
      'Subir el presupuesto a $130.50 hasta el 8 de agosto.',
    ])
  })

  it('un texto vacío no produce pasos fantasma', () => {
    expect(pasosDeInstrucciones('')).toEqual([])
    expect(pasosDeInstrucciones('  \n \n')).toEqual([])
  })
})
