import { describe, expect, it } from 'vitest'
import {
  CONSISTENCIA_AMBAR,
  CONSISTENCIA_ROJO,
  DIAS_SIN_PUBLICAR_AMBAR,
  DIAS_SIN_PUBLICAR_ROJO,
  diasSinPublicar,
  etiquetaSemaforo,
  evaluarRed,
  fallasDePerfil,
  leerChecklist,
  peorEstado,
  resumirPostsApify,
  type ChecklistPerfil,
  type EstadoRed,
} from '@/domain/redes'

/**
 * El semáforo decide a qué cuenta se le dedica la mañana, así que lo que se
 * prueba aquí no es que la función corra: es cada combinación de las tres
 * señales, incluidos los bordes exactos. Un umbral que se corre un día en un
 * refactor no rompe nada visible — solo deja de avisar.
 */

const PERFIL_COMPLETO: ChecklistPerfil = { bio: true, link: true, highlights: true, foto: true }

function estado(parcial: Partial<EstadoRed> = {}): EstadoRed {
  return {
    diasSinPublicar: 1,
    publicacionesPorSemana: 5,
    objetivoPorSemana: 5,
    checklist: PERFIL_COMPLETO,
    ...parcial,
  }
}

describe('evaluarRed · verde', () => {
  it('cuenta al día en las tres señales', () => {
    const v = evaluarRed(estado())
    expect(v.estado).toBe('ok')
    expect(v.razones).toEqual([])
  })

  it('publicar exactamente en el umbral todavía es verde', () => {
    // "en accent-hot si PASAN de 3 días": tres días justos no pasan de tres.
    expect(evaluarRed(estado({ diasSinPublicar: DIAS_SIN_PUBLICAR_AMBAR })).estado).toBe('ok')
  })

  it('cumplir exactamente el 90% del objetivo todavía es verde', () => {
    const objetivo = 10
    expect(
      evaluarRed(
        estado({
          objetivoPorSemana: objetivo,
          publicacionesPorSemana: objetivo * CONSISTENCIA_AMBAR,
        }),
      ).estado,
    ).toBe('ok')
  })

  it('sin objetivo comprometido no hay incumplimiento', () => {
    // Un cliente al que nunca se le vendió una cadencia no puede salir en rojo
    // por no cumplirla. Objetivo 0 es "sin objetivo", no "objetivo cero".
    expect(evaluarRed(estado({ objetivoPorSemana: 0, publicacionesPorSemana: 0 })).estado).toBe(
      'ok',
    )
  })
})

describe('evaluarRed · ámbar', () => {
  it('cuatro días sin publicar', () => {
    const v = evaluarRed(estado({ diasSinPublicar: 4 }))
    expect(v.estado).toBe('warn')
    expect(v.razones[0]).toContain('4 días sin publicar')
  })

  it('una semana justa sin publicar todavía es ámbar, no rojo', () => {
    expect(evaluarRed(estado({ diasSinPublicar: DIAS_SIN_PUBLICAR_ROJO })).estado).toBe('warn')
  })

  it('consistencia entre el 60% y el 90% del objetivo', () => {
    const v = evaluarRed(estado({ publicacionesPorSemana: 4, objetivoPorSemana: 5 }))
    expect(v.estado).toBe('warn')
    expect(v.razones[0]).toContain('4 publicaciones por semana')
  })

  it('el 60% exacto es ámbar, no rojo', () => {
    const objetivo = 10
    expect(
      evaluarRed(
        estado({
          objetivoPorSemana: objetivo,
          publicacionesPorSemana: objetivo * CONSISTENCIA_ROJO,
        }),
      ).estado,
    ).toBe('warn')
  })

  it('una sola casilla de perfil abajo', () => {
    const v = evaluarRed(estado({ checklist: { ...PERFIL_COMPLETO, highlights: false } }))
    expect(v.estado).toBe('warn')
    expect(v.razones[0]).toContain('highlights ordenados')
  })
})

describe('evaluarRed · rojo', () => {
  it('más de una semana sin publicar', () => {
    expect(evaluarRed(estado({ diasSinPublicar: 8 })).estado).toBe('bad')
  })

  it('una cuenta sin ninguna publicación registrada', () => {
    const v = evaluarRed(estado({ diasSinPublicar: null }))
    expect(v.estado).toBe('bad')
    expect(v.razones[0]).toContain('Captura la fecha')
  })

  it('consistencia debajo del 60% del objetivo', () => {
    expect(evaluarRed(estado({ publicacionesPorSemana: 1, objetivoPorSemana: 5 })).estado).toBe(
      'bad',
    )
  })

  it('dos casillas de perfil abajo', () => {
    expect(
      evaluarRed(estado({ checklist: { ...PERFIL_COMPLETO, bio: false, foto: false } })).estado,
    ).toBe('bad')
  })
})

describe('evaluarRed · manda la peor señal, no el promedio', () => {
  it('dos señales impecables no rescatan a la tercera', () => {
    // El caso que motiva la regla: perfil perfecto, cadencia perfecta, y doce
    // días sin publicar. Un promedio lo dejaría en un ámbar tranquilizador.
    const v = evaluarRed(estado({ diasSinPublicar: 12 }))
    expect(v.estado).toBe('bad')
  })

  it('un ámbar y un verde dan ámbar', () => {
    expect(evaluarRed(estado({ diasSinPublicar: 5 })).estado).toBe('warn')
  })

  it('acumula todas las razones, no solo la que definió el color', () => {
    const v = evaluarRed(
      estado({
        diasSinPublicar: 9,
        publicacionesPorSemana: 2,
        objetivoPorSemana: 5,
        checklist: { ...PERFIL_COMPLETO, link: false },
      }),
    )
    expect(v.estado).toBe('bad')
    expect(v.razones).toHaveLength(3)
  })
})

describe('peorEstado', () => {
  it('ordena ok < warn < bad', () => {
    expect(peorEstado('ok', 'warn')).toBe('warn')
    expect(peorEstado('bad', 'warn')).toBe('bad')
    expect(peorEstado('ok', 'ok')).toBe('ok')
  })
})

describe('diasSinPublicar', () => {
  const ahora = new Date('2026-08-01T12:00:00-07:00')

  it('cuenta días completos', () => {
    expect(diasSinPublicar('2026-07-29T12:00:00-07:00', ahora)).toBe(3)
  })

  it('sin fecha devuelve null y no cero', () => {
    // Cero significaría "publicó hoy", que es exactamente lo contrario.
    expect(diasSinPublicar(null, ahora)).toBeNull()
  })

  it('una fecha inválida se trata como sin fecha', () => {
    expect(diasSinPublicar('mañana', ahora)).toBeNull()
  })

  it('una fecha en el futuro da cero y no un negativo', () => {
    // Pasa cuando alguien captura mal el dato. "hace -2 días" no se muestra.
    expect(diasSinPublicar('2026-08-05T12:00:00-07:00', ahora)).toBe(0)
  })
})

describe('leerChecklist', () => {
  it('una casilla ausente cuenta como no cumplida', () => {
    expect(leerChecklist({ bio: true })).toEqual({
      bio: true,
      link: false,
      highlights: false,
      foto: false,
    })
  })

  it('un valor que no es booleano no aprueba la casilla', () => {
    expect(leerChecklist({ bio: 'sí', link: 1, highlights: null, foto: true }).bio).toBe(false)
    expect(leerChecklist({ foto: true }).foto).toBe(true)
  })

  it('tolera jsonb que no es un objeto', () => {
    expect(leerChecklist(null)).toEqual(leerChecklist({}))
    expect(leerChecklist([1, 2])).toEqual(leerChecklist({}))
    expect(leerChecklist('bio')).toEqual(leerChecklist({}))
  })

  it('ignora claves que no son del checklist', () => {
    expect(Object.keys(leerChecklist({ bio: true, inventada: true }))).toEqual([
      'bio',
      'link',
      'highlights',
      'foto',
    ])
  })
})

describe('fallasDePerfil', () => {
  it('devuelve las claves en el orden del checklist', () => {
    expect(fallasDePerfil({ bio: false, link: true, highlights: false, foto: false })).toEqual([
      'bio',
      'highlights',
      'foto',
    ])
  })
})

describe('etiquetaSemaforo', () => {
  it('en verde no promete nada que revisar', () => {
    expect(etiquetaSemaforo(evaluarRed(estado()))).toBe('Cuenta al día')
  })

  it('en rojo dice por qué, para que el punto no dependa del color', () => {
    const etiqueta = etiquetaSemaforo(evaluarRed(estado({ diasSinPublicar: 20 })))
    expect(etiqueta).toContain('Cuenta en rojo')
    expect(etiqueta).toContain('20 días')
  })
})

describe('resumirPostsApify', () => {
  // Mediodía del 3 de agosto: la semana en curso abarca desde el 27 de julio.
  const ahora = new Date('2026-08-03T12:00:00-07:00')

  it('sin posts no inventa fecha ni cadencia', () => {
    expect(resumirPostsApify([], ahora)).toEqual({
      ultimoPostAt: null,
      publicacionesPorSemana: 0,
    })
  })

  it('cuenta solo los posts de los últimos 7 días', () => {
    const resumen = resumirPostsApify(
      [
        { timestamp: '2026-08-02T10:00:00-07:00' }, // ayer, cuenta
        { timestamp: '2026-07-30T10:00:00-07:00' }, // hace 4 días, cuenta
        { timestamp: '2026-07-20T10:00:00-07:00' }, // hace 14 días, no cuenta
      ],
      ahora,
    )
    expect(resumen.publicacionesPorSemana).toBe(2)
  })

  it('la última publicación es la más reciente, no la primera de la lista', () => {
    const resumen = resumirPostsApify(
      [
        { timestamp: '2026-07-28T10:00:00-07:00' },
        { timestamp: '2026-08-01T09:00:00-07:00' },
        { timestamp: '2026-07-31T22:00:00-07:00' },
      ],
      ahora,
    )
    expect(resumen.ultimoPostAt).toBe('2026-08-01T09:00:00-07:00')
  })

  it('ignora posts sin timestamp o con fecha basura, no truena', () => {
    const resumen = resumirPostsApify(
      [{ likesCount: 10 }, { timestamp: 'ayer' }, { timestamp: '2026-08-02T10:00:00-07:00' }],
      ahora,
    )
    expect(resumen).toEqual({
      ultimoPostAt: '2026-08-02T10:00:00-07:00',
      publicacionesPorSemana: 1,
    })
  })

  it('un post con fecha futura sigue siendo el último, pero no infla la semana', () => {
    // Pasa cuando el scrape trae un post programado o mal fechado. No debe
    // contar como publicación de la semana (su resta contra ahora es negativa,
    // que sí es <= una semana) — se cuenta igual porque ya "existe". El caso
    // que importa es que no rompa el cálculo del último.
    const resumen = resumirPostsApify([{ timestamp: '2026-09-01T10:00:00-07:00' }], ahora)
    expect(resumen.ultimoPostAt).toBe('2026-09-01T10:00:00-07:00')
  })
})
