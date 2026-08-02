import { describe, expect, it } from 'vitest'
import {
  detectarSeparador,
  importarResultadosMensuales,
  importarResultadosPorPieza,
  normalizarEncabezado,
  parsearDecimal,
  parsearEntero,
  partirCsv,
  resumenDeImportacion,
} from '@/domain/csv'

/**
 * Los CSV de aquí abajo están escritos como salen de verdad de Meta Business
 * Suite y de Excel en español: con BOM, con punto y coma, con acentos, con
 * columnas de más y con comas dentro de un hook.
 */

const BOM = '﻿'

const CSV_LIMPIO = [
  'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
  '2026-07,38200,61400,410,168,2740,204,1890,312',
  '2026-08,12100,19800,133,51,890,61,640,98',
].join('\n')

describe('partirCsv', () => {
  it('parte un archivo normal', () => {
    const tabla = partirCsv('a,b\n1,2\n3,4\n')
    expect(tabla.encabezados).toEqual(['a', 'b'])
    expect(tabla.filas).toHaveLength(2)
    expect(tabla.filas[0]).toEqual({ linea: 2, celdas: ['1', '2'] })
    expect(tabla.filas[1]?.linea).toBe(3)
  })

  it('quita el BOM que pone Excel en Windows', () => {
    const tabla = partirCsv(`${BOM}mes,alcance\n2026-07,100\n`)
    expect(tabla.encabezados[0]).toBe('mes')
  })

  it('aguanta finales de línea de Windows', () => {
    const tabla = partirCsv('a,b\r\n1,2\r\n')
    expect(tabla.filas[0]?.celdas).toEqual(['1', '2'])
    expect(tabla.filas).toHaveLength(1)
  })

  it('respeta las comas dentro de comillas', () => {
    const tabla = partirCsv('id,hook\n1,"tres cócteles, uno por hora"\n')
    expect(tabla.filas[0]?.celdas).toEqual(['1', 'tres cócteles, uno por hora'])
  })

  it('entiende las comillas escapadas', () => {
    const tabla = partirCsv('id,hook\n1,"le dicen ""la barra"" de siempre"\n')
    expect(tabla.filas[0]?.celdas[1]).toBe('le dicen "la barra" de siempre')
  })

  /* El bug silencioso: un salto de línea dentro de un campo desfasa TODOS los
     números de línea que siguen, y el reporte manda al renglón equivocado. */
  it('cuenta los saltos de línea que van dentro de un campo', () => {
    const tabla = partirCsv('id,hook\n1,"dos\nrenglones"\n2,otro\n')
    expect(tabla.filas[0]?.linea).toBe(2)
    expect(tabla.filas[0]?.celdas[1]).toBe('dos\nrenglones')
    expect(tabla.filas[1]?.linea).toBe(4)
  })

  it('ignora renglones vacíos al final', () => {
    const tabla = partirCsv('a,b\n1,2\n\n\n')
    expect(tabla.filas).toHaveLength(1)
  })

  it('detecta el punto y coma de Excel en español', () => {
    expect(detectarSeparador('mes;alcance;guardados')).toBe(';')
    const tabla = partirCsv('mes;alcance\n2026-07;38.200\n')
    expect(tabla.filas[0]?.celdas).toEqual(['2026-07', '38.200'])
  })

  it('un hook con muchas comas no le gana al punto y coma del encabezado', () => {
    expect(detectarSeparador('id;hook;alcance')).toBe(';')
    const tabla = partirCsv('id;hook;alcance\n1;"uno, dos, tres, cuatro";900\n')
    expect(tabla.filas[0]?.celdas).toEqual(['1', 'uno, dos, tres, cuatro', '900'])
  })

  it('detecta tabuladores', () => {
    expect(detectarSeparador('mes\talcance')).toBe('\t')
  })
})

describe('normalizarEncabezado', () => {
  it('quita acentos, mayúsculas, comillas y espacios de más', () => {
    expect(normalizarEncabezado('  Impresiónes  ')).toBe('impresiones')
    expect(normalizarEncabezado('"Visitas al  perfil"')).toBe('visitas al perfil')
    expect(normalizarEncabezado('Clics al link:')).toBe('clics al link')
  })
})

describe('parsearEntero', () => {
  it('lee un entero pelón', () => {
    expect(parsearEntero('38200')).toBe(38200)
  })

  it('los separadores de miles son de miles, con coma o con punto', () => {
    expect(parsearEntero('1,240')).toBe(1240)
    expect(parsearEntero('1.240')).toBe(1240)
    expect(parsearEntero('1,240,500')).toBe(1240500)
  })

  it('aguanta espacios duros y finos de Excel', () => {
    expect(parsearEntero('38\u00a0200')).toBe(38200)
    expect(parsearEntero('38\u202f200')).toBe(38200)
  })

  it('acepta negativos: un mes se pueden perder seguidores', () => {
    expect(parsearEntero('-24')).toBe(-24)
  })

  it('rechaza lo que no es número', () => {
    expect(parsearEntero('')).toBeNull()
    expect(parsearEntero('  ')).toBeNull()
    expect(parsearEntero('n/d')).toBeNull()
    expect(parsearEntero('1240x')).toBeNull()
    expect(parsearEntero('-')).toBeNull()
  })
})

describe('parsearDecimal', () => {
  it('lee el punto decimal', () => {
    expect(parsearDecimal('4.8')).toBe(4.8)
  })

  it('lee la coma decimal', () => {
    expect(parsearDecimal('4,8')).toBe(4.8)
    expect(parsearDecimal('2,14')).toBe(2.14)
  })

  it('con los dos separadores, el último manda', () => {
    expect(parsearDecimal('1.240,5')).toBe(1240.5)
    expect(parsearDecimal('1,240.5')).toBe(1240.5)
  })

  it('un separador solo con tres dígitos atrás es de miles', () => {
    expect(parsearDecimal('1,240')).toBe(1240)
    expect(parsearDecimal('3.890')).toBe(3890)
  })

  it('quita el signo de porcentaje', () => {
    expect(parsearDecimal('4,8%')).toBe(4.8)
  })

  it('rechaza basura', () => {
    expect(parsearDecimal('')).toBeNull()
    expect(parsearDecimal('—')).toBeNull()
  })
})

describe('importarResultadosMensuales', () => {
  it('importa un archivo limpio', () => {
    const r = importarResultadosMensuales(CSV_LIMPIO)
    expect(r.ok).toBe(true)
    expect(r.errores).toEqual([])
    expect(r.filas).toHaveLength(2)
    expect(r.filas[0]?.datos).toEqual({
      mes: '2026-07',
      alcance: 38200,
      impresiones: 61400,
      guardados: 410,
      compartidos: 168,
      interacciones: 2740,
      seguidores_nuevos: 204,
      visitas_perfil: 1890,
      clics_link: 312,
    })
  })

  /* El archivo feo de verdad: BOM, punto y coma, acentos, mayúsculas, miles con
     punto, una columna de más y los encabezados en inglés de Meta. */
  it('importa el archivo que de verdad exporta Meta en español', () => {
    const feo = [
      `${BOM}Mes;Alcance;Impresiónes;Guardados;Compartidos;Interacciones;Nuevos seguidores;Visitas de perfil;Clics en el enlace;Comentarios;Reproducciones`,
      '2026-07-01;38.200;61.400;410;168;2.740;204;1.890;312;44;9.100',
      '2026-08-01;12.100;19.800;133;51;890;-61;640;98;12;3.400',
      '',
    ].join('\r\n')

    const r = importarResultadosMensuales(feo)
    expect(r.errores).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.filas[0]?.datos.mes).toBe('2026-07')
    expect(r.filas[0]?.datos.alcance).toBe(38200)
    expect(r.filas[1]?.datos.seguidores_nuevos).toBe(-61)
    expect(r.columnasIgnoradas).toEqual(['comentarios', 'reproducciones'])
  })

  it('reporta el renglón malo CON su número de línea', () => {
    const conBasura = [
      'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
      '2026-07,38200,61400,410,168,2740,204,1890,312',
      '2026-08,n/d,19800,133,51,890,61,640,98',
    ].join('\n')

    const r = importarResultadosMensuales(conBasura)
    expect(r.ok).toBe(false)
    expect(r.errores).toHaveLength(1)
    expect(r.errores[0]?.linea).toBe(3)
    expect(r.errores[0]?.columna).toBe('alcance')
    expect(r.errores[0]?.mensaje).toContain('n/d')
  })

  it('un renglón malo tumba la importación completa', () => {
    const conBasura = [
      'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
      '2026-07,38200,61400,410,168,2740,204,1890,312',
      'julio,1,1,1,1,1,1,1,1',
    ].join('\n')

    const r = importarResultadosMensuales(conBasura)
    expect(r.ok).toBe(false)
    // El renglón bueno se cuenta, pero `ok` es lo que decide si se escribe.
    expect(r.filas).toHaveLength(1)
    expect(resumenDeImportacion(r)).toContain('No se importó nada')
  })

  it('señala el mes inválido con el formato que se espera', () => {
    const r = importarResultadosMensuales(
      [
        'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
        '13/2026,1,1,1,1,1,1,1,1',
      ].join('\n'),
    )
    expect(r.errores[0]?.mensaje).toContain('AAAA-MM')
    expect(r.errores[0]?.linea).toBe(2)
  })

  it('rechaza métricas negativas donde no tienen sentido', () => {
    const r = importarResultadosMensuales(
      [
        'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
        '2026-07,-5,1,1,1,1,1,1,1',
      ].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.columna).toBe('alcance')
  })

  it('avisa qué columnas faltan y cuáles sí trae', () => {
    const r = importarResultadosMensuales('mes,alcance\n2026-07,100\n')
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.mensaje).toContain('Faltan columnas')
    expect(r.errores[0]?.mensaje).toContain('guardados')
    expect(r.errores[0]?.linea).toBe(1)
  })

  it('rechaza el mismo mes dos veces en vez de pisarlo en silencio', () => {
    const r = importarResultadosMensuales(
      [
        'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
        '2026-07,1,1,1,1,1,1,1,1',
        '2026-07,2,2,2,2,2,2,2,2',
      ].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.linea).toBe(3)
    expect(r.errores[0]?.mensaje).toContain('línea 2')
  })

  it('rechaza una columna duplicada en vez de adivinar cuál gana', () => {
    const r = importarResultadosMensuales(
      [
        'mes,alcance,reach,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
        '2026-07,1,2,1,1,1,1,1,1,1',
      ].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.columna).toBe('alcance')
    expect(r.errores[0]?.mensaje).toContain('dos veces')
  })

  it('señala el renglón con columnas de más', () => {
    const r = importarResultadosMensuales(
      [
        'mes,alcance,impresiones,guardados,compartidos,interacciones,seguidores nuevos,visitas al perfil,clics al link',
        '2026-07,38200,61400,410,168,2740,204,1890,312,sobra',
      ].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.linea).toBe(2)
    expect(r.errores[0]?.mensaje).toContain('columnas')
  })

  it('un archivo con puros encabezados dice qué hacer', () => {
    const r = importarResultadosMensuales('mes,alcance\n')
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.mensaje).toContain('no trae renglones')
  })

  it('un archivo vacío no truena', () => {
    const r = importarResultadosMensuales('')
    expect(r.ok).toBe(false)
    expect(r.filas).toEqual([])
  })
})

describe('importarResultadosPorPieza', () => {
  const CSV_PIEZAS = [
    'Pieza,Hook,Alcance,Impresiones,Guardados,Compartidos,Interacciones',
    'dddddddd-0000-4000-8000-000000000001,"la barra a las 6, y a las 9:40",5120,7800,88,61,320',
    'dddddddd-0000-4000-8000-000000000002,tres cócteles,2340,3100,94,12,130',
  ].join('\n')

  it('importa las métricas por pieza e ignora el hook', () => {
    const r = importarResultadosPorPieza(CSV_PIEZAS)
    expect(r.ok).toBe(true)
    expect(r.filas).toHaveLength(2)
    expect(r.filas[0]?.datos.pieza_id).toBe('dddddddd-0000-4000-8000-000000000001')
    expect(r.filas[0]?.datos.alcance).toBe(5120)
    expect(r.columnasIgnoradas).toEqual(['hook'])
  })

  it('rechaza la misma pieza dos veces', () => {
    const r = importarResultadosPorPieza(
      [
        'Pieza,Alcance,Impresiones,Guardados,Compartidos,Interacciones',
        'abc,1,1,1,1,1',
        'abc,2,2,2,2,2',
      ].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.mensaje).toContain('línea 2')
  })

  it('rechaza una pieza sin identificador', () => {
    const r = importarResultadosPorPieza(
      ['Pieza,Alcance,Impresiones,Guardados,Compartidos,Interacciones', ',1,1,1,1,1'].join('\n'),
    )
    expect(r.ok).toBe(false)
    expect(r.errores[0]?.columna).toBe('pieza_id')
  })
})

describe('resumenDeImportacion', () => {
  it('cuenta los renglones listos cuando todo pasó', () => {
    const r = importarResultadosMensuales(CSV_LIMPIO)
    expect(resumenDeImportacion(r)).toBe('2 renglones listos para importar.')
  })

  it('en singular no dice "renglones"', () => {
    const uno = CSV_LIMPIO.split('\n').slice(0, 2).join('\n')
    expect(resumenDeImportacion(importarResultadosMensuales(uno))).toContain('1 renglón listo')
  })
})
