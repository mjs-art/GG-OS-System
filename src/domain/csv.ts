/**
 * Importador de CSV de métricas. Lógica pura, sin IO.
 *
 * Un CSV que sube una persona es **entrada externa** y se trata como tal: se
 * valida con Zod y se reporta cada renglón malo con su número de línea. Sin el
 * número de línea el mensaje "hay un error" obliga a revisar 300 renglones a
 * ojo, y entonces nadie corrige nada: se vuelve a exportar y se vuelve a fallar.
 *
 * La regla dura del importador es **todo o nada**. Si un solo renglón viene
 * mal, no se importa ninguno. Un mes a medias es peor que un mes vacío: el
 * vacío se nota y se corrige; el mes a medias se ve normal, alimenta el plan de
 * volumen del mes siguiente y nadie descubre que faltaban ocho piezas.
 *
 * Los casos feos de verdad, que son los que traen los archivos reales:
 *   · BOM al inicio — Excel en Windows lo pone siempre, y sin quitarlo la
 *     primera columna se llama "﻿mes" y no empata con nada.
 *   · Separador `;` — Excel en español exporta con punto y coma, no con coma.
 *   · Separador decimal con coma — "4,8" son 4.8, no 48.
 *   · Miles con coma o con punto — "1,240" y "1.240" son mil doscientos cuarenta.
 *   · Encabezados en español, con acentos, con mayúsculas o con espacios de más.
 *   · Columnas de más, que Meta agrega sin avisar entre exportaciones.
 *   · Comillas escapadas dentro de un campo entrecomillado, y saltos de línea
 *     dentro de un hook.
 */

import { z } from 'zod'
import { isMonthKey, type MonthKey } from '@/lib/time'

/* -------------------------------------------------------------------------- */
/*  Partir el texto                                                            */
/* -------------------------------------------------------------------------- */

export interface FilaCruda {
  /** Línea física en el archivo, empezando en 1. Es lo que se le dice a Ana. */
  linea: number
  celdas: string[]
}

export interface TablaCsv {
  separador: string
  encabezados: string[]
  /** La línea donde venían los encabezados, para poder citarla en un error. */
  lineaEncabezados: number
  filas: FilaCruda[]
}

const SEPARADORES = [',', ';', '\t'] as const

/**
 * Elige el separador contando ocurrencias FUERA de comillas en la primera
 * línea con contenido. Contar dentro de las comillas hace que un solo hook con
 * comas ("tres cócteles, uno por hora") le gane a un archivo de punto y coma.
 */
export function detectarSeparador(primeraLinea: string): string {
  let mejor: string = ','
  let mejorConteo = -1

  for (const sep of SEPARADORES) {
    let conteo = 0
    let enComillas = false
    for (let i = 0; i < primeraLinea.length; i++) {
      const c = primeraLinea[i]
      if (c === '"') {
        enComillas = !enComillas
        continue
      }
      if (!enComillas && c === sep) conteo++
    }
    if (conteo > mejorConteo) {
      mejor = sep
      mejorConteo = conteo
    }
  }

  return mejor
}

/**
 * Parte un CSV respetando comillas, comillas escapadas (`""`) y saltos de línea
 * dentro de un campo entrecomillado.
 *
 * El contador de líneas avanza también con los saltos que van DENTRO de un
 * campo: si no, un hook de dos renglones desfasa todos los números de línea a
 * partir de ahí y el reporte de errores manda a Ana al renglón equivocado.
 */
export function partirCsv(texto: string): TablaCsv {
  // El BOM solo estorba al inicio. En medio del archivo sería un dato raro,
  // pero no es asunto del partidor.
  const limpio = texto.replace(/^\uFEFF/, '')

  const primeraConContenido = limpio.split(/\r\n|\n|\r/).find((l) => l.trim().length > 0) ?? ''
  const separador = detectarSeparador(primeraConContenido)

  const filas: FilaCruda[] = []
  let celdas: string[] = []
  let campo = ''
  let enComillas = false
  let linea = 1
  let lineaDeLaFila = 1
  let hayContenido = false

  const cerrarCampo = () => {
    celdas.push(campo)
    campo = ''
  }

  const cerrarFila = () => {
    cerrarCampo()
    // Un renglón que solo trae separadores y espacios es basura de Excel al
    // final del archivo, no un error del usuario.
    if (hayContenido) filas.push({ linea: lineaDeLaFila, celdas })
    celdas = []
    hayContenido = false
  }

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]

    if (enComillas) {
      if (c === '"') {
        if (limpio[i + 1] === '"') {
          // "" dentro de comillas es una comilla literal, no el cierre.
          campo += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        if (c === '\n') linea++
        campo += c
      }
      continue
    }

    if (c === '"') {
      enComillas = true
      hayContenido = true
      continue
    }
    if (c === separador) {
      cerrarCampo()
      continue
    }
    if (c === '\r') {
      // \r\n cuenta como un solo salto.
      if (limpio[i + 1] === '\n') i++
      cerrarFila()
      linea++
      lineaDeLaFila = linea
      continue
    }
    if (c === '\n') {
      cerrarFila()
      linea++
      lineaDeLaFila = linea
      continue
    }

    if (c !== undefined && c.trim().length > 0) hayContenido = true
    campo += c
  }

  cerrarFila()

  const [encabezado, ...resto] = filas

  return {
    separador,
    encabezados: (encabezado?.celdas ?? []).map(normalizarEncabezado),
    lineaEncabezados: encabezado?.linea ?? 1,
    filas: resto,
  }
}

/**
 * Encabezado comparable: sin acentos, sin comillas, sin mayúsculas y sin
 * espacios de más. "Alcance de la publicación " y "alcance de la publicacion"
 * tienen que ser la misma columna.
 */
export function normalizarEncabezado(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["']/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:.]+$/, '')
}

/* -------------------------------------------------------------------------- */
/*  Números                                                                    */
/* -------------------------------------------------------------------------- */

/** Espacio normal, duro y fino: los tres salen de Excel y de Meta. */
const ESPACIOS = /[\s\u00a0\u202f]/g

/**
 * Entero de una celda. Aquí `,` y `.` son SIEMPRE separadores de miles.
 *
 * Separar enteros de decimales es lo que quita la ambigüedad de "1,240": en una
 * columna de alcance no puede ser 1.24, y adivinar con heurísticas produce el
 * bug silencioso de dividir el alcance del mes entre mil.
 */
export function parsearEntero(valor: string): number | null {
  const limpio = valor.replace(ESPACIOS, '').replace(/[,.]/g, '')
  if (limpio === '' || limpio === '-') return null
  if (!/^-?\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isSafeInteger(n) ? n : null
}

/**
 * Decimal de una celda, con el separador que sea.
 *
 * Regla: el ÚLTIMO `,` o `.` es el separador decimal y todos los demás son de
 * miles — salvo que ese último separe exactamente tres dígitos y sea el único,
 * en cuyo caso es de miles ("1,240" es mil doscientos cuarenta, no 1.24).
 * Es la convención de los exportadores de Meta y de Excel en los dos locales.
 */
export function parsearDecimal(valor: string): number | null {
  let limpio = valor.replace(ESPACIOS, '').replace('%', '')
  if (limpio === '' || limpio === '-') return null

  const ultimaComa = limpio.lastIndexOf(',')
  const ultimoPunto = limpio.lastIndexOf('.')
  const corte = Math.max(ultimaComa, ultimoPunto)

  if (corte >= 0) {
    const decimales = limpio.length - corte - 1
    const separadores = (limpio.match(/[,.]/g) ?? []).length
    if (separadores === 1 && decimales === 3) {
      limpio = limpio.replace(/[,.]/g, '')
    } else {
      const entera = limpio.slice(0, corte).replace(/[,.]/g, '')
      limpio = `${entera}.${limpio.slice(corte + 1)}`
    }
  }

  if (!/^-?\d*\.?\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/* -------------------------------------------------------------------------- */
/*  Columnas de Zod que además convierten                                      */
/* -------------------------------------------------------------------------- */

function columnaEntera(opciones: { min?: number } = {}) {
  const min = opciones.min ?? 0
  return z.string().transform((valor, ctx) => {
    const n = parsearEntero(valor)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `"${valor.trim()}" no es un número entero.` })
      return z.NEVER
    }
    if (n < min) {
      ctx.addIssue({ code: 'custom', message: `${n} es menor que el mínimo permitido (${min}).` })
      return z.NEVER
    }
    return n
  })
}

/** Entero que sí puede ser negativo: un mes se pueden perder seguidores. */
function columnaEnteraConSigno() {
  return z.string().transform((valor, ctx) => {
    const n = parsearEntero(valor)
    if (n === null) {
      ctx.addIssue({ code: 'custom', message: `"${valor.trim()}" no es un número entero.` })
      return z.NEVER
    }
    return n
  })
}

function columnaMes() {
  return z.string().transform((valor, ctx): MonthKey => {
    const limpio = valor.trim()
    // Se acepta la fecha completa que exporta Meta: del 2026-09-01 nos importa
    // el mes, y pedirle a Ana que edite la columna a mano es pedir un error.
    const mes = /^\d{4}-\d{2}-\d{2}$/.test(limpio) ? limpio.slice(0, 7) : limpio
    if (!isMonthKey(mes)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${limpio}" no es un mes válido. Se espera AAAA-MM, por ejemplo 2026-09.`,
      })
      return z.NEVER
    }
    return mes
  })
}

const idDePieza = z.string().trim().min(1, 'El identificador de la pieza viene vacío.')

/* -------------------------------------------------------------------------- */
/*  Los dos formatos que se importan                                           */
/* -------------------------------------------------------------------------- */

/**
 * Alias por columna. La primera es el nombre canónico y el resto es lo que de
 * verdad trae un export: español con y sin acento, inglés, y las variantes que
 * Meta cambia entre versiones de la Business Suite.
 */
type MapaDeAlias = Record<string, readonly string[]>

const ALIAS_MENSUAL: MapaDeAlias = {
  mes: ['mes', 'month', 'periodo', 'fecha', 'fecha de inicio'],
  alcance: ['alcance', 'reach', 'personas alcanzadas', 'cuentas alcanzadas'],
  impresiones: ['impresiones', 'impressions', 'visualizaciones', 'veces que se vio'],
  guardados: ['guardados', 'saves', 'veces guardado', 'guardar'],
  compartidos: ['compartidos', 'shares', 'veces compartido', 'compartir'],
  interacciones: ['interacciones', 'interactions', 'engagement', 'participacion'],
  seguidores_nuevos: ['seguidores nuevos', 'nuevos seguidores', 'new followers', 'seguidores'],
  visitas_perfil: ['visitas al perfil', 'visitas de perfil', 'profile visits'],
  clics_link: [
    'clics al link',
    'clics en el enlace',
    'clics en el vinculo',
    'link clicks',
    'clics del sitio web',
  ],
}

const ALIAS_PIEZA: MapaDeAlias = {
  pieza_id: ['pieza', 'pieza id', 'id de la pieza', 'piece id', 'post id', 'identificador'],
  alcance: ['alcance', 'reach', 'personas alcanzadas', 'cuentas alcanzadas'],
  impresiones: ['impresiones', 'impressions', 'visualizaciones'],
  guardados: ['guardados', 'saves', 'veces guardado'],
  compartidos: ['compartidos', 'shares', 'veces compartido'],
  interacciones: ['interacciones', 'interactions', 'engagement'],
}

const filaMensualSchema = z.object({
  mes: columnaMes(),
  alcance: columnaEntera(),
  impresiones: columnaEntera(),
  guardados: columnaEntera(),
  compartidos: columnaEntera(),
  interacciones: columnaEntera(),
  seguidores_nuevos: columnaEnteraConSigno(),
  visitas_perfil: columnaEntera(),
  clics_link: columnaEntera(),
})

const filaPiezaSchema = z.object({
  pieza_id: idDePieza,
  alcance: columnaEntera(),
  impresiones: columnaEntera(),
  guardados: columnaEntera(),
  compartidos: columnaEntera(),
  interacciones: columnaEntera(),
})

export type FilaMensual = z.infer<typeof filaMensualSchema>
export type FilaPieza = z.infer<typeof filaPiezaSchema>

/* -------------------------------------------------------------------------- */
/*  El importador                                                              */
/* -------------------------------------------------------------------------- */

export interface ErrorDeImportacion {
  /** `null` cuando el problema es del archivo entero y no de un renglón. */
  linea: number | null
  /** El nombre canónico de la columna, cuando el error es de una celda. */
  columna: string | null
  mensaje: string
}

export interface Importacion<T> {
  /**
   * Los renglones válidos. Vienen aunque haya errores para poder mostrar
   * cuántos SÍ pasaron, pero `ok` es lo que decide si se escribe a la base.
   */
  filas: Array<{ linea: number; datos: T }>
  errores: ErrorDeImportacion[]
  /** `true` solo si no hubo ni un error. Todo o nada. */
  ok: boolean
  /** Columnas del archivo que no se usan. Se informan, no son error. */
  columnasIgnoradas: string[]
}

/** Une los alias en un índice `columna canónica → posición en el archivo`. */
function mapearColumnas(
  encabezados: readonly string[],
  alias: MapaDeAlias,
): { indices: Map<string, number>; ignoradas: string[]; duplicadas: string[] } {
  const indices = new Map<string, number>()
  const duplicadas: string[] = []
  const usadas = new Set<number>()

  encabezados.forEach((encabezado, i) => {
    if (encabezado === '') return
    for (const [canonica, nombres] of Object.entries(alias)) {
      if (!nombres.includes(encabezado)) continue
      if (indices.has(canonica)) {
        // Dos columnas que dicen lo mismo: no se puede adivinar cuál gana, y
        // elegir en silencio es exactamente cómo se importa la columna
        // equivocada durante tres meses.
        duplicadas.push(canonica)
      } else {
        indices.set(canonica, i)
      }
      usadas.add(i)
      return
    }
  })

  const ignoradas = encabezados.filter((h, i) => h !== '' && !usadas.has(i))
  return { indices, ignoradas, duplicadas }
}

function importar<S extends z.ZodType>(
  texto: string,
  alias: MapaDeAlias,
  schema: S,
): Importacion<z.infer<S>> {
  const errores: ErrorDeImportacion[] = []
  const filas: Array<{ linea: number; datos: z.infer<S> }> = []

  const tabla = partirCsv(texto)

  if (tabla.encabezados.length === 0 || tabla.filas.length === 0) {
    errores.push({
      linea: null,
      columna: null,
      mensaje:
        'El archivo no trae renglones de datos. Revisa que exportaste el reporte completo y no solo los encabezados.',
    })
    return { filas, errores, ok: false, columnasIgnoradas: [] }
  }

  const { indices, ignoradas, duplicadas } = mapearColumnas(tabla.encabezados, alias)

  const faltantes = Object.keys(alias).filter((c) => !indices.has(c))
  if (faltantes.length > 0) {
    errores.push({
      linea: tabla.lineaEncabezados,
      columna: null,
      mensaje: `Faltan columnas: ${faltantes.join(', ')}. El archivo trae: ${tabla.encabezados.filter(Boolean).join(', ')}.`,
    })
  }
  for (const columna of duplicadas) {
    errores.push({
      linea: tabla.lineaEncabezados,
      columna,
      mensaje: `La columna "${columna}" viene dos veces. Deja solo una y vuelve a exportar.`,
    })
  }

  if (errores.length > 0) {
    return { filas, errores, ok: false, columnasIgnoradas: ignoradas }
  }

  for (const fila of tabla.filas) {
    if (fila.celdas.length > tabla.encabezados.length) {
      errores.push({
        linea: fila.linea,
        columna: null,
        mensaje: `El renglón trae ${fila.celdas.length} columnas y el encabezado declara ${tabla.encabezados.length}. Suele ser una coma sin comillas dentro de un texto.`,
      })
      continue
    }

    const crudo: Record<string, string> = {}
    for (const [canonica, i] of indices) {
      crudo[canonica] = fila.celdas[i] ?? ''
    }

    const resultado = schema.safeParse(crudo)
    if (!resultado.success) {
      for (const issue of resultado.error.issues) {
        errores.push({
          linea: fila.linea,
          columna: issue.path[0] ? String(issue.path[0]) : null,
          mensaje: issue.message,
        })
      }
      continue
    }

    filas.push({ linea: fila.linea, datos: resultado.data })
  }

  return { filas, errores, ok: errores.length === 0, columnasIgnoradas: ignoradas }
}

/** Totales del mes, tal como los exporta Meta Business Suite. */
export function importarResultadosMensuales(texto: string): Importacion<FilaMensual> {
  const resultado = importar(texto, ALIAS_MENSUAL, filaMensualSchema)

  // Dos renglones del mismo mes producirían un upsert que se pisa a sí mismo y
  // deja el último, en silencio. Vale más rechazar el archivo.
  const vistos = new Map<string, number>()
  for (const { linea, datos } of resultado.filas) {
    const anterior = vistos.get(datos.mes)
    if (anterior !== undefined) {
      resultado.errores.push({
        linea,
        columna: 'mes',
        mensaje: `El mes ${datos.mes} ya venía en la línea ${anterior}. Cada mes va una sola vez.`,
      })
    } else {
      vistos.set(datos.mes, linea)
    }
  }

  return { ...resultado, ok: resultado.errores.length === 0 }
}

/** Métricas pieza por pieza. Alimentan las tablas de rendimiento. */
export function importarResultadosPorPieza(texto: string): Importacion<FilaPieza> {
  const resultado = importar(texto, ALIAS_PIEZA, filaPiezaSchema)

  const vistos = new Map<string, number>()
  for (const { linea, datos } of resultado.filas) {
    const anterior = vistos.get(datos.pieza_id)
    if (anterior !== undefined) {
      resultado.errores.push({
        linea,
        columna: 'pieza_id',
        mensaje: `La pieza ${datos.pieza_id} ya venía en la línea ${anterior}. Cada pieza va una sola vez.`,
      })
    } else {
      vistos.set(datos.pieza_id, linea)
    }
  }

  return { ...resultado, ok: resultado.errores.length === 0 }
}

/** El resumen de una línea que se muestra arriba de la lista de errores. */
export function resumenDeImportacion<T>(resultado: Importacion<T>): string {
  if (resultado.ok) {
    return `${resultado.filas.length} ${resultado.filas.length === 1 ? 'renglón listo' : 'renglones listos'} para importar.`
  }
  const n = resultado.errores.length
  return `${n} ${n === 1 ? 'problema' : 'problemas'} en el archivo. No se importó nada: un mes a medias es peor que uno vacío.`
}
