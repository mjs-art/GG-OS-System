import { describe, expect, it } from 'vitest'
import {
  comoTimestampDelEstudio,
  construirPlanDeImportacion,
  detectarModoDeFecha,
  parsearFechaNotion,
  resumenDelPlan,
} from '@/domain/importar-notion'

/**
 * El mapeo es lo único que de verdad hay que probar de este importador.
 *
 * Todo lo demás —la pantalla, el Server Action— falla ruidosamente. Un mapeo
 * mal hecho no falla: importa 200 piezas al mes equivocado, con el formato
 * equivocado, y se ve bien. Por eso aquí está cada valor de `Formato`, cada
 * valor de `Estado`, y los renglones que el archivo real trae rotos.
 */

const ENCABEZADO =
  'Tarea,Canal,Formato,Estado,Fecha de Entrega,Fecha de publicación,Responsable,Sprint,Transición-Teaser'

/** Arma un CSV con el encabezado exacto de la base de Notion. */
function csv(...renglones: string[]): string {
  return [ENCABEZADO, ...renglones].join('\n')
}

describe('Formato → dónde vive la pieza', () => {
  it('Carrusel es un carrusel de feed', () => {
    const plan = construirPlanDeImportacion(
      csv('Tips de coctelería,Instagram,Carrusel,Guión,,2026-09-15,,,No'),
    )
    expect(plan.ok).toBe(true)
    expect(plan.piezas).toHaveLength(1)
    expect(plan.piezas[0]?.formato).toBe('carrusel')
  })

  it('Estático es un post', () => {
    const plan = construirPlanDeImportacion(
      csv('Frase del día,Instagram,Estático,Guión,,2026-09-15,,,No'),
    )
    expect(plan.piezas[0]?.formato).toBe('post')
  })

  it('Video es un reel: el único video de feed que se produce es el vertical corto', () => {
    const plan = construirPlanDeImportacion(
      csv('Detrás de barra,Tiktok,Video,Guión,,2026-09-15,,,No'),
    )
    expect(plan.piezas[0]?.formato).toBe('reel')
  })

  it('Story NO es pieza de feed: se va a la tabla stories', () => {
    const plan = construirPlanDeImportacion(
      csv('Antes y después,Instagram,Story,Guión,,2026-09-15,,,No'),
    )

    expect(plan.ok).toBe(true)
    expect(plan.piezas).toHaveLength(0)
    expect(plan.stories).toHaveLength(1)
    expect(plan.stories[0]).toMatchObject({ tipo: 'diaria', fecha: '2026-09-15', mes: '2026-09' })
  })

  it('Encuesta es una story interactiva, no un post', () => {
    const plan = construirPlanDeImportacion(
      csv('¿Cuál prefieres?,Instagram,Encuesta,Guión,,2026-09-15,,,No'),
    )

    expect(plan.piezas).toHaveLength(0)
    expect(plan.stories[0]?.tipo).toBe('interactiva')
  })

  it('un Formato desconocido detiene el archivo y dice el renglón', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Buena,Instagram,Carrusel,Guión,,2026-09-15,,,No',
        'Rara,Instagram,Podcast,Guión,,2026-09-16,,,No',
      ),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores).toHaveLength(1)
    expect(plan.errores[0]?.linea).toBe(3)
    expect(plan.errores[0]?.columna).toBe('formato')
    expect(plan.errores[0]?.mensaje).toContain('Podcast')
  })

  it('una celda de Formato vacía tampoco se adivina, y señala el renglón', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Con formato,Instagram,Carrusel,Guión,,2026-09-15,,,No',
        'Sin formato,Instagram,,Guión,,2026-09-16,,,No',
      ),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]).toMatchObject({ linea: 3, columna: 'formato' })
  })

  it('la columna Formato entera vacía es un problema del archivo, no de un renglón', () => {
    const plan = construirPlanDeImportacion(csv('Sin formato,Instagram,,Guión,,2026-09-15,,,No'))

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.linea).toBeNull()
    expect(plan.errores[0]?.mensaje).toMatch(/Formato.*vacía/)
  })

  it('una columna obligatoria ausente dice cuál falta con su nombre de Notion', () => {
    const plan = construirPlanDeImportacion(
      ['Tarea,Canal,Estado,Fecha de publicación', 'Pieza,Instagram,Guión,2026-09-15'].join('\n'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.mensaje).toContain('Formato')
    expect(plan.errores[0]?.mensaje).toMatch(/no trae la columna/)
  })
})

describe('Estado: siete de Notion contra seis nuestros', () => {
  const casos: Array<[string, string]> = [
    ['Sin empezar', 'idea'],
    ['Guión', 'escrito'],
    ['Diseñado', 'revisado'],
    ['Grabado', 'revisado'],
    ['Programado', 'aprobado'],
    ['Completado', 'publicado'],
  ]

  it.each(casos)('%s → %s', (notion, nuestro) => {
    const plan = construirPlanDeImportacion(
      csv(`Pieza,Instagram,Carrusel,${notion},,2026-09-15,,,No`),
    )
    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]?.estado).toBe(nuestro)
  })

  it('Rechazado se omite a propósito y se dice cuál y por qué', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Va,Instagram,Carrusel,Guión,,2026-09-15,,,No',
        'No va,Instagram,Carrusel,Rechazado,,2026-09-16,,,No',
      ),
    )

    // Omitir no es fallar: el archivo sigue siendo importable.
    expect(plan.ok).toBe(true)
    expect(plan.piezas).toHaveLength(1)
    expect(plan.omitidas).toHaveLength(1)
    expect(plan.omitidas[0]).toMatchObject({ linea: 3, tarea: 'No va' })
    expect(plan.omitidas[0]?.motivo).toMatch(/rechazada/i)
  })

  it('un Estado desconocido detiene el archivo', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,Instagram,Carrusel,En pausa,,2026-09-15,,,No'),
    )
    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.columna).toBe('estado')
  })

  it('ninguna pieza cae en con_cliente: el tablero de Notion no tiene esa columna', () => {
    const plan = construirPlanDeImportacion(
      csv(
        ...casos.map(
          ([notion], i) => `Pieza ${i},Instagram,Carrusel,${notion},,2026-09-1${i + 1},,,No`,
        ),
      ),
    )
    expect(plan.piezas.map((p) => p.estado)).not.toContain('con_cliente')
  })
})

describe('Canal → platforms', () => {
  it('mapea los cuatro canales a minúsculas', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,"Tiktok, LinkedIn, Instagram, Facebook",Carrusel,Guión,,2026-09-15,,,No'),
    )

    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]?.plataformas).toEqual(['tiktok', 'linkedin', 'instagram', 'facebook'])
  })

  it('no duplica un canal repetido', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,"Instagram, IG",Carrusel,Guión,,2026-09-15,,,No'),
    )
    expect(plan.piezas[0]?.plataformas).toEqual(['instagram'])
  })

  it('un canal desconocido detiene el archivo en vez de descartarse en silencio', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,"Instagram, Threads",Carrusel,Guión,,2026-09-15,,,No'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.columna).toBe('canal')
    expect(plan.errores[0]?.mensaje).toContain('Threads')
  })

  it('sin canal se importa, pero avisa', () => {
    const plan = construirPlanDeImportacion(csv('Pieza,,Carrusel,Guión,,2026-09-15,,,No'))

    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]?.plataformas).toEqual([])
    expect(plan.avisos.some((a) => a.mensaje.includes('canal'))).toBe(true)
  })
})

describe('el mes sale de la fecha, y sin fecha no hay renglón', () => {
  it('prefiere la fecha de publicación', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,Instagram,Carrusel,Guión,2026-08-28,2026-09-03,,,No'),
    )

    expect(plan.piezas[0]?.mes).toBe('2026-09')
    expect(plan.piezas[0]?.dueDate).toBe('2026-08-28')
  })

  it('cae a la fecha de entrega cuando no hay publicación', () => {
    const plan = construirPlanDeImportacion(csv('Pieza,Instagram,Carrusel,Guión,2026-08-28,,,,No'))

    expect(plan.piezas[0]?.mes).toBe('2026-08')
    expect(plan.piezas[0]?.publishAt).toBeNull()
    expect(plan.piezas[0]?.dueDate).toBe('2026-08-28')
  })

  it('sin ninguna de las dos, el renglón se reporta con su línea', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Con fecha,Instagram,Carrusel,Guión,,2026-09-15,,,No',
        'Sin fecha,Instagram,Carrusel,Guión,,,,,No',
      ),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.linea).toBe(3)
    expect(plan.errores[0]?.mensaje).toMatch(/no trae Fecha/i)
  })

  it('si el archivo entero no trae fechas, lo dice una sola vez', () => {
    const plan = construirPlanDeImportacion(
      csv('Una,Instagram,Carrusel,Guión,,,,,No', 'Otra,Instagram,Carrusel,Guión,,,,,No'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores).toHaveLength(1)
    expect(plan.errores[0]?.linea).toBeNull()
  })

  it('Completado sin fecha de publicación se rechaza aquí, no en Postgres', () => {
    const plan = construirPlanDeImportacion(
      csv('Ya salió,Instagram,Carrusel,Completado,2026-09-10,,,,No'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.columna).toBe('fecha_publicacion')
    expect(plan.errores[0]?.mensaje).toMatch(/publicada sin fecha/i)
  })
})

describe('formatos de fecha de Notion', () => {
  it('lee ISO', () => {
    expect(parsearFechaNotion('2026-09-15', 'iso')).toEqual({ fecha: '2026-09-15', hora: null })
  })

  it('lee el mes en inglés, como exporta un workspace en inglés', () => {
    expect(parsearFechaNotion('September 15, 2026', 'iso')).toEqual({
      fecha: '2026-09-15',
      hora: null,
    })
    expect(parsearFechaNotion('Sep 3, 2026 7:00 PM', 'iso')).toEqual({
      fecha: '2026-09-03',
      hora: '19:00',
    })
  })

  it('lee el mes en español', () => {
    expect(parsearFechaNotion('15 de septiembre de 2026', 'iso')).toEqual({
      fecha: '2026-09-15',
      hora: null,
    })
    expect(parsearFechaNotion('3 sept. 2026 9:30 a.m.', 'iso')).toEqual({
      fecha: '2026-09-03',
      hora: '09:30',
    })
  })

  it('lee el ISO con hora y zona que manda la API, sin tragarse el -07:00 como hora', () => {
    expect(parsearFechaNotion('2026-09-15T10:30:00.000-07:00', 'iso')).toEqual({
      fecha: '2026-09-15',
      hora: '10:30',
    })
    expect(parsearFechaNotion('2026-09-15T10:30:00', 'iso')).toEqual({
      fecha: '2026-09-15',
      hora: '10:30',
    })
    expect(parsearFechaNotion('2026-09-15T00:00:00Z', 'iso')).toEqual({
      fecha: '2026-09-15',
      hora: '00:00',
    })
  })

  it('se queda con el inicio de un rango', () => {
    expect(parsearFechaNotion('2026-09-15 → 2026-09-20', 'iso')?.fecha).toBe('2026-09-15')
  })

  it('rechaza una fecha que no existe', () => {
    expect(parsearFechaNotion('2026-02-30', 'iso')).toBeNull()
    expect(parsearFechaNotion('mañana', 'iso')).toBeNull()
  })

  it('resuelve día/mes con la evidencia del archivo completo', () => {
    // 25 no puede ser un mes, así que TODO el archivo es día primero.
    expect(detectarModoDeFecha(['03/09/2026', '25/09/2026'])).toBe('dia-primero')
    expect(parsearFechaNotion('03/09/2026', 'dia-primero')).toEqual({
      fecha: '2026-09-03',
      hora: null,
    })

    expect(detectarModoDeFecha(['09/25/2026', '09/03/2026'])).toBe('mes-primero')
    expect(parsearFechaNotion('09/03/2026', 'mes-primero')).toEqual({
      fecha: '2026-09-03',
      hora: null,
    })
  })

  it('un archivo numérico sin desempate no se importa: adivinar mueve piezas medio año', () => {
    expect(detectarModoDeFecha(['03/09/2026', '05/11/2026'])).toBe('indeterminado')

    const plan = construirPlanDeImportacion(
      csv(
        'Una,Instagram,Carrusel,Guión,,03/09/2026,,,No',
        'Otra,Instagram,Carrusel,Guión,,05/11/2026,,,No',
      ),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.mensaje).toMatch(/Año\/Mes\/Día/)
  })

  it('un archivo que mezcla los dos órdenes es un conflicto, no una preferencia', () => {
    expect(detectarModoDeFecha(['25/09/2026', '09/25/2026'])).toBe('conflicto')
  })

  it('el timestamp se arma con el desplazamiento de ESA fecha, no con uno fijo', () => {
    // Tijuana: verano -07:00, invierno -08:00. Con un offset fijo, media
    // importación queda una hora corrida.
    expect(comoTimestampDelEstudio('2026-09-15', null)).toBe('2026-09-15T12:00:00-07:00')
    expect(comoTimestampDelEstudio('2026-01-15', '19:00')).toBe('2026-01-15T19:00:00-08:00')
  })

  it('el día local no se corre al vecino al convertir a UTC', () => {
    const iso = comoTimestampDelEstudio('2026-09-15', null)
    const enTijuana = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Tijuana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso))

    expect(enTijuana).toBe('2026-09-15')
  })
})

describe('el CSV real: acentos, comas dentro de comillas y saltos de línea', () => {
  const real = [
    ENCABEZADO,
    '"Cómo se hace el ""Old Fashioned"", paso a paso","Instagram, Facebook",Carrusel,Diseñado,2026-09-10,2026-09-15,Ana Gómez,Sprint 12,No',
    '"Reseña del mes:\ntres cócteles, uno por hora",Tiktok,Video,Grabado,2026-09-12,2026-09-18,Luis Pérez,Sprint 12,Yes',
    'Encuesta de sabores,Instagram,Encuesta,Sin empezar,,2026-09-20,Ana Gómez,Sprint 13,No',
  ].join('\n')

  const plan = construirPlanDeImportacion(real)

  it('importa todo sin errores', () => {
    expect(plan.errores).toEqual([])
    expect(plan.ok).toBe(true)
  })

  it('conserva el texto con acentos y con comillas escapadas', () => {
    expect(plan.piezas[0]?.tarea).toBe('Cómo se hace el "Old Fashioned", paso a paso')
  })

  it('no se traga la coma de dentro de las comillas como separador de canal', () => {
    expect(plan.piezas[0]?.plataformas).toEqual(['instagram', 'facebook'])
  })

  it('el salto de línea dentro del campo no desfasa el número de renglón', () => {
    // La tercera pieza empieza en la línea física 5 porque la segunda ocupa dos.
    expect(plan.piezas[1]?.linea).toBe(3)
    expect(plan.stories[0]?.linea).toBe(5)
  })

  it('junta a las personas para empatarlas, sin inventar el empate', () => {
    expect(plan.personas).toEqual(['Ana Gómez', 'Luis Pérez'])
  })

  it('deriva los sprints con el rango que abarcan sus piezas', () => {
    expect(plan.sprints).toEqual([
      { nombre: 'Sprint 12', inicia: '2026-09-15', termina: '2026-09-18', piezas: 2 },
    ])
  })

  it('el sprint de una story no crea un sprint huérfano', () => {
    // La encuesta trae "Sprint 13" pero es story, y las stories no tienen
    // sprint_id: crear ese sprint dejaría un renglón que nadie referencia.
    expect(plan.sprints.map((s) => s.nombre)).not.toContain('Sprint 13')
    expect(plan.avisos.some((a) => a.mensaje.includes('stories'))).toBe(true)
  })

  it('avisa de la casilla Transición-Teaser, que no tiene destino', () => {
    const aviso = plan.avisos.find((a) => a.mensaje.includes('Transición-Teaser'))
    expect(aviso?.renglones).toEqual([3])
  })

  it('lista los meses tocados', () => {
    expect(plan.meses).toEqual(['2026-09'])
  })
})

describe('separador de punto y coma, que es lo que exporta Excel en español', () => {
  it('lo detecta solo', () => {
    const plan = construirPlanDeImportacion(
      [
        'Tarea;Canal;Formato;Estado;Fecha de Entrega;Fecha de publicación;Responsable;Sprint;Transición-Teaser',
        'Pieza con, coma en el texto;Instagram;Carrusel;Guión;;2026-09-15;;;No',
      ].join('\n'),
    )

    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]?.tarea).toBe('Pieza con, coma en el texto')
  })
})

describe('slot_index: el orden dentro del mes', () => {
  it('numera cronológico ascendente y desempata por el orden del archivo', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Tercera,Instagram,Carrusel,Guión,,2026-09-20,,,No',
        'Primera,Instagram,Carrusel,Guión,,2026-09-05,,,No',
        'Segunda a,Instagram,Carrusel,Guión,,2026-09-10,,,No',
        'Segunda b,Instagram,Carrusel,Guión,,2026-09-10,,,No',
      ),
    )

    const porTarea = Object.fromEntries(plan.piezas.map((p) => [p.tarea, p.slotIndex]))
    expect(porTarea).toEqual({ Primera: 0, 'Segunda a': 1, 'Segunda b': 2, Tercera: 3 })
  })

  it('cada mes empieza otra vez en cero', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Sept,Instagram,Carrusel,Guión,,2026-09-05,,,No',
        'Oct,Instagram,Carrusel,Guión,,2026-10-05,,,No',
      ),
    )

    expect(plan.piezas.map((p) => [p.mes, p.slotIndex])).toEqual([
      ['2026-09', 0],
      ['2026-10', 0],
    ])
  })
})

describe('columnas', () => {
  it('reporta las columnas que Notion trae de más y no se usan', () => {
    const plan = construirPlanDeImportacion(
      [
        'Tarea,Formato,Estado,Fecha de publicación,Notas internas,Prioridad',
        'Pieza,Carrusel,Guión,2026-09-15,algo,Alta',
      ].join('\n'),
    )

    expect(plan.ok).toBe(true)
    expect(plan.columnasIgnoradas).toEqual(['notas internas', 'prioridad'])
  })

  it('una columna duplicada detiene el archivo: no se puede elegir cuál gana', () => {
    const plan = construirPlanDeImportacion(
      [
        'Tarea,Estado,Formato,Estado,Fecha de publicación',
        'Pieza,Guión,Carrusel,Guión,2026-09-15',
      ].join('\n'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.mensaje).toContain('dos veces')
  })

  it('un pegado vacío no truena: dice qué hacer', () => {
    const plan = construirPlanDeImportacion('')
    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.mensaje).toMatch(/Exportar/)
  })

  it('un renglón con más columnas que el encabezado se reporta con su línea', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,Instagram,Carrusel,Guión,,2026-09-15,,,No,de más'),
    )

    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.linea).toBe(2)
  })
})

describe('responsables y sprints múltiples', () => {
  it('toma el primer responsable y lo dice', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,Instagram,Carrusel,Guión,,2026-09-15,"Ana Gómez, Luis Pérez",,No'),
    )

    expect(plan.piezas[0]?.responsable).toBe('Ana Gómez')
    expect(plan.avisos.some((a) => a.mensaje.includes('responsable'))).toBe(true)
  })

  it('toma el primer sprint y lo dice', () => {
    const plan = construirPlanDeImportacion(
      csv('Pieza,Instagram,Carrusel,Guión,,2026-09-15,,"Sprint 12, Sprint 13",No'),
    )

    expect(plan.piezas[0]?.sprint).toBe('Sprint 12')
    expect(plan.avisos.some((a) => a.mensaje.includes('sprint'))).toBe(true)
  })
})

describe('pegar JSON en vez de CSV', () => {
  it('lee un arreglo plano', () => {
    const plan = construirPlanDeImportacion(
      JSON.stringify([
        {
          Tarea: 'Pieza de prueba',
          Canal: ['Instagram', 'Tiktok'],
          Formato: 'Carrusel',
          Estado: 'Guión',
          'Fecha de publicación': '2026-09-15',
          Responsable: ['Ana Gómez'],
          'Transición-Teaser': false,
        },
      ]),
    )

    expect(plan.origen).toBe('json')
    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]).toMatchObject({
      tarea: 'Pieza de prueba',
      plataformas: ['instagram', 'tiktok'],
      responsable: 'Ana Gómez',
    })
  })

  it('lee la forma que devuelve la API, con properties', () => {
    const plan = construirPlanDeImportacion(
      JSON.stringify({
        results: [
          {
            properties: {
              Tarea: { type: 'title', title: [{ plain_text: 'Desde la API' }] },
              Canal: { type: 'multi_select', multi_select: [{ name: 'LinkedIn' }] },
              Formato: { type: 'select', select: { name: 'Video' } },
              Estado: { type: 'status', status: { name: 'Programado' } },
              // La API manda la fecha así, con hora y zona, no como '2026-09-15'.
              'Fecha de publicación': {
                type: 'date',
                date: { start: '2026-09-15T19:00:00.000-07:00' },
              },
              Sprint: { type: 'relation', relation: [{ id: 'abc-123' }] },
            },
          },
        ],
      }),
    )

    expect(plan.ok).toBe(true)
    expect(plan.piezas[0]).toMatchObject({
      tarea: 'Desde la API',
      formato: 'reel',
      estado: 'aprobado',
      plataformas: ['linkedin'],
      mes: '2026-09',
      publishAt: '2026-09-15T19:00:00-07:00',
    })
    // La relación solo trae el id: no se inventa un nombre de sprint.
    expect(plan.piezas[0]?.sprint).toBeNull()
    expect(plan.avisos.some((a) => a.mensaje.includes('relaciones'))).toBe(true)
  })

  it('un JSON roto no truena la pantalla', () => {
    const plan = construirPlanDeImportacion('[{"Tarea": ')
    expect(plan.ok).toBe(false)
    expect(plan.errores[0]?.mensaje).toMatch(/no se pudo leer/i)
  })
})

describe('el resumen que se lee arriba de todo', () => {
  it('cuenta lo que va a pasar cuando todo está bien', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Una,Instagram,Carrusel,Guión,,2026-09-15,,Sprint 12,No',
        'Story,Instagram,Story,Guión,,2026-09-16,,,No',
      ),
    )

    expect(resumenDelPlan(plan)).toBe('Listo para importar: 1 pieza, 1 story, 1 sprint.')
  })

  it('un archivo donde todo está rechazado no es un error, pero tampoco una importación', () => {
    const plan = construirPlanDeImportacion(
      csv(
        'Una,Instagram,Carrusel,Rechazado,,2026-09-15,,,No',
        'Otra,Instagram,Carrusel,Rechazado,,2026-09-16,,,No',
      ),
    )

    expect(plan.errores).toEqual([])
    expect(plan.ok).toBe(false)
    expect(resumenDelPlan(plan)).toMatch(/rechazados en Notion/)
  })

  it('cuando hay errores no promete nada', () => {
    const plan = construirPlanDeImportacion(csv('Mala,Instagram,Podcast,Guión,,2026-09-15,,,No'))
    expect(resumenDelPlan(plan)).toMatch(/no se pudo mapear/)
  })
})
