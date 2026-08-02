import type { Platform } from '@/domain/labels'
import type { Database } from '@/lib/supabase/database.types'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Reglas del radar de tendencias y de las fechas clave. Puras, sin IO.
 *
 * La división que este archivo protege: **el agente no descubre la tendencia**.
 * No existe una API limpia de audios en tendencia de TikTok ni de Instagram, y
 * el scraping que la simula se rompe solo. Ana registra en el radar lo que ve
 * corriendo; el Guionista lo traduce a guion. Por eso aquí hay un cálculo de
 * momentum a partir de la fecha en que ELLA la vio, y no un "descubridor".
 *
 * El fit de marca de este archivo es la estimación de captura: sirve para
 * ordenar el radar y para decidir qué vale la pena mandarle al Guionista. El
 * fit definitivo —el que se le enseña al cliente— lo escribe el Guionista junto
 * con el guion, porque solo ahí existe la pieza concreta que se va a grabar.
 */

type Tablas = Database['public']['Tables']

export type TrendKind = Tablas['trends']['Row']['kind']
export type TrendMomentum = Tablas['trends']['Row']['momentum']
export type KeyDateKind = Tablas['key_dates']['Row']['kind']
export type ScriptStatus = Tablas['scripts']['Row']['status']

/* -------------------------------------------------------------------------- */
/*  Etiquetas                                                                  */
/*                                                                             */
/*  Los enums de Postgres van sin acento ni eñe (`promocion`). Eso jamás llega */
/*  a la pantalla. Los `Record` son exhaustivos: agregar un valor al enum sin  */
/*  etiquetarlo no compila.                                                    */
/* -------------------------------------------------------------------------- */

export const TREND_KIND_LABEL: Record<TrendKind, string> = {
  audio: 'Audio',
  formato: 'Formato',
  reto: 'Reto',
  tema: 'Tema',
}

export const TREND_MOMENTUM_LABEL: Record<TrendMomentum, string> = {
  subiendo: 'En subida',
  pico: 'En pico',
  bajando: 'Bajando',
}

export const KEY_DATE_KIND_LABEL: Record<KeyDateKind, string> = {
  festividad: 'Festividad',
  aniversario: 'Aniversario',
  evento: 'Evento',
  // El enum va sin acento; la pantalla no.
  promocion: 'Promoción',
  temporada: 'Temporada',
}

export const SCRIPT_STATUS_LABEL: Record<ScriptStatus, string> = {
  propuesto: 'Propuesto',
  aceptado: 'Aceptado',
  editado: 'Editado',
  descartado: 'Descartado',
}

/**
 * El orden en que se ofrecen en los formularios. Tuplas escritas a mano y no
 * `Object.keys` de los Record de arriba: el orden de un select es una decisión
 * de diseño, y `Object.keys` devuelve `string[]`, que no sirve como enum.
 */
export const TREND_KINDS = [
  'audio',
  'formato',
  'reto',
  'tema',
] as const satisfies readonly TrendKind[]

export const KEY_DATE_KINDS = [
  'festividad',
  'aniversario',
  'evento',
  'promocion',
  'temporada',
] as const satisfies readonly KeyDateKind[]

export const PLATAFORMAS = [
  'instagram',
  'tiktok',
  'facebook',
  'linkedin',
] as const satisfies readonly Platform[]

/* -------------------------------------------------------------------------- */
/*  Fechas                                                                     */
/* -------------------------------------------------------------------------- */

const DIA_MS = 86_400_000

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const

/**
 * Días completos entre dos fechas `AAAA-MM-DD`.
 *
 * Compara en UTC a propósito. Las dos fechas ya vienen resueltas al día
 * calendario de la zona del estudio, y volver a aplicarles huso es justo lo que
 * produce el clásico "hace 1 día" a las once de la noche.
 */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`)
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`Fecha inválida al medir días: "${desde}" → "${hasta}".`)
  }
  return Math.round((b - a) / DIA_MS)
}

/** `2026-09-14` → `{ dia: '14', mes: 'sep', anio: '2026' }`, sin construir un Date. */
export function partesDeFecha(fecha: string): { dia: string; mes: string; anio: string } {
  const [anio = '', mes = '', dia = ''] = fecha.slice(0, 10).split('-')
  return {
    dia,
    mes: MESES_CORTOS[Number(mes) - 1] ?? mes,
    anio,
  }
}

/** El mes de una fecha `AAAA-MM-DD`, en el mismo formato que usa el planner. */
export function mesDeFecha(fecha: string): MonthKey {
  return fecha.slice(0, 7) as MonthKey
}

export function ultimoDiaDelMes(mes: MonthKey): string {
  const [anio, numero] = mes.split('-')
  // Día 0 del mes siguiente = último día de este mes.
  const dias = new Date(Date.UTC(Number(anio), Number(numero), 0)).getUTCDate()
  return `${mes}-${String(dias).padStart(2, '0')}`
}

/** El rango de fechas que cubre el timeline. Sirve para acotar la consulta. */
export function rangoDeMeses(
  mesInicial: MonthKey,
  cantidadMeses: number,
): { desde: string; hasta: string } {
  const ultimo = addMonths(mesInicial, Math.max(1, cantidadMeses) - 1)
  return { desde: `${mesInicial}-01`, hasta: ultimoDiaDelMes(ultimo) }
}

/* -------------------------------------------------------------------------- */
/*  Momentum                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Después de tres semanas una tendencia ya pasó por todas las cuentas del giro.
 * Sumarse ahí no es sumarse: es llegar tarde y que se note.
 */
export const VENTANA_TENDENCIA_DIAS = 21

const PESO_BASE: Record<TrendMomentum, number> = {
  subiendo: 1,
  pico: 0.7,
  bajando: 0.35,
}

/**
 * La frase que va en mono junto a la tendencia: "en subida desde hace 9 días".
 *
 * El momentum lo declara quien la registró; los días salen de la fecha en que
 * la vio. Esa fecha es el único dato duro que tenemos, y por eso se muestra.
 */
export function describirMomentum(momentum: TrendMomentum, vistaEl: string, hoy: string): string {
  const dias = Math.max(0, diasEntre(vistaEl, hoy))
  const verbo =
    momentum === 'subiendo' ? 'en subida' : momentum === 'pico' ? 'en pico' : 'de bajada'

  if (dias === 0) return `${verbo}, la viste hoy`
  if (dias === 1) return `${verbo} desde ayer`
  return `${verbo} desde hace ${dias} días`
}

/**
 * Qué tan viva está la tendencia, de 0 a 1. Alimenta la barra hairline del radar.
 *
 * Es momentum declarado por frescura: una tendencia "en subida" que se vio hace
 * seis semanas no está en subida, está sin actualizar. El decaimiento hace
 * visible esa diferencia sin obligar a nadie a re-capturarla.
 */
export function pesoMomentum(momentum: TrendMomentum, dias: number): number {
  const frescura = Math.max(0.1, 1 - Math.max(0, dias) / (VENTANA_TENDENCIA_DIAS * 2))
  return Number((PESO_BASE[momentum] * frescura).toFixed(4))
}

export function estaFria(vistaEl: string, hoy: string): boolean {
  return diasEntre(vistaEl, hoy) > VENTANA_TENDENCIA_DIAS
}

export interface TendenciaOrdenable {
  momentum: TrendMomentum
  /** `AAAA-MM-DD` en la zona del estudio. */
  vistaEl: string
  titulo: string
}

/**
 * El radar se lee de arriba hacia abajo y se actúa sobre los primeros tres
 * renglones. Por eso arriba va lo que todavía se puede alcanzar, no lo último
 * capturado: ordenar por fecha de captura pondría hasta arriba una tendencia
 * moribunda solo porque alguien la anotó ayer.
 */
export function ordenarTendencias<T extends TendenciaOrdenable>(
  tendencias: readonly T[],
  hoy: string,
): T[] {
  return [...tendencias].sort((a, b) => {
    const pesoA = pesoMomentum(a.momentum, diasEntre(a.vistaEl, hoy))
    const pesoB = pesoMomentum(b.momentum, diasEntre(b.vistaEl, hoy))
    if (pesoA !== pesoB) return pesoB - pesoA
    if (a.vistaEl !== b.vistaEl) return b.vistaEl.localeCompare(a.vistaEl)
    return a.titulo.localeCompare(b.titulo, 'es')
  })
}

/* -------------------------------------------------------------------------- */
/*  Fit de marca                                                               */
/* -------------------------------------------------------------------------- */

export interface EntradaFit {
  titulo: string
  notas?: string | null
  tipo: TrendKind
  momentum: TrendMomentum
  /** Días desde que se vio. */
  dias: number
}

export interface Fit {
  score: number
  razon: string
}

const BASE_POR_TIPO: Record<TrendKind, number> = {
  formato: 72,
  audio: 66,
  tema: 60,
  // Un reto pide cara al frente y coreografía. Es lo más caro de sostener en
  // marca y lo primero que un cliente rechaza.
  reto: 48,
}

const RAZON_POR_TIPO: Record<TrendKind, string> = {
  formato: 'El formato se resuelve con el espacio y la luz, no con alguien hablando a cámara.',
  audio: 'El audio marca el ritmo del corte y no obliga a escribir voz en off.',
  reto: 'Los retos piden cara al frente y coreografía, que es lo más caro de sostener en marca.',
  tema: 'Es un ángulo, no un formato: se adapta a lo que ya se graba.',
}

const RAZON_POR_MOMENTUM: Record<TrendMomentum, string> = {
  subiendo: 'Va en subida, todavía alcanza a montarse.',
  pico: 'Está en su pico: sale esta semana o no sale.',
  bajando: 'Va de bajada y llegar tarde a una tendencia se nota más que no llegar.',
}

/** Palabras que no distinguen nada y ensucian el empate con los pilares. */
const VACIAS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'con',
  'sin',
  'para',
  'por',
  'que',
  'del',
  'una',
  'uno',
  'and',
  'the',
  'en',
  'al',
  'lo',
  'un',
])

function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !VACIAS.has(w))
}

/**
 * La estimación de captura, 0–100.
 *
 * Deterministica y por código, no por modelo: es un número que se usa para
 * ordenar una tabla y decidir a qué tendencia se le invierte una corrida del
 * Guionista. Un modelo daría un número distinto cada vez para la misma entrada,
 * y entonces el orden del radar cambiaría solo.
 *
 * El fit ES POR CLIENTE aunque el radar sea de la org: la misma tendencia le
 * queda a un bar y no le queda a un despacho contable. Por eso recibe los
 * pilares del cliente.
 */
export function calcularFitDeMarca(entrada: EntradaFit, pilares: readonly string[]): Fit {
  const motivos: string[] = [RAZON_POR_TIPO[entrada.tipo], RAZON_POR_MOMENTUM[entrada.momentum]]

  let score = BASE_POR_TIPO[entrada.tipo]
  score += entrada.momentum === 'subiendo' ? 14 : entrada.momentum === 'pico' ? 4 : -12

  // La antigüedad castiga por semanas cumplidas, no por día: un día más no
  // cambia nada real y un número que se mueve solo deja de creerse.
  const semanas = Math.floor(Math.max(0, entrada.dias) / 7)
  score -= Math.min(20, semanas * 5)

  const texto = palabras(`${entrada.titulo} ${entrada.notas ?? ''}`)
  const pilarQueEmpata = pilares.find((pilar) =>
    palabras(pilar).some((palabra) => texto.includes(palabra)),
  )
  if (pilarQueEmpata) {
    score += 10
    motivos.push(`Empata con tu pilar "${pilarQueEmpata}".`)
  }

  if (entrada.dias > VENTANA_TENDENCIA_DIAS) {
    motivos.push(`Ya se enfrió: llevas ${entrada.dias} días sin actualizarla.`)
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    razon: motivos.join(' '),
  }
}

/* -------------------------------------------------------------------------- */
/*  Fechas clave                                                               */
/* -------------------------------------------------------------------------- */

export interface FechaOrdenable {
  fecha: string
  titulo: string
}

export function ordenarFechasClave<T extends FechaOrdenable>(fechas: readonly T[]): T[] {
  return [...fechas].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.titulo.localeCompare(b.titulo, 'es')
  })
}

export interface MesDelTimeline<T> {
  mes: MonthKey
  items: T[]
}

/**
 * Agrupa lo fechado en exactamente `cantidadMeses` columnas a partir de
 * `mesInicial`, **incluyendo los meses vacíos**.
 *
 * Los meses vacíos son la mitad del valor del timeline: un diciembre en blanco
 * es lo que dispara la conversación de la campaña navideña. Un `groupBy` normal
 * los desaparecería justo cuando más importan.
 *
 * El cruce de año lo resuelve `addMonths`, no aritmética de strings: `2026-11`
 * más dos es `2027-01`, y sumarle 2 al "11" da un mes 13 que no existe.
 */
export function agruparPorMes<T>(
  items: readonly T[],
  fechaDe: (item: T) => string,
  mesInicial: MonthKey,
  cantidadMeses = 6,
): MesDelTimeline<T>[] {
  const columnas: MesDelTimeline<T>[] = []
  const porMes = new Map<MonthKey, T[]>()

  for (let i = 0; i < Math.max(1, cantidadMeses); i++) {
    const mes = addMonths(mesInicial, i)
    const items: T[] = []
    columnas.push({ mes, items })
    porMes.set(mes, items)
  }

  for (const item of items) {
    // Lo que cae fuera de la ventana se descarta en silencio: el timeline
    // muestra seis meses y meter ahí una fecha de hace un año la haría ver
    // como si perteneciera al primer mes.
    porMes.get(mesDeFecha(fechaDe(item)))?.push(item)
  }

  for (const columna of columnas) {
    columna.items.sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)))
  }

  return columnas
}

/* -------------------------------------------------------------------------- */
/*  Propuestas de campaña                                                      */
/* -------------------------------------------------------------------------- */

export interface PropuestaFechaClave {
  fecha: string
  titulo: string
  tipo: KeyDateKind
  ideaCampana: string
}

type PlantillaFecha = Omit<PropuestaFechaClave, 'fecha'> & { dia: number }

/**
 * El calendario que un bar de Tijuana ya sabe de memoria, escrito para que no
 * se le olvide a nadie en enero.
 *
 * Es una propuesta, no un calendario oficial: se muestra como sugerencia y solo
 * entra a la base cuando una persona la agrega. Las fechas móviles (Semana
 * Santa, Día del Padre) no están aquí a propósito — una fecha equivocada en el
 * calendario del cliente cuesta más que una fecha faltante.
 */
const PLANTILLAS_POR_MES: Record<number, readonly PlantillaFecha[]> = {
  1: [
    {
      dia: 6,
      titulo: 'Día de Reyes',
      tipo: 'festividad',
      ideaCampana: 'Rosca y coctel caliente en la barra, un solo turno.',
    },
    {
      dia: 20,
      titulo: 'Cuesta de enero',
      tipo: 'temporada',
      ideaCampana: 'Clásicos a precio de barra de martes a jueves, sin anunciarlo como descuento.',
    },
  ],
  2: [
    {
      dia: 14,
      titulo: 'San Valentín',
      tipo: 'festividad',
      ideaCampana:
        'Dos tiempos con coctel de autor y dos turnos de reserva. Se agota, no se rebaja.',
    },
    {
      dia: 24,
      titulo: 'Fin de mes en barra',
      tipo: 'promocion',
      ideaCampana: 'After office de jueves con carta corta.',
    },
  ],
  3: [
    {
      dia: 8,
      titulo: 'Día de la mujer',
      tipo: 'festividad',
      ideaCampana: 'Barra invitada de mixólogas de la ciudad.',
    },
    {
      dia: 21,
      titulo: 'Entrada de primavera',
      tipo: 'temporada',
      ideaCampana: 'Carta de temporada con cítricos de Baja.',
    },
  ],
  4: [
    {
      dia: 5,
      titulo: 'Temporada de terraza',
      tipo: 'temporada',
      ideaCampana: 'Serie de reels de la hora dorada en la terraza.',
    },
    {
      dia: 24,
      titulo: 'Cierre de mes',
      tipo: 'promocion',
      ideaCampana: 'After office con dos cocteles de la casa.',
    },
  ],
  5: [
    {
      dia: 5,
      titulo: 'Batalla de Puebla',
      tipo: 'festividad',
      ideaCampana: 'Noche de destilados mexicanos con maridaje corto.',
    },
    {
      dia: 10,
      titulo: 'Día de las madres',
      tipo: 'festividad',
      ideaCampana: 'Comida larga con coctelería ligera y reserva por teléfono.',
    },
  ],
  6: [
    {
      dia: 21,
      titulo: 'Solsticio de verano',
      tipo: 'temporada',
      ideaCampana: 'Carta fría y hielo tallado, con contenido de detrás de la barra.',
    },
    {
      dia: 28,
      titulo: 'Cierre de primer semestre',
      tipo: 'promocion',
      ideaCampana: 'Semana de los cocteles más pedidos del semestre.',
    },
  ],
  7: [
    {
      dia: 12,
      titulo: 'Temporada de calor',
      tipo: 'temporada',
      ideaCampana: 'Coctelería fría, highballs y una serie de tres reels de hielo.',
    },
    {
      dia: 26,
      titulo: 'Turistas de verano',
      tipo: 'temporada',
      ideaCampana: 'Contenido en inglés y español para el tráfico de San Diego.',
    },
  ],
  8: [
    {
      dia: 16,
      titulo: 'Regreso a clases',
      tipo: 'promocion',
      ideaCampana: 'After office de lunes a miércoles para el turno de oficina.',
    },
    {
      dia: 30,
      titulo: 'Fin de verano',
      tipo: 'temporada',
      ideaCampana: 'Cierre de la carta de verano, con cuenta regresiva en stories.',
    },
  ],
  9: [
    {
      dia: 15,
      titulo: 'Fiestas patrias',
      tipo: 'festividad',
      ideaCampana: 'Carta corta de mezcal con maridaje y horario extendido.',
    },
    {
      dia: 28,
      titulo: 'Noche de mezcal',
      tipo: 'evento',
      ideaCampana: 'Cata guiada de tres mezcales con cupo limitado.',
    },
  ],
  10: [
    {
      dia: 12,
      titulo: 'Temporada de destilados oscuros',
      tipo: 'temporada',
      ideaCampana: 'Whisky y ron en carta, con carrusel educativo por semana.',
    },
    {
      dia: 31,
      titulo: 'Noche de disfraces',
      tipo: 'evento',
      ideaCampana: 'Concurso con jurado de la barra y coctel de edición.',
    },
  ],
  11: [
    {
      dia: 2,
      titulo: 'Día de Muertos',
      tipo: 'festividad',
      ideaCampana: 'Altar en la barra y coctel de temporada. Reel de montaje del altar.',
    },
    {
      dia: 20,
      titulo: 'Buen Fin',
      tipo: 'promocion',
      ideaCampana: 'Dos por uno de martes a jueves, solo en consumo de barra.',
    },
  ],
  12: [
    {
      dia: 12,
      titulo: 'Posadas de oficina',
      tipo: 'promocion',
      ideaCampana: 'Paquete de grupo con reserva anticipada y menú fijo.',
    },
    {
      dia: 31,
      titulo: 'Fin de año',
      tipo: 'evento',
      ideaCampana: 'Cena y brindis con boleto por adelantado.',
    },
  ],
}

/** El segundo jueves del mes. La noche de jazz cae ahí todos los meses. */
export function segundoJueves(mes: MonthKey): string {
  const [anio, numero] = mes.split('-')
  const primero = new Date(Date.UTC(Number(anio), Number(numero) - 1, 1))
  // 4 = jueves. Del primer día del mes al primer jueves, y de ahí una semana.
  const desplazamiento = (4 - primero.getUTCDay() + 7) % 7
  const dia = 1 + desplazamiento + 7
  return `${mes}-${String(dia).padStart(2, '0')}`
}

/**
 * Las 2–3 campañas que el Estratega propone para un mes vacío.
 *
 * Devuelve propuestas, no renglones de la base. El agente propone y la persona
 * ejecuta: cada una entra al calendario solo si alguien la agrega.
 */
export function proponerFechasClave(mes: MonthKey): PropuestaFechaClave[] {
  const numero = Number(mes.split('-')[1])
  const plantillas = PLANTILLAS_POR_MES[numero] ?? []

  const propuestas: PropuestaFechaClave[] = plantillas.map(({ dia, ...resto }) => ({
    ...resto,
    fecha: `${mes}-${String(dia).padStart(2, '0')}`,
  }))

  propuestas.push({
    fecha: segundoJueves(mes),
    titulo: 'Noche de jazz',
    tipo: 'evento',
    ideaCampana: 'Trío invitado, tres stories el día del evento y un reel del cierre.',
  })

  return ordenarFechasClave(propuestas)
}
