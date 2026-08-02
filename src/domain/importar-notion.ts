/**
 * Importador de Notion → Studio OS. Mapeo puro, sin IO.
 *
 * El estudio lleva su calendario en la base `Social Media / Podcast` de Notion
 * y se muda. **Es una importación de UNA VEZ, no una sincronización**: después
 * de correrla, Studio OS es la fuente de verdad y Notion deja de importar. Dos
 * fuentes de verdad se desincronizan y la que gana siempre es la equivocada.
 *
 * Por eso tampoco hay integración con la API de Notion: eso es OAuth, revisión
 * de app y un token más que cuidar, para una operación que se hace una vez por
 * cliente. Se pega el CSV que Notion exporta con un clic, o el JSON.
 *
 * Este archivo no escribe nada. Produce un PLAN —qué se va a crear, qué no se
 * puede y por qué— para que una persona lo vea ANTES de que se toque la base.
 * Importar 200 piezas mal mapeadas cuesta mucho más que revisar una pantalla.
 *
 * El partidor de CSV es el de `@/domain/csv`. No se escribe otro: ya hubo dos
 * en este repo y consolidarlos costó.
 */

import { normalizarEncabezado, partirCsv, type ErrorDeImportacion } from '@/domain/csv'
import type { PieceFormat, PieceStatus, Platform, StoryKind } from '@/domain/labels'
import { isMonthKey, STUDIO_TIMEZONE, type MonthKey } from '@/lib/time'

/* ========================================================================== */
/*  Lo que produce el importador                                               */
/* ========================================================================== */

export type OrigenDeImportacion = 'csv' | 'json'

export interface PiezaImportada {
  /** Línea física del CSV, o número de registro del JSON. Empieza en 1. */
  linea: number
  /** El texto de `Tarea`. Se guarda en `pieces.idea`. */
  tarea: string
  mes: MonthKey
  formato: PieceFormat
  estado: PieceStatus
  plataformas: Platform[]
  /** ISO con el desplazamiento del estudio, o `null` si no hay fecha de publicación. */
  publishAt: string | null
  /** `AAAA-MM-DD`, o `null`. */
  dueDate: string | null
  /** El NOMBRE que trae Notion. Empatarlo con un usuario es un paso aparte. */
  responsable: string | null
  /** El NOMBRE del sprint. Los sprints se crean por nombre, no por id. */
  sprint: string | null
  /** Orden dentro del mes: cronológico ascendente, empezando en 0. */
  slotIndex: number
}

export interface StoryImportada {
  linea: number
  tarea: string
  mes: MonthKey
  /** `AAAA-MM-DD`. `stories.scheduled_on` es un `date`, no un timestamp. */
  fecha: string
  tipo: StoryKind
  estado: PieceStatus
}

export interface SprintDetectado {
  nombre: string
  /** Se deriva de las piezas: la relación de Notion solo exporta el título. */
  inicia: string
  termina: string
  piezas: number
}

/** Un renglón que a propósito no se importa. No es un error: es una decisión. */
export interface RenglonOmitido {
  linea: number
  tarea: string
  motivo: string
}

/** Algo que sí se importa pero que hay que saber antes de confirmar. */
export interface Aviso {
  mensaje: string
  renglones: number[]
}

export interface PlanDeImportacion {
  origen: OrigenDeImportacion
  piezas: PiezaImportada[]
  stories: StoryImportada[]
  omitidas: RenglonOmitido[]
  /** Bloquean la importación completa. Todo o nada. */
  errores: ErrorDeImportacion[]
  avisos: Aviso[]
  /** Nombres distintos de Notion que hay que empatar con usuarios del estudio. */
  personas: string[]
  sprints: SprintDetectado[]
  meses: MonthKey[]
  columnasIgnoradas: string[]
  ok: boolean
  diagnostico: DiagnosticoImportacion
}

/* ========================================================================== */
/*  Los mapeos, que son decisiones de producto                                 */
/* ========================================================================== */

/**
 * Mismo normalizado que los encabezados: sin acentos, sin comillas, sin
 * mayúsculas y sin espacios de más. Se reusa a propósito en los VALORES: "Guión"
 * y "guion" son el mismo estado, y un segundo normalizador acabaría divergiendo
 * del primero.
 */
const normalizar = normalizarEncabezado

export type DestinoDeFormato =
  { destino: 'pieza'; formato: PieceFormat } | { destino: 'story'; tipo: StoryKind }

/**
 * `Formato` de Notion → nuestro modelo.
 *
 * Nuestro enum `app.piece_format` es `post | carrusel | reel`, y no por
 * pobreza: **una story no es una pieza de feed**. Se planea distinto, se cuenta
 * distinto y vive en su propia tabla (`stories`), que además tiene su propio
 * calendario diario. Meter una story en `pieces` inflaría el conteo del mes, el
 * balance de pilares y el porcentaje de aprobación con algo que dura 24 horas.
 *
 *   · Carrusel → `carrusel`. Directo.
 *   · Video    → `reel`. El único video de feed que produce el estudio es el
 *                vertical corto; no hay un formato "video" genérico que perder.
 *   · Estático → `post`. Una imagen sola en el feed es exactamente eso.
 *   · Story    → tabla `stories`, tipo `diaria`.
 *   · Encuesta → tabla `stories`, tipo `interactiva`. La encuesta de Notion es
 *                el sticker de encuesta, que es una story interactiva; se le
 *                pone `sticker: 'encuesta'` a la diapositiva para no perderlo.
 *
 * Cualquier otro valor NO se adivina: el renglón se reporta con su número y la
 * persona decide. Adivinar aquí es cómo se importan treinta "Reel" como posts.
 */
const FORMATO: Record<string, DestinoDeFormato> = {
  carrusel: { destino: 'pieza', formato: 'carrusel' },
  video: { destino: 'pieza', formato: 'reel' },
  estatico: { destino: 'pieza', formato: 'post' },
  story: { destino: 'story', tipo: 'diaria' },
  stories: { destino: 'story', tipo: 'diaria' },
  encuesta: { destino: 'story', tipo: 'interactiva' },
}

/**
 * `Estado` de Notion (siete) → `app.piece_status` (seis).
 *
 * El tablero de Notion mezcla dos ejes: en qué punto va la pieza y por cuál de
 * las dos ramas de producción pasó (diseño o video). Nuestro pipeline solo
 * tiene el primero, así que dos columnas de Notion caen en el mismo estado —
 * y está bien: "Diseñado" y "Grabado" son el mismo momento del proceso.
 *
 *   · Sin empezar → `idea`      · existe en el plan, nadie la ha tocado.
 *   · Guión       → `escrito`   · ya hay texto.
 *   · Diseñado    → `revisado`  · el material está armado y pasó revisión interna.
 *   · Grabado     → `revisado`  · el mismo punto, por la rama de video.
 *   · Programado  → `aprobado`  · programar implica que ya se aprobó; falta salir.
 *   · Completado  → `publicado` · ya salió.
 *   · Rechazado   → SE OMITE.
 *
 * `Rechazado` no tiene equivalente y no debe tenerlo. Es trabajo que el estudio
 * mató; traerlo como `idea` lo resucita dentro del calendario nuevo, y traerlo
 * como cualquier otra cosa miente. Se lista en la vista previa para que se vea
 * que no se perdió por accidente: se dejó fuera a propósito.
 *
 * `con_cliente` nunca se usa porque el tablero de Notion no tiene una columna
 * de "esperando al cliente". No es un hueco del mapeo: es información que el
 * origen no tiene.
 */
const ESTADO: Record<string, PieceStatus | 'omitir'> = {
  'sin empezar': 'idea',
  guion: 'escrito',
  disenado: 'revisado',
  grabado: 'revisado',
  programado: 'aprobado',
  completado: 'publicado',
  rechazado: 'omitir',
}

/** `Canal` (multi_select) → `app.platform`, que va en minúsculas. */
const CANAL: Record<string, Platform> = {
  tiktok: 'tiktok',
  'tik tok': 'tiktok',
  linkedin: 'linkedin',
  'linked in': 'linkedin',
  instagram: 'instagram',
  ig: 'instagram',
  facebook: 'facebook',
  fb: 'facebook',
}

/** Etiquetas para la vista previa, sin exponer los nombres del enum. */
export const DESTINO_LABEL: Record<'pieza' | 'story', string> = {
  pieza: 'Pieza de feed',
  story: 'Story',
}

/* ========================================================================== */
/*  Columnas                                                                   */
/* ========================================================================== */

/**
 * Alias por columna. La primera es el nombre canónico. Los alias van YA
 * normalizados (sin acentos, en minúsculas) porque contra eso se comparan.
 */
const ALIAS: Record<string, readonly string[]> = {
  tarea: ['tarea', 'nombre', 'name', 'title', 'titulo', 'pieza'],
  canal: ['canal', 'canales', 'plataforma', 'plataformas'],
  formato: ['formato', 'format'],
  estado: ['estado', 'estatus', 'status'],
  fecha_entrega: ['fecha de entrega', 'fecha entrega', 'entrega', 'due date'],
  fecha_publicacion: [
    'fecha de publicacion',
    'fecha publicacion',
    'publicacion',
    'fecha de publicación',
  ],
  responsable: ['responsable', 'responsables', 'asignado', 'assignee', 'owner'],
  sprint: ['sprint', 'sprints'],
  teaser: ['transicion-teaser', 'transicion teaser', 'teaser'],
}

const OBLIGATORIAS = ['tarea', 'formato', 'estado'] as const

/** El nombre con el que la persona ve la columna en Notion, para los mensajes. */
const NOMBRES_EN_NOTION: Record<string, string> = {
  tarea: 'Tarea',
  canal: 'Canal',
  formato: 'Formato',
  estado: 'Estado',
  fecha_entrega: 'Fecha de Entrega',
  fecha_publicacion: 'Fecha de publicación',
  responsable: 'Responsable',
  sprint: 'Sprint',
  teaser: 'Transición-Teaser',
}

const NOMBRE_EN_NOTION = (canonica: string): string => NOMBRES_EN_NOTION[canonica] ?? canonica

/** Tope de renglones. Un mes de un cliente son decenas; miles es otra cosa. */
const MAX_RENGLONES = 2000

interface FilaNotion {
  linea: number
  /** Columna canónica → celda en bruto. Las ausentes vienen como ''. */
  celdas: Record<string, string>
}

interface Lectura {
  origen: OrigenDeImportacion
  filas: FilaNotion[]
  /** Columnas canónicas que SÍ venían en el encabezado, aunque vengan vacías. */
  presentes: Set<string>
  columnasIgnoradas: string[]
  errores: ErrorDeImportacion[]
  avisos: Aviso[]
  diagnostico: DiagnosticoImportacion
}

/** Información cruda de lo que el parser detectó. Útil para diagnosticar por qué falla. */
export interface DiagnosticoImportacion {
  separador: string
  encabezadosCrudos: string[]
  primerasFilas: string[][]
}

/* ========================================================================== */
/*  Fechas: la parte que más silenciosamente se equivoca                       */
/* ========================================================================== */

/**
 * Qué significa `03/09/2026` en este archivo.
 *
 * Notion exporta la fecha con el formato del workspace, y `03/09/2026` es el 3
 * de septiembre o el 9 de marzo según quién lo configuró. Adivinar por el
 * locale del navegador mueve piezas medio año y nadie lo nota hasta que el
 * cliente pregunta por un post de marzo.
 *
 * Por eso el modo se resuelve **para el archivo entero** y con evidencia: basta
 * un solo renglón con día > 12 para fijar el orden de todos los demás. Si el
 * archivo no trae ni una fecha que lo desempate, no se importa: se le pide a la
 * persona que reexporte con el formato de año primero.
 */
export type ModoFecha = 'iso' | 'dia-primero' | 'mes-primero' | 'indeterminado' | 'conflicto'

const NUMERICA = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/

export function detectarModoDeFecha(celdas: readonly string[]): ModoFecha {
  let hayNumericas = false
  let evidenciaDia = false
  let evidenciaMes = false

  for (const celda of celdas) {
    const limpia = sinHora(separarIso(soloElInicio(celda))).trim()
    const m = NUMERICA.exec(limpia)
    if (!m) continue
    hayNumericas = true
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12) evidenciaDia = true
    if (b > 12) evidenciaMes = true
  }

  if (evidenciaDia && evidenciaMes) return 'conflicto'
  if (evidenciaDia) return 'dia-primero'
  if (evidenciaMes) return 'mes-primero'
  return hayNumericas ? 'indeterminado' : 'iso'
}

export interface FechaNotion {
  /** `AAAA-MM-DD`. */
  fecha: string
  /** `HH:MM` en 24 horas, o `null` si Notion no traía hora. */
  hora: string | null
}

/**
 * Notion exporta los rangos como `inicio → fin`. Nos quedamos con el inicio:
 * una pieza se publica un día, no durante una semana.
 */
function soloElInicio(bruto: string): string {
  const [inicio = ''] = bruto.split(/→|->/)
  return inicio.trim()
}

/**
 * `2026-09-15T10:30:00.000-07:00` → `2026-09-15 10:30:00`.
 *
 * Es la forma que manda la API de Notion, y hay que desarmarla ANTES de buscar
 * la hora: ese `-07:00` del final trae dos puntos y el buscador de hora se lo
 * tragaría como si fueran las 7 en punto.
 *
 * El desplazamiento se descarta a propósito. Notion exporta en la zona del
 * workspace y el estudio entero opera en la de Tijuana, así que la hora que
 * viene ya es la hora local; reinterpretarla la correría una o dos horas.
 */
function separarIso(valor: string): string {
  return valor.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{1,2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/,
    '$1 $2',
  )
}

const HORA = /(\d{1,2}):(\d{2})(?::\d{2})?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i

function sinHora(valor: string): string {
  return valor.replace(HORA, ' ')
}

function leerHora(valor: string): string | null {
  const m = HORA.exec(valor)
  if (!m) return null

  let horas = Number(m[1])
  const minutos = Number(m[2])
  const sufijo = m[3]?.toLowerCase().replace(/[.\s]/g, '')

  if (sufijo === 'pm' && horas < 12) horas += 12
  if (sufijo === 'am' && horas === 12) horas = 0
  if (horas > 23 || minutos > 59) return null

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

const MESES: Record<string, number> = {
  enero: 1,
  ene: 1,
  january: 1,
  jan: 1,
  febrero: 2,
  feb: 2,
  february: 2,
  marzo: 3,
  mar: 3,
  march: 3,
  abril: 4,
  abr: 4,
  april: 4,
  apr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  june: 6,
  julio: 7,
  jul: 7,
  july: 7,
  agosto: 8,
  ago: 8,
  august: 8,
  aug: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  sept: 9,
  september: 9,
  octubre: 10,
  oct: 10,
  october: 10,
  noviembre: 11,
  nov: 11,
  november: 11,
  diciembre: 12,
  dic: 12,
  december: 12,
  dec: 12,
}

function diasDelMes(anio: number, mes: number): number {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function armar(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12) return null
  if (dia < 1 || dia > diasDelMes(anio, mes)) return null
  if (anio < 2000 || anio > 2100) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Lee cualquiera de los formatos con los que Notion exporta una fecha.
 *
 * ISO y los meses escritos con letra son inequívocos y no dependen del modo.
 * Solo la forma numérica con barras necesita el modo del archivo.
 */
export function parsearFechaNotion(bruto: string, modo: ModoFecha): FechaNotion | null {
  const valor = separarIso(soloElInicio(bruto))
  if (valor === '') return null

  const hora = leerHora(valor)
  const soloFecha = sinHora(valor).trim()

  // 2026-09-15 · 2026/09/15
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(soloFecha)
  if (iso) {
    const fecha = armar(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    return fecha ? { fecha, hora } : null
  }

  // 15/09/2026 · 09-15-2026
  const num = NUMERICA.exec(soloFecha)
  if (num) {
    if (modo !== 'dia-primero' && modo !== 'mes-primero') return null
    const a = Number(num[1])
    const b = Number(num[2])
    const anio = Number(num[3])
    const fecha = modo === 'dia-primero' ? armar(anio, b, a) : armar(anio, a, b)
    return fecha ? { fecha, hora } : null
  }

  // "September 15, 2026" · "15 de septiembre de 2026" · "15 sept 2026"
  const tokens = normalizar(soloFecha)
    .replace(/[,.]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && t !== 'de' && t !== 'del')

  let mes: number | undefined
  const numeros: number[] = []
  for (const token of tokens) {
    const posible = MESES[token]
    if (posible !== undefined && mes === undefined) {
      mes = posible
      continue
    }
    if (/^\d+$/.test(token)) numeros.push(Number(token))
    else return null
  }

  if (mes === undefined || numeros.length !== 2) return null
  const anio = numeros.find((n) => n > 31)
  const dia = numeros.find((n) => n <= 31)
  if (anio === undefined || dia === undefined) return null

  const fecha = armar(anio, mes, dia)
  return fecha ? { fecha, hora } : null
}

/**
 * Notion casi nunca trae hora. Mediodía local, y no medianoche, porque
 * medianoche convertida entre zonas cae en el día vecino con una facilidad
 * ridícula — y una pieza que se corre un día es un error que nadie revisa.
 */
const HORA_POR_DEFECTO = '12:00'

/**
 * `AAAA-MM-DD` + `HH:MM` locales → un timestamptz que Postgres entiende.
 *
 * El desplazamiento se calcula PARA ESA FECHA: Tijuana es -08:00 en invierno y
 * -07:00 en verano, y usar uno fijo mueve media importación una hora — que en
 * una pieza de las 11:30 p.m. es un día entero.
 */
export function comoTimestampDelEstudio(fecha: string, hora: string | null): string {
  return `${fecha}T${hora ?? HORA_POR_DEFECTO}:00${desplazamientoDelEstudio(fecha)}`
}

function desplazamientoDelEstudio(fecha: string): string {
  // Mediodía UTC de ese día cae de madrugada en Tijuana, siempre dentro del
  // mismo día natural y después del cambio de horario (que ocurre a las 2 a.m.).
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${fecha}T12:00:00Z`))

  const nombre = partes.find((p) => p.type === 'timeZoneName')?.value ?? ''
  return /GMT([+-]\d{2}:\d{2})/.exec(nombre)?.[1] ?? '-08:00'
}

/* ========================================================================== */
/*  Leer el pegado: CSV o JSON                                                 */
/* ========================================================================== */

/** Notion une los valores múltiples con coma. Un título con coma se parte mal. */
function partirLista(valor: string): string[] {
  return valor
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')
}

function leerCsv(texto: string): Lectura {
  const errores: ErrorDeImportacion[] = []
  const tabla = partirCsv(texto)

  const diagnostico: DiagnosticoImportacion = {
    separador: tabla.separador === '\t' ? 'tabulador' : `"${tabla.separador}"`,
    encabezadosCrudos: tabla.encabezados,
    primerasFilas: tabla.filas.slice(0, 3).map((f) => f.celdas),
  }

  if (tabla.encabezados.length === 0 || tabla.filas.length === 0) {
    errores.push({
      linea: null,
      columna: null,
      mensaje:
        'El pegado no trae renglones de datos. En Notion abre la base, menú ··· → Exportar → CSV, ' +
        'y pega el archivo completo, con su primer renglón de encabezados.',
    })
    return {
      origen: 'csv',
      filas: [],
      presentes: new Set(),
      columnasIgnoradas: [],
      errores,
      avisos: [],
      diagnostico,
    }
  }

  const indices = new Map<string, number>()
  const duplicadas: string[] = []
  const usadas = new Set<number>()

  tabla.encabezados.forEach((encabezado, i) => {
    if (encabezado === '') return
    for (const [canonica, nombres] of Object.entries(ALIAS)) {
      if (!nombres.includes(encabezado)) continue
      // Dos columnas que dicen lo mismo: elegir una en silencio es cómo se
      // importa la columna equivocada y nadie se entera.
      if (indices.has(canonica)) duplicadas.push(canonica)
      else indices.set(canonica, i)
      usadas.add(i)
      return
    }
  })

  for (const columna of duplicadas) {
    errores.push({
      linea: tabla.lineaEncabezados,
      columna,
      mensaje: `La columna "${columna}" viene dos veces. Deja solo una y vuelve a exportar.`,
    })
  }

  const filas: FilaNotion[] = []
  for (const fila of tabla.filas) {
    if (fila.celdas.length > tabla.encabezados.length) {
      errores.push({
        linea: fila.linea,
        columna: null,
        mensaje: `El renglón trae ${fila.celdas.length} columnas y el encabezado declara ${tabla.encabezados.length}. Suele ser una coma sin comillas dentro de un texto.`,
      })
      continue
    }

    const celdas: Record<string, string> = {}
    for (const canonica of Object.keys(ALIAS)) {
      const i = indices.get(canonica)
      celdas[canonica] = i === undefined ? '' : (fila.celdas[i] ?? '')
    }
    filas.push({ linea: fila.linea, celdas })
  }

  return {
    origen: 'csv',
    filas,
    presentes: new Set(indices.keys()),
    columnasIgnoradas: tabla.encabezados.filter((h, i) => h !== '' && !usadas.has(i)),
    errores,
    avisos: [],
    diagnostico,
  }
}

/** Aplana el valor de una propiedad de la API de Notion a texto. */
function textoDePropiedad(valor: unknown): { texto: string; relacionSinNombre: boolean } {
  if (valor === null || valor === undefined) return { texto: '', relacionSinNombre: false }
  if (typeof valor === 'string') return { texto: valor, relacionSinNombre: false }
  if (typeof valor === 'number') return { texto: String(valor), relacionSinNombre: false }
  if (typeof valor === 'boolean') return { texto: valor ? 'Yes' : 'No', relacionSinNombre: false }

  if (Array.isArray(valor)) {
    const partes = valor.map((v) => textoDePropiedad(v))
    return {
      texto: partes
        .map((p) => p.texto)
        .filter((t) => t !== '')
        .join(', '),
      relacionSinNombre: partes.some((p) => p.relacionSinNombre),
    }
  }

  if (typeof valor !== 'object') return { texto: '', relacionSinNombre: false }
  const obj = valor as Record<string, unknown>

  // Los envoltorios de la API, en orden de especificidad.
  if (typeof obj['plain_text'] === 'string') {
    return { texto: obj['plain_text'], relacionSinNombre: false }
  }
  if (typeof obj['name'] === 'string') return { texto: obj['name'], relacionSinNombre: false }

  const tipo = typeof obj['type'] === 'string' ? obj['type'] : null
  if (tipo !== null && tipo in obj) return textoDePropiedad(obj[tipo])

  if (typeof obj['start'] === 'string') return { texto: obj['start'], relacionSinNombre: false }

  // Una relación de la API trae `{id}` y nada más: el título vive en la otra
  // base y esta importación no llama a Notion. Se reporta, no se inventa.
  if (typeof obj['id'] === 'string') return { texto: '', relacionSinNombre: true }

  return { texto: '', relacionSinNombre: false }
}

function leerJson(texto: string): Lectura {
  const errores: ErrorDeImportacion[] = []
  const avisos: Aviso[] = []

  let crudo: unknown
  try {
    crudo = JSON.parse(texto)
  } catch {
    return {
      origen: 'json',
      filas: [],
      presentes: new Set(),
      columnasIgnoradas: [],
      errores: [
        {
          linea: null,
          columna: null,
          mensaje: 'El pegado empieza como JSON pero no se pudo leer. Revisa que esté completo.',
        },
      ],
      avisos: [],
      diagnostico: { separador: '', encabezadosCrudos: [], primerasFilas: [] },
    }
  }

  const contenedor = crudo as { results?: unknown }
  const registros = Array.isArray(crudo)
    ? crudo
    : Array.isArray(contenedor.results)
      ? contenedor.results
      : null

  if (!registros || registros.length === 0) {
    return {
      origen: 'json',
      filas: [],
      presentes: new Set(),
      columnasIgnoradas: [],
      errores: [
        {
          linea: null,
          columna: null,
          mensaje:
            'El JSON no trae registros. Se espera un arreglo de páginas, o el objeto con `results` que devuelve la API de Notion.',
        },
      ],
      avisos: [],
      diagnostico: { separador: '', encabezadosCrudos: [], primerasFilas: [] },
    }
  }

  const filas: FilaNotion[] = []
  const ignoradas = new Set<string>()
  const presentes = new Set<string>()
  const sinNombreDeRelacion: number[] = []

  registros.forEach((registro, i) => {
    const linea = i + 1
    const obj = (registro ?? {}) as Record<string, unknown>
    const props = (
      typeof obj['properties'] === 'object' && obj['properties'] !== null ? obj['properties'] : obj
    ) as Record<string, unknown>

    const celdas: Record<string, string> = {}
    for (const canonica of Object.keys(ALIAS)) celdas[canonica] = ''

    for (const [llave, valor] of Object.entries(props)) {
      const canonica = Object.entries(ALIAS).find(([, nombres]) =>
        nombres.includes(normalizar(llave)),
      )?.[0]

      const { texto: plano, relacionSinNombre } = textoDePropiedad(valor)
      if (relacionSinNombre) sinNombreDeRelacion.push(linea)

      if (canonica === undefined) {
        ignoradas.add(llave)
        continue
      }
      presentes.add(canonica)
      celdas[canonica] = plano
    }

    filas.push({ linea, celdas })
  })

  if (sinNombreDeRelacion.length > 0) {
    avisos.push({
      mensaje:
        'El JSON de la API trae las relaciones como identificadores, no como títulos, así que ' +
        'esos sprints no se pueden nombrar. Si los quieres, exporta la base a CSV.',
      renglones: [...new Set(sinNombreDeRelacion)],
    })
  }

  return {
    origen: 'json',
    filas,
    presentes,
    columnasIgnoradas: [...ignoradas],
    errores,
    avisos,
    diagnostico: { separador: '', encabezadosCrudos: [], primerasFilas: [] },
  }
}

/* ========================================================================== */
/*  El plan                                                                    */
/* ========================================================================== */

interface Acumulador {
  sinCanal: number[]
  variosResponsables: number[]
  variosSprints: number[]
  storiesConDatoPerdido: number[]
  teaser: number[]
  sinHora: number[]
}

export function construirPlanDeImportacion(texto: string): PlanDeImportacion {
  const empieza = texto.trimStart()
  const lectura =
    empieza.startsWith('[') || empieza.startsWith('{') ? leerJson(texto) : leerCsv(texto)

  const errores: ErrorDeImportacion[] = [...lectura.errores]
  const avisos: Aviso[] = [...lectura.avisos]
  const vacio = (): PlanDeImportacion => ({
    origen: lectura.origen,
    piezas: [],
    stories: [],
    omitidas: [],
    errores,
    avisos,
    personas: [],
    sprints: [],
    meses: [],
    columnasIgnoradas: lectura.columnasIgnoradas,
    diagnostico: lectura.diagnostico,
    ok: false,
  })

  if (lectura.filas.length === 0) return vacio()

  if (lectura.filas.length > MAX_RENGLONES) {
    errores.push({
      linea: null,
      columna: null,
      mensaje: `El pegado trae ${lectura.filas.length} renglones y el tope es ${MAX_RENGLONES}. Impórtalo por partes.`,
    })
    return vacio()
  }

  /* --- Columnas que tienen que estar ------------------------------------- */

  // Se distingue "la columna no viene" de "la columna viene vacía": el remedio
  // es distinto. Lo primero se arregla eligiendo bien qué exportar; lo segundo,
  // llenando el tablero.
  const faltantes = OBLIGATORIAS.filter((c) => !lectura.presentes.has(c))
  if (faltantes.length > 0) {
    errores.push({
      linea: null,
      columna: null,
      mensaje: `El archivo no trae ${faltantes.length === 1 ? 'la columna' : 'las columnas'} ${faltantes.map(NOMBRE_EN_NOTION).join(', ')}. Exporta la base completa, con todas sus propiedades.`,
    })
  }

  const tiene = (columna: string) => lectura.filas.some((f) => (f.celdas[columna] ?? '') !== '')
  const vacias = OBLIGATORIAS.filter((c) => lectura.presentes.has(c) && !tiene(c))
  if (vacias.length > 0) {
    errores.push({
      linea: null,
      columna: null,
      mensaje: `${vacias.map(NOMBRE_EN_NOTION).join(', ')} ${vacias.length === 1 ? 'viene vacía' : 'vienen vacías'} en todos los renglones. Llénala en Notion y vuelve a exportar.`,
    })
  }

  if (!tiene('fecha_entrega') && !tiene('fecha_publicacion')) {
    errores.push({
      linea: null,
      columna: null,
      mensaje:
        'No hay ninguna fecha en el archivo. Sin Fecha de publicación ni Fecha de Entrega no se puede saber a qué mes va cada pieza.',
    })
  }
  if (errores.length > 0) return vacio()

  /* --- Qué significa 03/09/2026 en ESTE archivo -------------------------- */

  const modo = detectarModoDeFecha(
    lectura.filas.flatMap((f) => [
      f.celdas['fecha_entrega'] ?? '',
      f.celdas['fecha_publicacion'] ?? '',
    ]),
  )

  if (modo === 'conflicto' || modo === 'indeterminado') {
    errores.push({
      linea: null,
      columna: null,
      mensaje:
        modo === 'conflicto'
          ? 'El archivo mezcla fechas día/mes y mes/día, así que no hay forma de leerlas sin adivinar. Reexporta con el formato Año/Mes/Día.'
          : 'Las fechas vienen como 03/09/2026 y ninguna desempata si es día o mes. En Notion cambia el formato de la fecha a Año/Mes/Día y vuelve a exportar.',
    })
    return vacio()
  }

  /* --- Renglón por renglón ------------------------------------------------ */

  const piezas: Array<Omit<PiezaImportada, 'slotIndex'>> = []
  const stories: StoryImportada[] = []
  const omitidas: RenglonOmitido[] = []
  const acc: Acumulador = {
    sinCanal: [],
    variosResponsables: [],
    variosSprints: [],
    storiesConDatoPerdido: [],
    teaser: [],
    sinHora: [],
  }

  for (const fila of lectura.filas) {
    const linea = fila.linea
    const error = (columna: string | null, mensaje: string) =>
      errores.push({ linea, columna, mensaje })

    const tarea = (fila.celdas['tarea'] ?? '').trim()
    if (tarea === '') {
      error(
        'tarea',
        'El renglón no trae Tarea. Una pieza sin nombre no se puede reconocer después.',
      )
      continue
    }

    /* Estado */
    const estadoBruto = (fila.celdas['estado'] ?? '').trim()
    const estado = ESTADO[normalizar(estadoBruto)]
    if (estado === undefined) {
      error(
        'estado',
        estadoBruto === ''
          ? 'El renglón no trae Estado.'
          : `"${estadoBruto}" no es un Estado que conozcamos. Los válidos son: Sin empezar, Guión, Diseñado, Grabado, Programado, Completado y Rechazado.`,
      )
      continue
    }
    if (estado === 'omitir') {
      omitidas.push({
        linea,
        tarea,
        motivo: 'Está rechazada en Notion y no hay estado equivalente. No se importa.',
      })
      continue
    }

    /* Formato */
    const formatoBruto = (fila.celdas['formato'] ?? '').trim()
    const destino = FORMATO[normalizar(formatoBruto)]
    if (destino === undefined) {
      error(
        'formato',
        formatoBruto === ''
          ? 'El renglón no trae Formato, y de ahí sale si es pieza de feed o story.'
          : `"${formatoBruto}" no es un Formato que sepamos mapear. Los válidos son: Carrusel, Video, Estático, Story y Encuesta.`,
      )
      continue
    }

    /* Fechas */
    const brutoEntrega = (fila.celdas['fecha_entrega'] ?? '').trim()
    const brutoPublicacion = (fila.celdas['fecha_publicacion'] ?? '').trim()

    const entrega = brutoEntrega === '' ? null : parsearFechaNotion(brutoEntrega, modo)
    if (brutoEntrega !== '' && entrega === null) {
      error('fecha_entrega', `No se entiende la fecha "${brutoEntrega}".`)
      continue
    }

    const publicacion = brutoPublicacion === '' ? null : parsearFechaNotion(brutoPublicacion, modo)
    if (brutoPublicacion !== '' && publicacion === null) {
      error('fecha_publicacion', `No se entiende la fecha "${brutoPublicacion}".`)
      continue
    }

    // El mes sale de la publicación; si no hay, de la entrega. Sin ninguna de
    // las dos el renglón no tiene a dónde ir en el planner.
    const referencia = publicacion ?? entrega
    if (referencia === null) {
      error(
        null,
        'El renglón no trae Fecha de publicación ni Fecha de Entrega, así que no hay mes al cual mandarlo.',
      )
      continue
    }

    const mes = referencia.fecha.slice(0, 7)
    if (!isMonthKey(mes)) {
      error(null, `La fecha ${referencia.fecha} no cae en un mes válido.`)
      continue
    }

    /* Sprint y responsable: nombres, sin resolver todavía. */
    const responsables = partirLista(fila.celdas['responsable'] ?? '')
    if (responsables.length > 1) acc.variosResponsables.push(linea)
    const sprints = partirLista(fila.celdas['sprint'] ?? '')
    if (sprints.length > 1) acc.variosSprints.push(linea)

    if (normalizar(fila.celdas['teaser'] ?? '') === 'yes') acc.teaser.push(linea)

    /* --- Story ------------------------------------------------------------ */
    if (destino.destino === 'story') {
      // `stories` no tiene canal, ni responsable, ni sprint. No es un descuido
      // del esquema: una story se planea por día y por tipo, no por canal.
      if ((fila.celdas['canal'] ?? '') !== '' || responsables.length > 0 || sprints.length > 0) {
        acc.storiesConDatoPerdido.push(linea)
      }
      stories.push({ linea, tarea, mes, fecha: referencia.fecha, tipo: destino.tipo, estado })
      continue
    }

    /* --- Pieza de feed ---------------------------------------------------- */

    const plataformas: Platform[] = []
    let canalMalo = false
    for (const bruto of partirLista(fila.celdas['canal'] ?? '')) {
      const plataforma = CANAL[normalizar(bruto)]
      if (plataforma === undefined) {
        error(
          'canal',
          `"${bruto}" no es un canal que manejemos. Los válidos son Instagram, Facebook, TikTok y LinkedIn.`,
        )
        canalMalo = true
        continue
      }
      if (!plataformas.includes(plataforma)) plataformas.push(plataforma)
    }
    if (canalMalo) continue
    if (plataformas.length === 0) acc.sinCanal.push(linea)

    // Una pieza publicada sin fecha de publicación es imposible en la base
    // (`pieces_published_needs_date`). Vale más decirlo aquí, con el número de
    // renglón, que dejar que la transacción truene con el mensaje de Postgres.
    if (estado === 'publicado' && publicacion === null) {
      error(
        'fecha_publicacion',
        'Está como Completado pero no trae Fecha de publicación. Una pieza publicada sin fecha no se puede guardar.',
      )
      continue
    }

    if (publicacion !== null && publicacion.hora === null) acc.sinHora.push(linea)

    piezas.push({
      linea,
      tarea,
      mes,
      formato: destino.formato,
      estado,
      plataformas,
      publishAt:
        publicacion === null ? null : comoTimestampDelEstudio(publicacion.fecha, publicacion.hora),
      dueDate: entrega?.fecha ?? null,
      responsable: responsables[0] ?? null,
      sprint: sprints[0] ?? null,
    })
  }

  /* --- Orden dentro del mes ---------------------------------------------- */

  const conSlot = asignarSlots(piezas)

  /* --- Sprints ------------------------------------------------------------ */

  const sprints = derivarSprints(conSlot)

  /* --- Personas ----------------------------------------------------------- */

  const personas = [
    ...new Set(conSlot.map((p) => p.responsable).filter((r): r is string => r !== null)),
  ].sort((a, b) => a.localeCompare(b, 'es-MX'))

  /* --- Avisos ------------------------------------------------------------- */

  empujar(avisos, acc.sinCanal, (n) =>
    n === 1
      ? 'Una pieza no trae canal. Se importa sin canal y lo pones en el planner.'
      : `${n} piezas no traen canal. Se importan sin canal y los pones en el planner.`,
  )
  empujar(
    avisos,
    acc.variosResponsables,
    (n) =>
      `${n === 1 ? 'Un renglón trae' : `${n} renglones traen`} más de un responsable. Se toma el primero: una pieza tiene un solo dueño.`,
  )
  empujar(
    avisos,
    acc.variosSprints,
    (n) =>
      `${n === 1 ? 'Un renglón trae' : `${n} renglones traen`} más de un sprint. Se toma el primero.`,
  )
  empujar(
    avisos,
    acc.storiesConDatoPerdido,
    (n) =>
      `${n === 1 ? 'Una story trae' : `${n} stories traen`} canal, responsable o sprint. Las stories no guardan esos campos en Studio OS y ese dato no se importa.`,
  )
  empujar(
    avisos,
    acc.teaser,
    (n) =>
      `${n === 1 ? 'Un renglón tiene' : `${n} renglones tienen`} marcada la casilla Transición-Teaser. Studio OS no tiene dónde guardarla, así que ese dato se queda en Notion.`,
  )
  empujar(
    avisos,
    acc.sinHora,
    (n) =>
      `${n === 1 ? 'Una pieza no trae' : `${n} piezas no traen`} hora de publicación. Quedan a las 12:00 p.m. y las ajustas en el planner.`,
  )

  const meses = [...new Set([...conSlot.map((p) => p.mes), ...stories.map((s) => s.mes)])].sort()

  return {
    origen: lectura.origen,
    piezas: conSlot,
    stories,
    omitidas,
    errores,
    avisos,
    personas,
    sprints,
    meses: meses.filter(isMonthKey),
    columnasIgnoradas: lectura.columnasIgnoradas,
    diagnostico: lectura.diagnostico,
    ok: errores.length === 0 && conSlot.length + stories.length > 0,
  }
}

function empujar(avisos: Aviso[], renglones: number[], texto: (n: number) => string): void {
  if (renglones.length === 0) return
  avisos.push({ mensaje: texto(renglones.length), renglones })
}

/**
 * `slot_index` es el orden dentro del mes y el planner lo lee ascendente.
 *
 * Se numera por fecha y, cuando dos piezas caen el mismo día, por el orden del
 * archivo. Sin el desempate el orden dependería del recorrido y dos
 * importaciones del mismo CSV darían tableros distintos.
 */
function asignarSlots(piezas: Array<Omit<PiezaImportada, 'slotIndex'>>): PiezaImportada[] {
  const porMes = new Map<string, Array<Omit<PiezaImportada, 'slotIndex'>>>()
  for (const pieza of piezas) {
    const lista = porMes.get(pieza.mes)
    if (lista) lista.push(pieza)
    else porMes.set(pieza.mes, [pieza])
  }

  const salida: PiezaImportada[] = []
  for (const lista of porMes.values()) {
    lista
      .slice()
      .sort((a, b) => {
        const fa = a.publishAt?.slice(0, 10) ?? a.dueDate ?? ''
        const fb = b.publishAt?.slice(0, 10) ?? b.dueDate ?? ''
        return fa === fb ? a.linea - b.linea : fa < fb ? -1 : 1
      })
      .forEach((pieza, i) => salida.push({ ...pieza, slotIndex: i }))
  }

  return salida.sort((a, b) => a.linea - b.linea)
}

/**
 * Los sprints se crean por NOMBRE, y su rango sale de las piezas que cuelgan de
 * ellos.
 *
 * La relación de Notion solo exporta el título de la página relacionada: las
 * fechas del sprint viven en la otra base, que no estamos importando.
 * `public.sprints` exige `starts_on` y `ends_on`, así que se derivan del
 * trabajo asignado. Es una aproximación y la vista previa la muestra para que
 * se pueda corregir después.
 */
function derivarSprints(piezas: readonly PiezaImportada[]): SprintDetectado[] {
  const mapa = new Map<string, { inicia: string; termina: string; piezas: number }>()

  for (const pieza of piezas) {
    if (pieza.sprint === null) continue
    const fecha = pieza.publishAt?.slice(0, 10) ?? pieza.dueDate
    if (fecha === null || fecha === undefined) continue

    const actual = mapa.get(pieza.sprint)
    if (!actual) {
      mapa.set(pieza.sprint, { inicia: fecha, termina: fecha, piezas: 1 })
      continue
    }
    if (fecha < actual.inicia) actual.inicia = fecha
    if (fecha > actual.termina) actual.termina = fecha
    actual.piezas += 1
  }

  return [...mapa.entries()]
    .map(([nombre, datos]) => ({ nombre, ...datos }))
    .sort((a, b) => a.inicia.localeCompare(b.inicia) || a.nombre.localeCompare(b.nombre, 'es-MX'))
}

/* ========================================================================== */
/*  Resumen de una línea                                                       */
/* ========================================================================== */

export function resumenDelPlan(plan: PlanDeImportacion): string {
  const n = plan.errores.length

  if (n > 0) {
    return n === 1
      ? 'Un renglón no se pudo mapear. Nada se importa hasta que quede arreglado: media importación se ve igual que una completa.'
      : `${n} renglones no se pudieron mapear. Nada se importa hasta que queden arreglados: media importación se ve igual que una completa.`
  }

  if (!plan.ok) {
    // Sin errores y sin nada que traer: o el pegado viene vacío, o todos los
    // renglones están rechazados en Notion. Son dos remedios distintos.
    return plan.omitidas.length > 0
      ? `Los ${plan.omitidas.length} renglones están rechazados en Notion, así que no hay nada que traer.`
      : 'No hay nada que importar todavía. Pega el CSV que exportaste de Notion.'
  }

  const partes: string[] = []
  partes.push(`${plan.piezas.length} ${plan.piezas.length === 1 ? 'pieza' : 'piezas'}`)
  if (plan.stories.length > 0) {
    partes.push(`${plan.stories.length} ${plan.stories.length === 1 ? 'story' : 'stories'}`)
  }
  if (plan.sprints.length > 0) {
    partes.push(`${plan.sprints.length} ${plan.sprints.length === 1 ? 'sprint' : 'sprints'}`)
  }

  return `Listo para importar: ${partes.join(', ')}.`
}
