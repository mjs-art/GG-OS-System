import { describe, expect, it } from 'vitest'
import { detectarPalabrasRecurrentes, type EdicionParaAnalisis } from './aprendizaje'

const borra = (
  palabra: string,
  { field = 'hook', agent = 'redactor' as EdicionParaAnalisis['agent'] } = {},
): EdicionParaAnalisis => ({
  field,
  oldValue: `una oferta ${palabra} de temporada`,
  newValue: 'una oferta de temporada',
  agent,
})

describe('palabras recurrentemente borradas', () => {
  it('no sugiere nada por debajo del umbral', () => {
    // Una sola corrección es una corrección, no un patrón.
    expect(detectarPalabrasRecurrentes([borra('increible')])).toEqual([])
  })

  it('sugiere una palabra borrada dos veces', () => {
    const sugerencias = detectarPalabrasRecurrentes([borra('increible'), borra('increible')])
    expect(sugerencias).toHaveLength(1)
    expect(sugerencias[0]?.palabra).toBe('increible')
    expect(sugerencias[0]?.veces).toBe(2)
  })

  it('cuenta ediciones distintas, no apariciones dentro de una misma edición', () => {
    // La palabra aparece dos veces en el mismo texto pero es UNA corrección.
    const edicion: EdicionParaAnalisis = {
      field: 'copy_in',
      oldValue: 'exclusivo y exclusivo para ti',
      newValue: 'para ti',
      agent: 'redactor',
    }
    expect(detectarPalabrasRecurrentes([edicion])).toEqual([])
  })

  it('normaliza el acento igual que el verificador', () => {
    // "único" y "unico" son la misma prohibición; si contaran aparte, ninguna
    // llegaría al umbral y el patrón se perdería.
    const sugerencias = detectarPalabrasRecurrentes([
      { field: 'hook', oldValue: 'algo único', newValue: 'algo', agent: 'redactor' },
      { field: 'cta', oldValue: 'lo unico', newValue: 'lo', agent: 'redactor' },
    ])
    expect(sugerencias).toHaveLength(1)
    expect(sugerencias[0]?.veces).toBe(2)
  })

  it('solo cuenta lo que se borró, no lo que se agregó', () => {
    // La persona METIÓ "reserva": prohibirla sería prohibir lo que quiso poner.
    const edicion: EdicionParaAnalisis = {
      field: 'cta',
      oldValue: 'aparta tu lugar',
      newValue: 'aparta tu lugar con reserva',
      agent: 'redactor',
    }
    expect(detectarPalabrasRecurrentes([edicion, edicion])).toEqual([])
  })

  it('ignora la palabra que se movió pero sigue presente', () => {
    const edicion: EdicionParaAnalisis = {
      field: 'hook',
      oldValue: 'jueves de jazz en vivo',
      newValue: 'en vivo, jueves de jazz',
      agent: 'guionista',
    }
    expect(detectarPalabrasRecurrentes([edicion, edicion])).toEqual([])
  })

  it('descarta conectores y palabras demasiado cortas', () => {
    const edicion: EdicionParaAnalisis = {
      field: 'copy_out',
      oldValue: 'ven con nosotros para la cena',
      newValue: 'ven a la cena',
      agent: 'redactor',
    }
    // Se borraron "con", "nosotros", "para": "con"/"para" son vacías o cortas.
    // "nosotros" sí es contenido y sí debería salir si se repite.
    const sugerencias = detectarPalabrasRecurrentes([edicion, edicion])
    expect(sugerencias.map((s) => s.palabra)).toContain('nosotros')
    expect(sugerencias.map((s) => s.palabra)).not.toContain('con')
    expect(sugerencias.map((s) => s.palabra)).not.toContain('para')
  })

  it('no toca campos que no son prosa de agente', () => {
    // `status` no es texto que un agente redacte; su "old/new" no son palabras.
    const edicion: EdicionParaAnalisis = {
      field: 'status',
      oldValue: 'escrito revisado propuesta',
      newValue: 'escrito',
      agent: 'redactor',
    }
    expect(detectarPalabrasRecurrentes([edicion, edicion])).toEqual([])
  })

  it('no vuelve a sugerir lo que ya está cubierto', () => {
    const ediciones = [borra('exclusivo'), borra('exclusivo')]
    expect(detectarPalabrasRecurrentes(ediciones, { yaCubiertas: ['Exclusivo'] })).toEqual([])
  })

  it('ignora tokens puramente numéricos', () => {
    const edicion: EdicionParaAnalisis = {
      field: 'hook',
      oldValue: 'promo 2024 de verano',
      newValue: 'promo de verano',
      agent: 'redactor',
    }
    expect(detectarPalabrasRecurrentes([edicion, edicion])).toEqual([])
  })

  it('ordena de más borrada a menos y es estable en empates', () => {
    const sugerencias = detectarPalabrasRecurrentes([
      borra('imperdible'),
      borra('imperdible'),
      borra('imperdible'),
      borra('espectacular'),
      borra('espectacular'),
      borra('brutal'),
      borra('brutal'),
    ])
    expect(sugerencias.map((s) => s.palabra)).toEqual(['imperdible', 'brutal', 'espectacular'])
  })

  it('acumula los agentes que habían escrito la palabra', () => {
    const sugerencias = detectarPalabrasRecurrentes([
      borra('increible', { agent: 'redactor' }),
      borra('increible', { agent: 'guionista' }),
      borra('increible', { agent: 'redactor' }),
    ])
    expect(sugerencias[0]?.agentes).toEqual(['guionista', 'redactor'])
  })

  it('respeta el tope de sugerencias', () => {
    const ediciones = ['alfa', 'beta', 'gama', 'delta', 'epsilon', 'zeta'].flatMap((p) => [
      borra(p),
      borra(p),
    ])
    expect(detectarPalabrasRecurrentes(ediciones, { limite: 3 })).toHaveLength(3)
  })

  it('trata un null en old/new como sin comparación posible', () => {
    const ediciones: EdicionParaAnalisis[] = [
      { field: 'hook', oldValue: null, newValue: 'algo', agent: 'redactor' },
      { field: 'hook', oldValue: 'algo increible', newValue: null, agent: 'redactor' },
    ]
    expect(detectarPalabrasRecurrentes(ediciones)).toEqual([])
  })
})
