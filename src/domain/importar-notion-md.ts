/**
 * Parser del export de Notion (Markdown) para extraer la ficha de marca.
 *
 * Notion exporta las páginas como archivos .md con estructura predecible:
 *   # Título
 *   ## Sección
 *   Contenido como párrafos, listas y texto formateado.
 *
 * Este módulo extrae nombre, qué es la marca, pilares, audiencia, tono,
 * diferenciadores, color de marca y palabras prohibidas. No es un parser
 * genérico de Markdown: es un reconocedor de patrones del documento de marca
 * que el estudio usa en Notion para cada cliente.
 *
 * Lo que NO hace, a propósito: parsear el CSV del calendario. Eso ya lo hace
 * `src/domain/importar-notion.ts`. Este archivo solo lee el .md.
 */

import { z } from 'zod'

/** Lo que extraemos del markdown. Todo opcional: un campo vacío no detiene nada. */
export interface DatosDeMarcaExtraidos {
  nombre: string | null
  queEs: string | null
  pilares: Array<{
    nombre: string
    /** La descripción entera del pilar, incluyendo bullet points anidados. */
    descripcion: string
  }>
  audiencia: string[]
  tono: string[]
  diferenciadores: string[]
  colorDeMarca: string | null
  /** Hex sin #. Viene de secciones como "Identidad Visual". */
  palabrasProhibidas: string[]
  /** Links a páginas de Notion que menciona el documento. */
  linksNotion: string[]
}

function crearResultadoInicial(): DatosDeMarcaExtraidos {
  return {
    nombre: null,
    queEs: null,
    pilares: [],
    audiencia: [],
    tono: [],
    diferenciadores: [],
    colorDeMarca: null,
    palabrasProhibidas: [],
    linksNotion: [],
  }
}

/**
 * Reconoce si una línea es un encabezado de sección que nos interesa.
 *
 * Los encabezados en Notion pueden traer emoji, y la misma sección puede
 * tener nombres ligeramente distintos entre clientes. Por eso se compara en
 * minúsculas y sin emoji/símbolos decorativos.
 */
function esSeccion(linea: string, patrones: string[]): boolean {
  const limpia = linea
    .toLowerCase()
    .replace(/^#+\s*/, '')
    .replace(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}✨💡📊📲📢🙎🫆🏨🛏️🏊🏻🍽️💍🏛️🩺🏊]/gu,
      '',
    )
    .trim()
  return patrones.some((p) => limpia.includes(p))
}

/** Reconoce una línea como ítem de lista (- o * al inicio). */
function esBullet(linea: string): boolean {
  return /^\s*[-*]\s/.test(linea)
}

function textoDeBullet(linea: string): string {
  return linea.replace(/^\s*[-*]\s+/, '').trim()
}

/** Extrae el primer color hex (con o sin #) que encuentre en un texto. */
const HEX_RE = /#?([0-9A-Fa-f]{6})\b/

function extraerColorHex(texto: string): string | null {
  const match = texto.match(HEX_RE)
  if (!match?.[1]) return null
  return `#${match[1].toUpperCase()}`
}

/** Extrae los links de Notion del documento completo. */
function extraerLinks(markdown: string): string[] {
  // Los links de Notion están en formato: [texto](https://app.notion.com/p/...)
  const re = /\[([^\]]*)\]\((https:\/\/app\.notion\.com\/[^)]+)\)/g
  const links: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown)) !== null) {
    if (match[2]) links.push(match[2])
  }
  return [...new Set(links)]
}

export const datosExtraidosSchema = z.object({
  content: z.string().min(1, 'El archivo está vacío.'),
})

/**
 * Parsea el contenido de un archivo .md exportado de Notion.
 *
 * El orden de las secciones es el del documento, y eso importa: las secciones
 * se detectan en secuencia, y el contenido entre dos encabezados pertenece a
 * la primera sección.
 */
export function extraerDatosDeMarca(markdown: string): DatosDeMarcaExtraidos {
  const resultado = crearResultadoInicial()
  const lineas = markdown.split('\n')
  const links = extraerLinks(markdown)
  resultado.linksNotion = links

  // El título es la primera línea que empieza con #
  for (const linea of lineas) {
    const titulo = linea.match(/^#\s+(.+)/)
    if (titulo?.[1]) {
      resultado.nombre = titulo[1].trim()
      break
    }
  }

  let seccionActual = ''
  let bufferContenido: string[] = []

  function cerrarSeccion() {
    const texto = bufferContenido.join('\n').trim()
    bufferContenido = []

    if (!texto) return

    if (seccionActual === 'queEs') {
      resultado.queEs = (resultado.queEs ? resultado.queEs + '\n\n' : '') + texto
    } else if (seccionActual === 'pilares') {
      // Los pilares vienen como bullets con sub-bullets
      const partes = texto.split('\n')
      let pilarActual: { nombre: string; descripcion: string } | null = null
      for (const parte of partes) {
        if (esBullet(parte)) {
          const contenido = textoDeBullet(parte)
          // Si el bullet no empieza con espacios extra, es un pilar nuevo
          if (!parte.startsWith('    ') && !parte.startsWith('\t')) {
            if (pilarActual) resultado.pilares.push(pilarActual)
            const nombreLimpio = contenido
              .replace(/\*\*/g, '')
              .replace(/\*/g, '')
              .replace(/^Pilar\s*\d+\s*[:—–-]\s*/i, '')
              .trim()
            pilarActual = {
              nombre: nombreLimpio || contenido.trim(),
              descripcion: contenido.trim(),
            }
          } else if (pilarActual) {
            pilarActual.descripcion += '\n' + parte
          }
        }
      }
      if (pilarActual) resultado.pilares.push(pilarActual)
    } else if (seccionActual === 'audiencia') {
      resultado.audiencia = lineasABullets(texto)
    } else if (seccionActual === 'tono') {
      // El tono puede ser una sola frase o bullets
      const bullets = lineasABullets(texto)
      resultado.tono = bullets.length > 0 ? bullets : [texto]
    } else if (seccionActual === 'diferenciadores') {
      resultado.diferenciadores = lineasABullets(texto)
    } else if (seccionActual === 'color') {
      const color = extraerColorHex(texto)
      if (color) resultado.colorDeMarca = color
    } else if (seccionActual === 'prohibidas') {
      resultado.palabrasProhibidas = lineasABullets(texto)
    }
  }

  function lineasABullets(texto: string): string[] {
    return texto
      .split('\n')
      .filter((l) => esBullet(l))
      .map(textoDeBullet)
      .filter(Boolean)
  }

  for (const linea of lineas) {
    // Detecta encabezados de sección
    if (linea.startsWith('#')) {
      cerrarSeccion()

      if (esSeccion(linea, ['qué es', 'que es'])) seccionActual = 'queEs'
      else if (esSeccion(linea, ['pilares', 'contenido'])) seccionActual = 'pilares'
      else if (esSeccion(linea, ['público', 'publico', 'audiencia', 'target', 'objetivo']))
        seccionActual = 'audiencia'
      else if (esSeccion(linea, ['tono', 'voz'])) seccionActual = 'tono'
      else if (esSeccion(linea, ['diferenciador', 'diferenciador']))
        seccionActual = 'diferenciadores'
      else if (esSeccion(linea, ['visual', 'color', 'identidad'])) seccionActual = 'color'
      else if (esSeccion(linea, ['prohibid', 'banned', 'no usar'])) seccionActual = 'prohibidas'
      else seccionActual = ''

      continue
    }

    if (seccionActual) {
      bufferContenido.push(linea)
    }
  }

  cerrarSeccion()

  return resultado
}
