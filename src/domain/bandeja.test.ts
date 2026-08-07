import { describe, expect, it } from 'vitest'
import {
  agruparPorCausa,
  contarPorFiltro,
  estaEscribiendo,
  filtrarEscalamientos,
  indiceTrasResolver,
  moverSeleccion,
  opcionPorAtajo,
  ordenarCola,
  resumenCola,
  SIN_SELECCION,
  type Escalamiento,
  type OpcionEscalamiento,
} from '@/domain/bandeja'
import type { AgentKey, RuleSeverity } from '@/domain/labels'

/**
 * Lo que se prueba aquí es lo que se rompe en producción: el orden de la cola,
 * qué cae en cada chip, y `J/K` en los bordes de la lista.
 */

function escalamiento(
  id: string,
  opciones: {
    severidad?: RuleSeverity
    creadoEn?: string
    agente?: AgentKey
  } = {},
): Escalamiento {
  return {
    id,
    agente: opciones.agente ?? 'editor_marca',
    severidad: opciones.severidad ?? 'media',
    pregunta: `Pregunta ${id}`,
    opciones: [
      { key: 'confirmar', label: 'Confirmar' },
      { key: 'elegir', label: 'Elegir yo cuáles' },
    ],
    creadoEn: opciones.creadoEn ?? '2026-08-01T10:00:00.000Z',
    cliente: { id: 'cli-1', nombre: 'Dry Express', slug: 'dry-express' },
    pieza: null,
  }
}

describe('el orden de la cola', () => {
  it('pone lo crítico arriba aunque sea lo más nuevo', () => {
    const cola = ordenarCola([
      escalamiento('vieja-baja', { severidad: 'baja', creadoEn: '2026-07-01T08:00:00.000Z' }),
      escalamiento('nueva-critica', { severidad: 'critica', creadoEn: '2026-08-30T08:00:00.000Z' }),
      escalamiento('media', { severidad: 'media', creadoEn: '2026-07-15T08:00:00.000Z' }),
      escalamiento('alta', { severidad: 'alta', creadoEn: '2026-08-20T08:00:00.000Z' }),
    ])

    expect(cola.map((e) => e.id)).toEqual(['nueva-critica', 'alta', 'media', 'vieja-baja'])
  })

  it('dentro de la misma severidad, lo más viejo primero', () => {
    const cola = ordenarCola([
      escalamiento('c', { severidad: 'critica', creadoEn: '2026-08-03T08:00:00.000Z' }),
      escalamiento('a', { severidad: 'critica', creadoEn: '2026-08-01T08:00:00.000Z' }),
      escalamiento('b', { severidad: 'critica', creadoEn: '2026-08-02T08:00:00.000Z' }),
    ])

    expect(cola.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('desempata igual siempre: dos del mismo instante no bailan entre renders', () => {
    const mismoInstante = '2026-08-01T08:00:00.000Z'
    const entrada = [
      escalamiento('zeta', { creadoEn: mismoInstante }),
      escalamiento('alfa', { creadoEn: mismoInstante }),
    ]

    expect(ordenarCola(entrada).map((e) => e.id)).toEqual(['alfa', 'zeta'])
    expect(ordenarCola([...entrada].reverse()).map((e) => e.id)).toEqual(['alfa', 'zeta'])
  })

  it('no muta el arreglo que recibe', () => {
    const entrada = [
      escalamiento('b', { severidad: 'baja' }),
      escalamiento('a', { severidad: 'critica' }),
    ]
    ordenarCola(entrada)

    expect(entrada.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('una cola vacía se ordena sin quejarse', () => {
    expect(ordenarCola([])).toEqual([])
  })
})

describe('el filtrado por tipo', () => {
  const cola = [
    escalamiento('marca', { agente: 'editor_marca' }),
    escalamiento('copy', { agente: 'redactor', severidad: 'critica' }),
    escalamiento('guion', { agente: 'guionista' }),
    escalamiento('cliente', { agente: 'cuenta' }),
    escalamiento('ads', { agente: 'pautero' }),
    escalamiento('plan', { agente: 'estratega' }),
  ]

  it('"Todo" no esconde nada', () => {
    expect(filtrarEscalamientos(cola, 'todo')).toHaveLength(cola.length)
  })

  it('"Crítico" corta por severidad, no por agente', () => {
    expect(filtrarEscalamientos(cola, 'critico').map((e) => e.id)).toEqual(['copy'])
  })

  it('"Compliance" es lo del Editor de marca', () => {
    expect(filtrarEscalamientos(cola, 'compliance').map((e) => e.id)).toEqual(['marca'])
  })

  it('"Tema nuevo" junta al Redactor y al Guionista', () => {
    expect(filtrarEscalamientos(cola, 'tema_nuevo').map((e) => e.id)).toEqual(['copy', 'guion'])
  })

  it('"Comentario de cliente" y "Pauta" traen uno cada uno', () => {
    expect(filtrarEscalamientos(cola, 'comentario_cliente').map((e) => e.id)).toEqual(['cliente'])
    expect(filtrarEscalamientos(cola, 'pauta').map((e) => e.id)).toEqual(['ads'])
  })

  it('el Estratega no tiene chip propio y solo se ve en "Todo"', () => {
    const chips = ['critico', 'compliance', 'tema_nuevo', 'comentario_cliente', 'pauta'] as const
    for (const chip of chips) {
      expect(filtrarEscalamientos(cola, chip).map((e) => e.id)).not.toContain('plan')
    }
    expect(filtrarEscalamientos(cola, 'todo').map((e) => e.id)).toContain('plan')
  })

  it('cuenta cuántos caben en cada chip', () => {
    expect(contarPorFiltro(cola)).toEqual({
      todo: 6,
      critico: 1,
      compliance: 1,
      tema_nuevo: 2,
      comentario_cliente: 1,
      pauta: 1,
    })
  })

  it('el renglón del encabezado concuerda en singular y en plural', () => {
    expect(resumenCola(cola)).toBe('6 escalamientos · 1 crítico')
    expect(resumenCola([escalamiento('uno', { severidad: 'critica' })])).toBe(
      '1 escalamiento · 1 crítico',
    )
    expect(resumenCola([])).toBe('0 escalamientos · 0 críticos')
  })
})

describe('la navegación con J y K en los bordes', () => {
  it('J baja de una en una', () => {
    expect(moverSeleccion(0, 1, 5)).toBe(1)
    expect(moverSeleccion(3, 1, 5)).toBe(4)
  })

  it('K sube de una en una', () => {
    expect(moverSeleccion(4, -1, 5)).toBe(3)
  })

  it('no se sale por abajo: J en la última se queda en la última', () => {
    expect(moverSeleccion(4, 1, 5)).toBe(4)
  })

  it('no se sale por arriba: K en la primera se queda en la primera', () => {
    expect(moverSeleccion(0, -1, 5)).toBe(0)
  })

  it('no da la vuelta', () => {
    expect(moverSeleccion(4, 1, 5)).not.toBe(0)
    expect(moverSeleccion(0, -1, 5)).not.toBe(4)
  })

  it('no se atora sin selección: cualquier tecla aterriza en la primera', () => {
    expect(moverSeleccion(SIN_SELECCION, 1, 5)).toBe(0)
    expect(moverSeleccion(SIN_SELECCION, -1, 5)).toBe(0)
  })

  it('con la bandeja vacía no hay nada que seleccionar', () => {
    expect(moverSeleccion(0, 1, 0)).toBe(SIN_SELECCION)
    expect(moverSeleccion(SIN_SELECCION, -1, 0)).toBe(SIN_SELECCION)
  })

  it('un índice que quedó fuera de rango se acomoda dentro', () => {
    // Pasa de verdad: se resuelven tres tarjetas de otra pestaña mientras el
    // cursor estaba en la número 8.
    expect(moverSeleccion(9, 1, 3)).toBe(2)
    expect(moverSeleccion(9, -1, 3)).toBe(2)
  })

  it('al resolver, el cursor se queda sobre la que le seguía', () => {
    expect(indiceTrasResolver(2, 5)).toBe(2)
  })

  it('al resolver la última, el cursor sube una', () => {
    expect(indiceTrasResolver(4, 4)).toBe(3)
  })

  it('al resolver la única, no queda selección', () => {
    expect(indiceTrasResolver(0, 0)).toBe(SIN_SELECCION)
  })
})

describe('las teclas 1-3 eligen opción', () => {
  const opciones = [
    { key: 'confirmar', label: 'Confirmar' },
    { key: 'elegir', label: 'Elegir yo cuáles' },
  ]

  it('mapea la tecla a la opción en ese lugar', () => {
    expect(opcionPorAtajo(opciones, '1')?.key).toBe('confirmar')
    expect(opcionPorAtajo(opciones, '2')?.key).toBe('elegir')
  })

  it('una tecla sin opción detrás no hace nada', () => {
    expect(opcionPorAtajo(opciones, '3')).toBeNull()
    expect(opcionPorAtajo([], '1')).toBeNull()
  })

  it('ignora teclas que no son dígitos', () => {
    expect(opcionPorAtajo(opciones, 'a')).toBeNull()
    expect(opcionPorAtajo(opciones, '0')).toBeNull()
  })
})

describe('los atajos no se disparan mientras se escribe', () => {
  it('un input, un textarea o un select desactivan los atajos', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      expect(estaEscribiendo(document.createElement(tag))).toBe(true)
    }
  })

  it('un contenteditable también', () => {
    const div = document.createElement('div')
    div.contentEditable = 'true'
    // jsdom no calcula isContentEditable a partir del atributo.
    Object.defineProperty(div, 'isContentEditable', { value: true })
    expect(estaEscribiendo(div)).toBe(true)
  })

  it('el body o una tarjeta no', () => {
    expect(estaEscribiendo(document.body)).toBe(false)
    expect(estaEscribiendo(document.createElement('article'))).toBe(false)
    expect(estaEscribiendo(null)).toBe(false)
  })
})

describe('agrupar escalamientos por causa', () => {
  const OPCIONES_A: OpcionEscalamiento[] = [
    { key: 'confirmar', label: 'Confirmar' },
    { key: 'quitar', label: 'Quitar la palabra' },
  ]

  function esc(
    id: string,
    {
      agente = 'editor_marca' as AgentKey,
      pregunta = '¿Uso "exclusivo" aunque está en la lista de prohibidas?',
      opciones = OPCIONES_A,
    } = {},
  ): Escalamiento {
    return {
      id,
      agente,
      severidad: 'media',
      pregunta,
      opciones,
      creadoEn: '2026-08-01T10:00:00.000Z',
      cliente: { id: 'cli-1', nombre: 'Dry Express', slug: 'dry-express' },
      pieza: null,
    }
  }

  it('junta las que hacen la misma pregunta con las mismas opciones', () => {
    const grupos = agruparPorCausa([esc('a'), esc('b'), esc('c')])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.escalamientos.map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(grupos[0]?.agente).toBe('editor_marca')
  })

  it('no agrupa lo que pregunta distinto', () => {
    const grupos = agruparPorCausa([
      esc('a', { pregunta: '¿Uso "exclusivo"?' }),
      esc('b', { pregunta: '¿Uso "imperdible"?' }),
    ])
    expect(grupos).toHaveLength(0)
  })

  it('la misma pregunta de agentes distintos no es el mismo lote', () => {
    const grupos = agruparPorCausa([
      esc('a', { agente: 'redactor' }),
      esc('b', { agente: 'guionista' }),
    ])
    expect(grupos).toHaveLength(0)
  })

  it('misma pregunta pero opciones distintas no se puede cerrar con una respuesta', () => {
    const grupos = agruparPorCausa([
      esc('a'),
      esc('b', { opciones: [{ key: 'otra', label: 'Otra cosa' }] }),
    ])
    expect(grupos).toHaveLength(0)
  })

  it('no devuelve grupos de uno: eso es una tarjeta normal', () => {
    const grupos = agruparPorCausa([esc('sola'), esc('otra', { pregunta: '¿Algo más?' })])
    expect(grupos).toHaveLength(0)
  })

  it('conserva el orden de entrada, para respetar la urgencia de la cola', () => {
    const grupos = agruparPorCausa([
      esc('reel', { pregunta: '¿Reel largo?' }),
      esc('reel-2', { pregunta: '¿Reel largo?' }),
      esc('banned', { pregunta: '¿Uso "exclusivo"?' }),
      esc('banned-2', { pregunta: '¿Uso "exclusivo"?' }),
    ])
    expect(grupos.map((g) => g.pregunta)).toEqual(['¿Reel largo?', '¿Uso "exclusivo"?'])
  })
})
