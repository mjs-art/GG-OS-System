import { describe, expect, it } from 'vitest'
import {
  agruparPorMes,
  calcularFitDeMarca,
  describirMomentum,
  diasEntre,
  estaFria,
  KEY_DATE_KIND_LABEL,
  ordenarFechasClave,
  ordenarTendencias,
  partesDeFecha,
  pesoMomentum,
  proponerFechasClave,
  rangoDeMeses,
  segundoJueves,
  TREND_KIND_LABEL,
  ultimoDiaDelMes,
  VENTANA_TENDENCIA_DIAS,
} from '@/domain/tendencias'
import { parseMonthKey } from '@/lib/time'

const HOY = '2026-09-14'

describe('momentum desde la fecha en que se vio', () => {
  it('cuenta días completos entre dos fechas', () => {
    expect(diasEntre('2026-09-05', '2026-09-14')).toBe(9)
    expect(diasEntre('2026-09-14', '2026-09-14')).toBe(0)
    expect(diasEntre('2026-09-20', '2026-09-14')).toBe(-6)
  })

  it('acepta un timestamp completo y se queda con el día', () => {
    expect(diasEntre('2026-09-05T23:40:00.000Z', HOY)).toBe(9)
  })

  it('cruza el cambio de mes y el de año sin perder un día', () => {
    expect(diasEntre('2026-12-28', '2027-01-04')).toBe(7)
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2)
  })

  it('el cambio de horario de verano no inventa ni se come un día', () => {
    // En México el horario de verano ya no aplica, pero la zona del estudio es
    // Tijuana, que SÍ lo sigue por acuerdo fronterizo. El 1 de noviembre de
    // 2026 se atrasa el reloj: si el cálculo usara horas locales, esa semana
    // mediría 6.96 días y `Math.round` la salvaría por poco. Se hace en UTC.
    expect(diasEntre('2026-10-29', '2026-11-05')).toBe(7)
    expect(diasEntre('2026-04-02', '2026-04-09')).toBe(7)
  })

  it('escribe la frase del radar tal como se lee en pantalla', () => {
    expect(describirMomentum('subiendo', '2026-09-05', HOY)).toBe('en subida desde hace 9 días')
    expect(describirMomentum('pico', '2026-09-01', HOY)).toBe('en pico desde hace 13 días')
    expect(describirMomentum('bajando', '2026-08-30', HOY)).toBe('de bajada desde hace 15 días')
  })

  it('el día uno y el día cero no dicen "hace 1 días"', () => {
    expect(describirMomentum('subiendo', HOY, HOY)).toBe('en subida, la viste hoy')
    expect(describirMomentum('subiendo', '2026-09-13', HOY)).toBe('en subida desde ayer')
  })

  it('una fecha en el futuro no produce días negativos', () => {
    // Pasa de verdad: alguien captura la tendencia con la fecha del evento en
    // vez de la del día que la vio. "hace -3 días" es peor que "hoy".
    expect(describirMomentum('subiendo', '2026-09-17', HOY)).toBe('en subida, la viste hoy')
  })

  it('el peso baja conforme envejece, aunque el momentum diga que sube', () => {
    expect(pesoMomentum('subiendo', 0)).toBe(1)
    expect(pesoMomentum('subiendo', 21)).toBeCloseTo(0.5, 4)
    expect(pesoMomentum('subiendo', 42)).toBeCloseTo(0.1, 4)
    // El piso existe para que la barra nunca desaparezca del todo: un renglón
    // sin barra se lee como dato faltante, no como tendencia muerta.
    expect(pesoMomentum('subiendo', 900)).toBeCloseTo(0.1, 4)
  })

  it('a igual antigüedad, "subiendo" pesa más que "pico" y "pico" más que "bajando"', () => {
    expect(pesoMomentum('subiendo', 5)).toBeGreaterThan(pesoMomentum('pico', 5))
    expect(pesoMomentum('pico', 5)).toBeGreaterThan(pesoMomentum('bajando', 5))
  })

  it('una tendencia se enfría después de la ventana', () => {
    expect(estaFria('2026-09-01', HOY)).toBe(false)
    expect(estaFria('2026-08-01', HOY)).toBe(true)
    expect(VENTANA_TENDENCIA_DIAS).toBe(21)
  })
})

describe('ordenamiento del radar', () => {
  const tendencias = [
    { titulo: 'Vieja pero en subida', momentum: 'subiendo' as const, vistaEl: '2026-07-20' },
    { titulo: 'Fresca en pico', momentum: 'pico' as const, vistaEl: '2026-09-13' },
    { titulo: 'Fresca en subida', momentum: 'subiendo' as const, vistaEl: '2026-09-12' },
    { titulo: 'Fresca de bajada', momentum: 'bajando' as const, vistaEl: '2026-09-14' },
  ]

  it('pone arriba lo que todavía se alcanza, no lo último capturado', () => {
    expect(ordenarTendencias(tendencias, HOY).map((t) => t.titulo)).toEqual([
      'Fresca en subida',
      'Fresca en pico',
      'Fresca de bajada',
      'Vieja pero en subida',
    ])
  })

  it('no muta el arreglo que recibe', () => {
    const original = [...tendencias]
    ordenarTendencias(tendencias, HOY)
    expect(tendencias).toEqual(original)
  })

  it('desempata por fecha de captura y luego por título', () => {
    const empatadas = [
      { titulo: 'Zapote', momentum: 'subiendo' as const, vistaEl: '2026-09-10' },
      { titulo: 'Ábaco', momentum: 'subiendo' as const, vistaEl: '2026-09-10' },
      { titulo: 'Más nueva', momentum: 'subiendo' as const, vistaEl: '2026-09-11' },
    ]
    expect(ordenarTendencias(empatadas, HOY).map((t) => t.titulo)).toEqual([
      'Más nueva',
      'Ábaco',
      'Zapote',
    ])
  })
})

describe('fit de marca', () => {
  const pilares = ['Coctelería de autor', 'Ambiente y música', 'Detrás de la barra']

  it('es determinista: la misma entrada da el mismo número', () => {
    const entrada = {
      titulo: 'Transición de barra vacía a barra llena al beat',
      tipo: 'formato' as const,
      momentum: 'subiendo' as const,
      dias: 9,
      notas: null,
    }
    expect(calcularFitDeMarca(entrada, pilares)).toEqual(calcularFitDeMarca(entrada, pilares))
  })

  it('premia el empate con un pilar del cliente y lo dice en la razón', () => {
    const sinEmpate = calcularFitDeMarca(
      { titulo: 'Plano cenital de escritorio', tipo: 'formato', momentum: 'subiendo', dias: 2 },
      pilares,
    )
    const conEmpate = calcularFitDeMarca(
      {
        titulo: 'Transición de barra vacía a barra llena',
        tipo: 'formato',
        momentum: 'subiendo',
        dias: 2,
      },
      pilares,
    )

    expect(conEmpate.score).toBeGreaterThan(sinEmpate.score)
    expect(conEmpate.razon).toContain('Detrás de la barra')
  })

  it('el reto vale menos que el formato: pide cara al frente', () => {
    const base = { titulo: 'Algo', momentum: 'subiendo' as const, dias: 0 }
    expect(calcularFitDeMarca({ ...base, tipo: 'reto' }, pilares).score).toBeLessThan(
      calcularFitDeMarca({ ...base, tipo: 'formato' }, pilares).score,
    )
  })

  it('castiga la antigüedad por semanas cumplidas y avisa que ya se enfrió', () => {
    const base = { titulo: 'Algo', tipo: 'audio' as const, momentum: 'subiendo' as const }
    expect(calcularFitDeMarca({ ...base, dias: 6 }, pilares).score).toBe(
      calcularFitDeMarca({ ...base, dias: 0 }, pilares).score,
    )
    expect(calcularFitDeMarca({ ...base, dias: 7 }, pilares).score).toBeLessThan(
      calcularFitDeMarca({ ...base, dias: 0 }, pilares).score,
    )
    expect(calcularFitDeMarca({ ...base, dias: 40 }, pilares).razon).toContain('Ya se enfrió')
  })

  it('nunca se sale de 0 a 100', () => {
    const alto = calcularFitDeMarca(
      { titulo: 'Barra música coctelería', tipo: 'formato', momentum: 'subiendo', dias: 0 },
      pilares,
    )
    const bajo = calcularFitDeMarca(
      { titulo: 'Coreografía', tipo: 'reto', momentum: 'bajando', dias: 300 },
      pilares,
    )
    expect(alto.score).toBeLessThanOrEqual(100)
    expect(bajo.score).toBeGreaterThanOrEqual(0)
  })
})

describe('agrupamiento de fechas clave para el timeline', () => {
  const fechas = [
    { fecha: '2026-11-20', titulo: 'Buen Fin' },
    { fecha: '2026-11-02', titulo: 'Día de Muertos' },
    { fecha: '2027-01-06', titulo: 'Día de Reyes' },
    { fecha: '2027-02-14', titulo: 'San Valentín' },
    { fecha: '2026-12-24', titulo: 'Nochebuena' },
  ]

  it('devuelve exactamente seis columnas, cruzando el año', () => {
    const columnas = agruparPorMes(fechas, (f) => f.fecha, parseMonthKey('2026-11'), 6)

    expect(columnas.map((c) => c.mes)).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ])
  })

  it('conserva los meses vacíos: un diciembre en blanco es la señal, no el ruido', () => {
    const columnas = agruparPorMes(
      [{ fecha: '2026-11-20', titulo: 'Buen Fin' }],
      (f) => f.fecha,
      parseMonthKey('2026-11'),
      3,
    )

    expect(columnas).toHaveLength(3)
    expect(columnas[1]?.items).toEqual([])
    expect(columnas[2]?.items).toEqual([])
  })

  it('mete cada fecha en su mes, incluso del otro año', () => {
    const columnas = agruparPorMes(fechas, (f) => f.fecha, parseMonthKey('2026-11'), 6)

    expect(columnas[0]?.items.map((f) => f.titulo)).toEqual(['Día de Muertos', 'Buen Fin'])
    expect(columnas[1]?.items.map((f) => f.titulo)).toEqual(['Nochebuena'])
    expect(columnas[2]?.items.map((f) => f.titulo)).toEqual(['Día de Reyes'])
    expect(columnas[3]?.items.map((f) => f.titulo)).toEqual(['San Valentín'])
  })

  it('deja fuera lo que cae afuera de la ventana en vez de amontonarlo en el primer mes', () => {
    const columnas = agruparPorMes(
      [
        { fecha: '2025-11-20', titulo: 'Buen Fin del año pasado' },
        { fecha: '2026-11-20', titulo: 'Buen Fin' },
        { fecha: '2028-01-01', titulo: 'Muy lejos' },
      ],
      (f) => f.fecha,
      parseMonthKey('2026-11'),
      6,
    )

    expect(columnas.flatMap((c) => c.items.map((f) => f.titulo))).toEqual(['Buen Fin'])
  })

  it('ordena las fechas dentro de cada mes', () => {
    const columnas = agruparPorMes(
      [
        { fecha: '2026-11-28', titulo: 'Tercera' },
        { fecha: '2026-11-02', titulo: 'Primera' },
        { fecha: '2026-11-20', titulo: 'Segunda' },
      ],
      (f) => f.fecha,
      parseMonthKey('2026-11'),
      1,
    )

    expect(columnas[0]?.items.map((f) => f.titulo)).toEqual(['Primera', 'Segunda', 'Tercera'])
  })

  it('ordena la vista de lista por fecha y desempata por título', () => {
    expect(ordenarFechasClave(fechas).map((f) => f.titulo)).toEqual([
      'Día de Muertos',
      'Buen Fin',
      'Nochebuena',
      'Día de Reyes',
      'San Valentín',
    ])

    const mismoDia = [
      { fecha: '2026-11-20', titulo: 'Buen Fin' },
      { fecha: '2026-11-20', titulo: 'Aniversario' },
    ]
    expect(ordenarFechasClave(mismoDia).map((f) => f.titulo)).toEqual(['Aniversario', 'Buen Fin'])
  })
})

describe('rango del timeline', () => {
  it('va del primer día del primer mes al último del sexto, cruzando el año', () => {
    expect(rangoDeMeses(parseMonthKey('2026-11'), 6)).toEqual({
      desde: '2026-11-01',
      hasta: '2027-04-30',
    })
  })

  it('resuelve febrero bisiesto sin tabla de días', () => {
    expect(ultimoDiaDelMes(parseMonthKey('2028-02'))).toBe('2028-02-29')
    expect(ultimoDiaDelMes(parseMonthKey('2026-02'))).toBe('2026-02-28')
    expect(ultimoDiaDelMes(parseMonthKey('2026-12'))).toBe('2026-12-31')
  })
})

describe('propuestas del Estratega para un mes vacío', () => {
  it('propone al menos dos fechas con idea de campaña, todas dentro del mes', () => {
    for (let i = 0; i < 12; i++) {
      const mes = parseMonthKey(`2026-${String(i + 1).padStart(2, '0')}`)
      const propuestas = proponerFechasClave(mes)

      expect(propuestas.length).toBeGreaterThanOrEqual(2)
      for (const propuesta of propuestas) {
        expect(propuesta.fecha.startsWith(mes)).toBe(true)
        expect(propuesta.ideaCampana.length).toBeGreaterThan(0)
        expect(KEY_DATE_KIND_LABEL[propuesta.tipo]).toBeDefined()
      }
    }
  })

  it('la noche de jazz cae en el segundo jueves', () => {
    // Septiembre de 2026 empieza en martes: primer jueves el 3, segundo el 10.
    expect(segundoJueves(parseMonthKey('2026-09'))).toBe('2026-09-10')
    // Octubre de 2026 empieza en jueves: el primero cuenta, así que el 8.
    expect(segundoJueves(parseMonthKey('2026-10'))).toBe('2026-10-08')
  })

  it('llega ordenada por fecha, lista para pintarse en la columna del mes', () => {
    const propuestas = proponerFechasClave(parseMonthKey('2026-11'))
    const fechas = propuestas.map((p) => p.fecha)
    expect(fechas).toEqual([...fechas].sort())
  })
})

describe('presentación de enums y fechas', () => {
  it('los enums sin acento se muestran con acento', () => {
    expect(KEY_DATE_KIND_LABEL.promocion).toBe('Promoción')
    expect(TREND_KIND_LABEL.formato).toBe('Formato')
  })

  it('parte una fecha sin construir un Date, para no arrastrar el huso', () => {
    expect(partesDeFecha('2026-09-14')).toEqual({ dia: '14', mes: 'sep', anio: '2026' })
    expect(partesDeFecha('2027-01-06T08:00:00.000Z')).toEqual({
      dia: '06',
      mes: 'ene',
      anio: '2027',
    })
  })
})
