import { describe, expect, it } from 'vitest'
import {
  aCsv,
  aplicarCambios,
  agenteDelCampo,
  balancePilares,
  conteoStories,
  diasDeAtraso,
  entregaEnRiesgo,
  esDelPipeline,
  estadoDeEntrega,
  ordenarFilas,
  ordenarParaGrid,
  reordenar,
  UMBRAL_DESVIACION,
  type FilaTabla,
  type SlotPieza,
} from '@/domain/planner'

/**
 * Cinco piezas en cinco días consecutivos, del 5 al 1 de septiembre.
 *
 * El grid las muestra en ese orden (descendente), así que el índice del arreglo
 * es también la posición visual. Eso hace que los casos se lean como se ven.
 */
function mes(): SlotPieza[] {
  return [
    { id: 'a', publishAt: '2026-09-05T19:00:00-07:00', slotIndex: 4, dateLocked: false },
    { id: 'b', publishAt: '2026-09-04T19:00:00-07:00', slotIndex: 3, dateLocked: false },
    { id: 'c', publishAt: '2026-09-03T19:00:00-07:00', slotIndex: 2, dateLocked: false },
    { id: 'd', publishAt: '2026-09-02T19:00:00-07:00', slotIndex: 1, dateLocked: false },
    { id: 'e', publishAt: '2026-09-01T19:00:00-07:00', slotIndex: 0, dateLocked: false },
  ]
}

/** `{ id: fecha }` de los cambios, que es lo que de verdad importa comparar. */
function fechas(cambios: readonly { id: string; publishAt: string | null }[]) {
  return Object.fromEntries(cambios.map((c) => [c.id, c.publishAt?.slice(0, 10) ?? null]))
}

describe('ordenarParaGrid', () => {
  it('ordena descendente por fecha: la más nueva arriba a la izquierda', () => {
    const revuelto = [mes()[2], mes()[0], mes()[4], mes()[1], mes()[3]].filter(
      (p): p is SlotPieza => Boolean(p),
    )
    expect(ordenarParaGrid(revuelto).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('manda las piezas sin fecha hasta abajo, no hasta arriba', () => {
    const conHuerfana = [
      ...mes(),
      { id: 'z', publishAt: null, slotIndex: 9, dateLocked: false },
      { id: 'y', publishAt: null, slotIndex: 8, dateLocked: false },
    ]
    expect(ordenarParaGrid(conHuerfana).map((p) => p.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'z',
      'y',
    ])
  })
})

describe('reordenar · modo intercambiar', () => {
  it('intercambia las fechas de las dos piezas y no toca ninguna otra', () => {
    const r = reordenar({ piezas: mes(), origenId: 'a', destinoId: 'd', modo: 'intercambiar' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cambios).toHaveLength(2)
    expect(fechas(r.cambios)).toEqual({ a: '2026-09-02', d: '2026-09-05' })
  })

  it('también intercambia el slot_index, no solo la fecha', () => {
    const r = reordenar({ piezas: mes(), origenId: 'a', destinoId: 'e', modo: 'intercambiar' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cambios.find((c) => c.id === 'a')?.slotIndex).toBe(0)
    expect(r.cambios.find((c) => c.id === 'e')?.slotIndex).toBe(4)
  })

  it('soltar una pieza sobre sí misma no genera cambios', () => {
    const r = reordenar({ piezas: mes(), origenId: 'c', destinoId: 'c', modo: 'intercambiar' })
    expect(r).toEqual({ ok: false, motivo: 'sin-cambio' })
  })

  it('una pieza que no existe no revienta: se reporta', () => {
    const r = reordenar({
      piezas: mes(),
      origenId: 'a',
      destinoId: 'fantasma',
      modo: 'intercambiar',
    })
    expect(r).toEqual({ ok: false, motivo: 'desconocida' })
  })
})

describe('reordenar · modo insertar y correr', () => {
  it('mover hacia abajo recorre hacia arriba lo que quedó en medio', () => {
    // a (día 5) se va a la posición de d (día 2): b, c y d suben un slot.
    const r = reordenar({ piezas: mes(), origenId: 'a', destinoId: 'd', modo: 'insertar' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fechas(r.cambios)).toEqual({
      b: '2026-09-05',
      c: '2026-09-04',
      d: '2026-09-03',
      a: '2026-09-02',
    })
    // e ni se entera.
    expect(r.cambios.some((c) => c.id === 'e')).toBe(false)
  })

  it('mover hacia arriba recorre hacia abajo lo que quedó en medio', () => {
    const r = reordenar({ piezas: mes(), origenId: 'e', destinoId: 'b', modo: 'insertar' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fechas(r.cambios)).toEqual({
      e: '2026-09-04',
      b: '2026-09-03',
      c: '2026-09-02',
      d: '2026-09-01',
    })
    expect(r.cambios.some((c) => c.id === 'a')).toBe(false)
  })

  it('a diferencia de intercambiar, mueve a todos los de en medio', () => {
    const intercambio = reordenar({
      piezas: mes(),
      origenId: 'a',
      destinoId: 'e',
      modo: 'intercambiar',
    })
    const insercion = reordenar({ piezas: mes(), origenId: 'a', destinoId: 'e', modo: 'insertar' })

    expect(intercambio.ok && intercambio.cambios).toHaveLength(2)
    expect(insercion.ok && insercion.cambios).toHaveLength(5)
  })
})

describe('reordenar · el candado', () => {
  it('soltar sobre una pieza amarrada no mueve nada y dice cuál es', () => {
    const piezas = mes().map((p) => (p.id === 'd' ? { ...p, dateLocked: true } : p))
    const r = reordenar({ piezas, origenId: 'a', destinoId: 'd', modo: 'intercambiar' })

    expect(r).toEqual({
      ok: false,
      motivo: 'bloqueada',
      piezaId: 'd',
      fecha: '2026-09-02T19:00:00-07:00',
    })
  })

  it('arrastrar una pieza amarrada tampoco se permite', () => {
    const piezas = mes().map((p) => (p.id === 'a' ? { ...p, dateLocked: true } : p))
    const r = reordenar({ piezas, origenId: 'a', destinoId: 'd', modo: 'intercambiar' })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo).toBe('bloqueada')
    expect(r.motivo === 'bloqueada' && r.piezaId).toBe('a')
  })

  it('en insertar y correr, una amarrada EN MEDIO detiene el movimiento completo', () => {
    // c no es ni el origen ni el destino, pero el corrimiento la movería.
    const piezas = mes().map((p) => (p.id === 'c' ? { ...p, dateLocked: true } : p))
    const r = reordenar({ piezas, origenId: 'a', destinoId: 'd', modo: 'insertar' })

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.motivo === 'bloqueada' && r.piezaId).toBe('c')
  })

  it('una amarrada FUERA del rango afectado no estorba', () => {
    const piezas = mes().map((p) => (p.id === 'e' ? { ...p, dateLocked: true } : p))
    const r = reordenar({ piezas, origenId: 'a', destinoId: 'd', modo: 'insertar' })

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.cambios.some((c) => c.id === 'e')).toBe(false)
  })
})

describe('aplicarCambios', () => {
  it('aplica el resultado en memoria para la vista optimista', () => {
    const piezas = mes()
    const r = reordenar({ piezas, origenId: 'a', destinoId: 'e', modo: 'intercambiar' })
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const despues = aplicarCambios(piezas, r.cambios)
    expect(despues.find((p) => p.id === 'a')?.publishAt).toBe('2026-09-01T19:00:00-07:00')
    expect(despues.find((p) => p.id === 'e')?.publishAt).toBe('2026-09-05T19:00:00-07:00')
    // Y las demás siguen intactas: el rollback depende de eso.
    expect(despues.find((p) => p.id === 'c')).toEqual(piezas.find((p) => p.id === 'c'))
  })
})

describe('balancePilares', () => {
  const pilares = [
    { id: 'p1', name: 'Coctelería de autor', color: '#8E2B1E', targetPct: 40 },
    { id: 'p2', name: 'Ambiente y música', color: '#A67C52', targetPct: 35 },
    { id: 'p3', name: 'Detrás de la barra', color: '#5F6B5A', targetPct: 25 },
  ]

  const piezasDe = (reparto: readonly string[]) => reparto.map((pillarId) => ({ pillarId }))

  it('calcula el porcentaje real de cada pilar', () => {
    const segmentos = balancePilares(piezasDe(['p1', 'p1', 'p2', 'p3']), pilares)
    expect(segmentos.map((s) => s.realPct)).toEqual([50, 25, 25])
    expect(segmentos.map((s) => s.piezas)).toEqual([2, 1, 1])
  })

  it('marca excedido solo cuando se pasa por MÁS de diez puntos', () => {
    // p1 al 50% contra objetivo 40: exactamente diez puntos, no se marca.
    const justo = balancePilares(piezasDe(['p1', 'p1', 'p2', 'p3']), pilares)
    expect(justo[0]?.desviacion).toBe(UMBRAL_DESVIACION)
    expect(justo[0]?.excedido).toBe(false)

    // p1 al 60%: veinte puntos arriba.
    const pasado = balancePilares(piezasDe(['p1', 'p1', 'p1', 'p2', 'p3']), pilares)
    expect(pasado[0]?.excedido).toBe(true)
  })

  it('quedarse corto no pulsa: solo pasarse', () => {
    const segmentos = balancePilares(piezasDe(['p2', 'p2', 'p2', 'p3']), pilares)
    expect(segmentos[0]?.realPct).toBe(0)
    expect(segmentos[0]?.desviacion).toBe(-40)
    expect(segmentos[0]?.excedido).toBe(false)
  })

  it('las piezas sin pilar salen en su propio segmento en vez de esconderse', () => {
    const segmentos = balancePilares([{ pillarId: 'p1' }, { pillarId: null }], pilares)
    const sinPilar = segmentos.find((s) => s.id === 'sin-pilar')
    expect(sinPilar?.realPct).toBe(50)
    expect(sinPilar?.color).toBeNull()
  })

  it('un mes vacío da ceros, no NaN', () => {
    const segmentos = balancePilares([], pilares)
    expect(segmentos.every((s) => s.realPct === 0)).toBe(true)
    expect(segmentos.some((s) => s.id === 'sin-pilar')).toBe(false)
  })
})

describe('procedencia', () => {
  it('con authored_by vacío, la pieza ya pasó por manos humanas', () => {
    expect(esDelPipeline({ authoredBy: {} })).toBe(false)
    expect(esDelPipeline({ authoredBy: { hook: 'redactor' } })).toBe(true)
  })

  it('dice qué agente escribió cada campo', () => {
    const pieza = { authoredBy: { hook: 'redactor', script: 'guionista' } }
    expect(agenteDelCampo(pieza, 'hook')).toBe('redactor')
    expect(agenteDelCampo(pieza, 'cta')).toBeNull()
  })
})

describe('conteoStories', () => {
  it('cuenta por tipo, con el enum sin eñe de la base', () => {
    const stories = [
      { kind: 'diaria' as const },
      { kind: 'diaria' as const },
      { kind: 'campana' as const },
      { kind: 'interactiva' as const },
    ]
    expect(conteoStories(stories)).toEqual({
      total: 4,
      porTipo: { diaria: 2, campana: 1, interactiva: 1 },
    })
  })

  it('un mes sin stories da ceros en los tres tipos', () => {
    expect(conteoStories([]).porTipo).toEqual({ diaria: 0, campana: 0, interactiva: 0 })
  })
})

describe('ordenarFilas', () => {
  const fila = (over: Partial<FilaTabla>): FilaTabla => ({
    id: 'x',
    fecha: '2026-09-01',
    entrega: '2026-08-29',
    entregaEstado: 'por-entregar',
    formato: 'post',
    pilar: 'Ambiente',
    hook: 'hook',
    estado: 'idea',
    ordenEstado: 0,
    responsable: 'Ana',
    sprint: 'Sprint 12',
    plataformas: ['instagram'],
    procedencia: 'Redactor',
    aprobacion: 'Pendiente',
    ...over,
  })

  it('ordena el estado por su lugar en el pipeline, no alfabéticamente', () => {
    const filas = [
      fila({ id: 'aprobado', estado: 'aprobado', ordenEstado: 4 }),
      fila({ id: 'idea', estado: 'idea', ordenEstado: 0 }),
      fila({ id: 'escrito', estado: 'escrito', ordenEstado: 1 }),
    ]
    expect(ordenarFilas(filas, 'estado', 'asc').map((f) => f.id)).toEqual([
      'idea',
      'escrito',
      'aprobado',
    ])
  })

  it('las filas sin fecha quedan al final en las dos direcciones', () => {
    const filas = [
      fila({ id: 'sin', fecha: null }),
      fila({ id: 'temprana', fecha: '2026-09-01' }),
      fila({ id: 'tardia', fecha: '2026-09-20' }),
    ]
    expect(ordenarFilas(filas, 'fecha', 'asc').at(-1)?.id).toBe('sin')
    expect(ordenarFilas(filas, 'fecha', 'desc').at(0)?.id).toBe('sin')
  })

  it('las entregas sin fecha quedan al final en las dos direcciones', () => {
    const filas = [
      fila({ id: 'sin', entrega: null }),
      fila({ id: 'temprana', entrega: '2026-08-20' }),
      fila({ id: 'tardia', entrega: '2026-09-20' }),
    ]
    expect(ordenarFilas(filas, 'entrega', 'asc').map((f) => f.id)).toEqual([
      'temprana',
      'tardia',
      'sin',
    ])
    expect(ordenarFilas(filas, 'entrega', 'desc').at(0)?.id).toBe('sin')
  })

  it('lo que no tiene responsable ni sprint se va al final, no entre los nombres', () => {
    const filas = [
      fila({ id: 'nadie', responsable: null, sprint: null }),
      fila({ id: 'zoe', responsable: 'Zoe', sprint: 'Zeta' }),
      fila({ id: 'ana', responsable: 'Ana', sprint: 'Alfa' }),
    ]
    expect(ordenarFilas(filas, 'responsable', 'asc').map((f) => f.id)).toEqual([
      'ana',
      'zoe',
      'nadie',
    ])
    expect(ordenarFilas(filas, 'sprint', 'asc').map((f) => f.id)).toEqual(['ana', 'zoe', 'nadie'])
  })

  it('no muta el arreglo que recibe', () => {
    const filas = [fila({ id: 'b', hook: 'b' }), fila({ id: 'a', hook: 'a' })]
    ordenarFilas(filas, 'hook', 'asc')
    expect(filas.map((f) => f.id)).toEqual(['b', 'a'])
  })
})

describe('estadoDeEntrega', () => {
  const HOY = '2026-09-14'

  it('sin fecha de entrega y sin asset: no hay compromiso que perseguir', () => {
    expect(estadoDeEntrega({ dueDate: null, assetUrl: null }, HOY)).toBe('sin-entrega')
  })

  it('la entrega de ayer sin asset está vencida', () => {
    expect(estadoDeEntrega({ dueDate: '2026-09-13', assetUrl: null }, HOY)).toBe('atrasada')
  })

  it('la entrega de hoy todavía no está vencida, pero se distingue', () => {
    expect(estadoDeEntrega({ dueDate: HOY, assetUrl: null }, HOY)).toBe('hoy')
  })

  it('la entrega futura va a tiempo', () => {
    expect(estadoDeEntrega({ dueDate: '2026-09-20', assetUrl: null }, HOY)).toBe('por-entregar')
  })

  it('con asset ya está entregada, aunque la fecha se haya pasado', () => {
    // Regla deliberada: la alarma se apaga cuando el material llega. Un tile
    // que sigue en rojo con la imagen adentro enseña a ignorar el rojo.
    expect(estadoDeEntrega({ dueDate: '2026-01-01', assetUrl: '/x/y/z.jpg' }, HOY)).toBe(
      'entregada',
    )
  })

  it('un asset sin fecha de entrega también cuenta como entregada', () => {
    expect(estadoDeEntrega({ dueDate: null, assetUrl: 'https://canva.test/x' }, HOY)).toBe(
      'entregada',
    )
  })

  it('solo lo vencido y lo de hoy se pinta distinto', () => {
    expect(entregaEnRiesgo('atrasada')).toBe(true)
    expect(entregaEnRiesgo('hoy')).toBe(true)
    expect(entregaEnRiesgo('por-entregar')).toBe(false)
    expect(entregaEnRiesgo('entregada')).toBe(false)
    expect(entregaEnRiesgo('sin-entrega')).toBe(false)
  })
})

describe('diasDeAtraso', () => {
  it('cuenta días completos', () => {
    expect(diasDeAtraso('2026-09-10', '2026-09-14')).toBe(4)
    expect(diasDeAtraso('2026-09-14', '2026-09-14')).toBe(0)
  })

  it('cruza el cambio de mes y el de año sin corrimiento', () => {
    expect(diasDeAtraso('2026-08-31', '2026-09-01')).toBe(1)
    expect(diasDeAtraso('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('cruza el cambio de horario de verano sin perder ni ganar un día', () => {
    // Tijuana adelanta el reloj el 5 de abril de 2026. Con aritmética de fechas
    // locales esta cuenta daría 6.958… días y redondearía mal en la orilla.
    expect(diasDeAtraso('2026-04-01', '2026-04-08')).toBe(7)
  })

  it('una entrega futura da negativo', () => {
    expect(diasDeAtraso('2026-09-20', '2026-09-14')).toBe(-6)
  })
})

describe('aCsv', () => {
  it('cita todo y duplica las comillas internas', () => {
    const csv = aCsv(['fecha', 'hook'], [['2026-09-01', 'pide "algo rico", a ver qué pasa']])
    expect(csv).toBe('"fecha","hook"\r\n"2026-09-01","pide ""algo rico"", a ver qué pasa"')
  })

  it('un salto de línea dentro de una celda no rompe el renglón', () => {
    const csv = aCsv(['guion'], [['escena 1\nescena 2']])
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})
