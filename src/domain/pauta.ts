import type { Database } from '@/lib/supabase/database.types'

/**
 * Reglas de la sección Pauta: dinero, comparación entre ad sets y lectura de
 * CSV. Todo puro, sin IO y sin React — es lo que se prueba.
 *
 * Dos ideas atraviesan el archivo:
 *
 *   1. **El dinero es un entero de centavos.** Nunca entra ni sale un float.
 *      Formatear divide entre 100 con aritmética entera; leer un CSV parte la
 *      cadena en el punto decimal en vez de confiar en parseFloat. Una campaña
 *      de $2,000 que se vuelve 1999.9999999 es una discusión con el cliente
 *      que no se puede ganar.
 *   2. **"Mejor" no significa lo mismo en todas las métricas.** CTR alto es
 *      bueno; costo por resultado alto es malo. Resaltar el máximo en las dos
 *      pintaría de accent justo el peor ad set, y esa tabla se lee de un
 *      vistazo para decidir a dónde mover dinero.
 */

type Tablas = Database['public']['Tables']

export type PlataformaAds = Tablas['campaigns']['Row']['platform']
export type EstadoCampana = Tablas['campaigns']['Row']['status']
export type TipoPublico = Tablas['ad_sets']['Row']['audience_type']
export type EstadoAdSet = Tablas['ad_sets']['Row']['status']
export type EstadoCreativo = Tablas['ad_creatives']['Row']['status']
export type TipoPropuesta = Tablas['ad_proposals']['Row']['kind']
export type EstadoPropuesta = Tablas['ad_proposals']['Row']['status']

/* ==========================================================================
   Etiquetas

   Los enums de la base van sin acentos porque viajan a la URL y al CSV. Nada
   de eso llega a la pantalla tal cual.
   ========================================================================== */

/**
 * El chip de plataforma que se pinta en la tarjeta.
 *
 * Instagram y Facebook colapsan a META a propósito: en el ads manager son una
 * sola cuenta y un solo presupuesto, y decir "INSTAGRAM" cuando el anuncio
 * corrió en las dos redes es una media verdad que confunde al capturar.
 */
export const CHIP_PLATAFORMA: Record<PlataformaAds, string> = {
  instagram: 'META',
  facebook: 'META',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
}

export const CAMPANA_ESTADO_LABEL: Record<EstadoCampana, string> = {
  borrador: 'Borrador',
  activa: 'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
}

export const PUBLICO_LABEL: Record<TipoPublico, string> = {
  interes: 'Interés',
  similares: 'Similares',
  retargeting: 'Retargeting',
  amplio: 'Amplio',
  personalizado: 'Personalizado',
}

export const AD_SET_ESTADO_LABEL: Record<EstadoAdSet, string> = {
  activo: 'Activo',
  pausado: 'Pausado',
  cerrado: 'Cerrado',
}

export const CREATIVO_ESTADO_LABEL: Record<EstadoCreativo, string> = {
  propuesto: 'Propuesto',
  activo: 'Activo',
  pausado: 'Pausado',
}

/** Todos son verbos que se ejecutan EN EL ADS MANAGER, no en esta app. */
export const PROPUESTA_TIPO_LABEL: Record<TipoPropuesta, string> = {
  pausar: 'Pausar',
  reactivar: 'Reactivar',
  mover_presupuesto: 'Mover presupuesto',
  subir_presupuesto: 'Subir presupuesto',
  bajar_presupuesto: 'Bajar presupuesto',
  cambiar_creativo: 'Cambiar creativo',
  cambiar_publico: 'Cambiar público',
  extender: 'Extender',
  cerrar: 'Cerrar',
}

/**
 * "Por aplicar" y no "Aprobada" a propósito.
 *
 * Aprobar en esta app no cambió nada en Meta. El estado que se le enseña a la
 * persona tiene que nombrar el trabajo que le queda pendiente, no el trámite
 * que ya hizo.
 */
export const PROPUESTA_ESTADO_LABEL: Record<EstadoPropuesta, string> = {
  propuesta: 'Sin decidir',
  aprobada: 'Por aplicar',
  aprobada_alternativa: 'Por aplicar · alternativa',
  rechazada: 'Rechazada',
  aplicada: 'Aplicada',
}

/** Los estados en los que hay trabajo pendiente en el ads manager. */
export function estaPorAplicar(estado: EstadoPropuesta): boolean {
  return estado === 'aprobada' || estado === 'aprobada_alternativa'
}

/* ==========================================================================
   Dinero
   ========================================================================== */

const AGRUPADOR = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })

/**
 * Centavos enteros → "$1,440" / "$1,440.50".
 *
 * Divide con `Math.trunc` y `%` en vez de `cents / 100`: la división en punto
 * flotante de un entero grande puede devolver 1440.0000000000002, y eso se
 * cuela al `toFixed` como un centavo que nadie gastó.
 *
 * Los pesos redondos se muestran sin decimales porque la sección está llena de
 * cifras y ".00" repetido veinte veces es ruido; los centavos sí se muestran
 * cuando existen, porque un CPC de $8.40 sin decimales sería $8.
 */
export function formatearPesos(centavos: number): string {
  const entero = Math.trunc(centavos)
  const signo = entero < 0 ? '-' : ''
  const abs = Math.abs(entero)
  const pesos = Math.trunc(abs / 100)
  const resto = abs % 100

  const cuerpo = AGRUPADOR.format(pesos)
  return resto === 0 ? `${signo}$${cuerpo}` : `${signo}$${cuerpo}.${String(resto).padStart(2, '0')}`
}

export function formatearEntero(valor: number): string {
  return AGRUPADOR.format(Math.trunc(valor))
}

/**
 * "1,440.50" → 144050 centavos.
 *
 * Devuelve `null` si el texto no es un monto: quien llama decide si eso es un
 * error de captura o un renglón de CSV que se salta.
 *
 * Nunca pasa por `parseFloat`. Se parte en el punto decimal y se hace
 * aritmética entera, que es la única forma de que $12.35 sean 1235 centavos
 * exactos y no 1234.9999999999998.
 */
export function pesosACentavos(texto: string): number | null {
  const limpio = texto
    .trim()
    // Símbolos de moneda, espacios finos y separadores de millar. El CSV de
    // Meta en español trae "$1,234.56" y el de TikTok "1234.56".
    .replaceAll(/[$\s\u00a0\u202f]/g, '')
    .replaceAll(',', '')

  if (limpio === '') return null

  const match = /^(-?)(\d*)(?:\.(\d{1,2}))?$/.exec(limpio)
  if (!match) return null

  const [, signo, enteros, decimales] = match
  if (!enteros && !decimales) return null

  const pesos = Number(enteros || '0')
  const centavos = Number((decimales ?? '').padEnd(2, '0') || '0')
  const total = pesos * 100 + centavos

  return signo === '-' ? -total : total
}

/* ==========================================================================
   Tiempo de campaña
   ========================================================================== */

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/

/** Medianoche UTC de una fecha `AAAA-MM-DD`. Acepta un ISO completo y lo recorta. */
function comoDiaUtc(fecha: string): number {
  const m = SOLO_FECHA.exec(fecha)
  if (!m) throw new Error(`Fecha inválida: "${fecha}". Se espera AAAA-MM-DD.`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

const DIA_MS = 86_400_000

/** Días de calendario entre dos fechas. Positivo si `hasta` es posterior. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((comoDiaUtc(hasta) - comoDiaUtc(desde)) / DIA_MS)
}

/**
 * Días que le quedan a la campaña, contando desde hoy.
 *
 * El día del cierre vale 0: ese día la campaña ya está corriendo su último
 * tramo y no queda ninguna jornada completa por delante para reaccionar. Una
 * campaña vencida devuelve 0 y no un número negativo — "quedan −3 días" no
 * significa nada en la tarjeta.
 */
export function diasRestantes(hoy: string, fin: string): number {
  return Math.max(0, diasEntre(hoy, fin))
}

export interface DiaDeCampana {
  dia: number
  total: number
}

/**
 * "DÍA 4 DE 7". El primer día de la campaña es el día 1, no el 0.
 *
 * Se acota a los extremos: una propuesta escrita antes de arrancar dice día 1
 * y una escrita después del cierre dice el último día. Es preferible a
 * enseñar "día 9 de 7", que se lee como un bug.
 */
export function diaDeCampana(fecha: string, inicio: string, fin: string): DiaDeCampana {
  const total = Math.max(1, diasEntre(inicio, fin) + 1)
  const dia = Math.min(total, Math.max(1, diasEntre(inicio, fecha) + 1))
  return { dia, total }
}

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
 * "26 jul – 8 ago" a partir de dos columnas `date`.
 *
 * Se formatea a mano y NO con `@/lib/time`, que trabaja en la zona del
 * estudio. Una columna `date` de Postgres llega como '2026-08-08' y se parsea
 * como medianoche UTC; convertida a America/Tijuana se vuelve el 7 de agosto.
 * La fecha de cierre de una campaña no puede moverse un día por la zona
 * horaria del servidor.
 */
export function formatearDia(fecha: string): string {
  const m = SOLO_FECHA.exec(fecha)
  if (!m) throw new Error(`Fecha inválida: "${fecha}". Se espera AAAA-MM-DD.`)
  const mes = MESES_CORTOS[Number(m[2]) - 1] ?? m[2]
  return `${Number(m[3])} ${mes}`
}

export function formatearRango(inicio: string, fin: string): string {
  return `${formatearDia(inicio)} – ${formatearDia(fin)}`
}

/* ==========================================================================
   Presupuesto
   ========================================================================== */

/**
 * Porcentaje gastado, 0–100+.
 *
 * Un total de 0 devuelve 0 y no NaN ni Infinity: una campaña en borrador sin
 * presupuesto capturado no debe pintar una barra rota ni un "NaN%".
 *
 * El resultado NO se acota a 100. Si la campaña se pasó del presupuesto eso es
 * un dato real y urgente; taparlo detrás de un 100% redondo es justo el número
 * que no hay que esconder. La barra sí se acota, porque no puede dibujar más
 * ancho que ella misma.
 */
export function pctPresupuestoGastado(gastadoCents: number, totalCents: number): number {
  if (totalCents <= 0) return 0
  return Math.round((gastadoCents / totalCents) * 100)
}

/* ==========================================================================
   Métricas
   ========================================================================== */

export type ClaveMetrica =
  | 'gasto'
  | 'impresiones'
  | 'alcance'
  | 'clics'
  | 'ctr'
  | 'cpm'
  | 'cpc'
  | 'resultados'
  | 'costoPorResultado'

/** Hacia dónde está lo bueno en esta métrica. */
export type Direccion = 'alto' | 'bajo' | 'ninguna'

export type FormatoMetrica = 'dinero' | 'entero' | 'porcentaje'

export interface DefinicionMetrica {
  clave: ClaveMetrica
  label: string
  mejor: Direccion
  formato: FormatoMetrica
}

/**
 * Las nueve métricas de la tabla comparativa, en el orden en que se leen.
 *
 * `gasto` es la única sin dirección. Gastar más no es mejor ni peor: es el
 * presupuesto que se le asignó al ad set. Resaltarlo en accent le diría a
 * quien lee "este ad set va ganando" cuando lo único que dice es que ahí se
 * puso más dinero.
 */
export const METRICAS: readonly DefinicionMetrica[] = [
  { clave: 'gasto', label: 'Gasto', mejor: 'ninguna', formato: 'dinero' },
  { clave: 'impresiones', label: 'Impresiones', mejor: 'alto', formato: 'entero' },
  { clave: 'alcance', label: 'Alcance', mejor: 'alto', formato: 'entero' },
  { clave: 'clics', label: 'Clics', mejor: 'alto', formato: 'entero' },
  { clave: 'ctr', label: 'CTR', mejor: 'alto', formato: 'porcentaje' },
  { clave: 'cpm', label: 'CPM', mejor: 'bajo', formato: 'dinero' },
  { clave: 'cpc', label: 'CPC', mejor: 'bajo', formato: 'dinero' },
  { clave: 'resultados', label: 'Resultados', mejor: 'alto', formato: 'entero' },
  // La trampa del tablero: aquí lo bueno es el número CHICO.
  { clave: 'costoPorResultado', label: 'Costo por resultado', mejor: 'bajo', formato: 'dinero' },
]

export const METRICA_POR_CLAVE: Record<ClaveMetrica, DefinicionMetrica> = Object.fromEntries(
  METRICAS.map((m) => [m.clave, m]),
) as Record<ClaveMetrica, DefinicionMetrica>

/** Una fila de `ad_metrics`: un ad set, un día. */
export interface MetricaDiaria {
  fecha: string
  gastoCents: number
  impresiones: number
  alcance: number
  clics: number
  resultados: number
}

/** Totales de un ad set. Los derivados pueden ser `null`: no hay dato, no cero. */
export interface Totales {
  gastoCents: number
  impresiones: number
  alcance: number
  clics: number
  resultados: number
  ctr: number | null
  cpmCents: number | null
  cpcCents: number | null
  costoPorResultadoCents: number | null
  dias: number
}

/**
 * Suma los días de un ad set y **recalcula** las razones desde los totales.
 *
 * No promedia los CTR diarios. El promedio de siete porcentajes no es el
 * porcentaje de la semana salvo que los siete días tengan exactamente las
 * mismas impresiones, y nunca las tienen. El error es chico y por eso peligroso:
 * pasa el ojo, y luego el número de la app no cuadra con el del ads manager.
 *
 * Un derivado sin denominador queda en `null`, no en 0. Un costo por resultado
 * de $0 significaría "gratis", que es lo contrario de "todavía no hay ningún
 * resultado".
 */
export function totalizar(filas: readonly MetricaDiaria[]): Totales {
  let gastoCents = 0
  let impresiones = 0
  let alcance = 0
  let clics = 0
  let resultados = 0

  for (const f of filas) {
    gastoCents += f.gastoCents
    impresiones += f.impresiones
    // El alcance real no es aditivo —la misma persona cuenta una vez— pero el
    // ads manager tampoco lo desduplica entre días. Se suma como lo reporta la
    // fuente para que el número de la app cuadre con el de la plataforma.
    alcance += f.alcance
    clics += f.clics
    resultados += f.resultados
  }

  return {
    gastoCents,
    impresiones,
    alcance,
    clics,
    resultados,
    ctr: impresiones > 0 ? (clics * 100) / impresiones : null,
    cpmCents: impresiones > 0 ? Math.round((gastoCents * 1000) / impresiones) : null,
    cpcCents: clics > 0 ? Math.round(gastoCents / clics) : null,
    costoPorResultadoCents: resultados > 0 ? Math.round(gastoCents / resultados) : null,
    dias: filas.length,
  }
}

export function valorDeMetrica(totales: Totales, clave: ClaveMetrica): number | null {
  switch (clave) {
    case 'gasto':
      return totales.gastoCents
    case 'impresiones':
      return totales.impresiones
    case 'alcance':
      return totales.alcance
    case 'clics':
      return totales.clics
    case 'ctr':
      return totales.ctr
    case 'cpm':
      return totales.cpmCents
    case 'cpc':
      return totales.cpcCents
    case 'resultados':
      return totales.resultados
    case 'costoPorResultado':
      return totales.costoPorResultadoCents
  }
}

/**
 * El mejor valor de una métrica entre varios ad sets, o `null` si no hay
 * comparación que hacer.
 *
 * Devuelve `null` con menos de dos valores comparables. Con una sola columna
 * "el mejor" es trivialmente el único, y pintar toda la columna en accent no
 * informa nada: solo enseña a ignorar el color.
 */
export function mejorValor(
  clave: ClaveMetrica,
  valores: ReadonlyArray<number | null>,
): number | null {
  const direccion = METRICA_POR_CLAVE[clave].mejor
  if (direccion === 'ninguna') return null

  const comparables = valores.filter((v): v is number => v !== null && Number.isFinite(v))
  if (comparables.length < 2) return null

  return direccion === 'alto' ? Math.max(...comparables) : Math.min(...comparables)
}

/**
 * Si este valor merece el resalte en accent.
 *
 * Los empates se resaltan los dos. Fingir un ganador con un desempate
 * arbitrario sería peor: la lectura correcta de dos ad sets con el mismo CTR
 * es justamente que van iguales.
 */
export function esMejor(
  clave: ClaveMetrica,
  valor: number | null,
  valores: ReadonlyArray<number | null>,
): boolean {
  if (valor === null) return false
  const mejor = mejorValor(clave, valores)
  return mejor !== null && valor === mejor
}

export function formatearMetrica(clave: ClaveMetrica, valor: number | null): string {
  if (valor === null) return '—'
  switch (METRICA_POR_CLAVE[clave].formato) {
    case 'dinero':
      return formatearPesos(valor)
    case 'porcentaje':
      return `${valor.toFixed(2)} %`
    case 'entero':
      return formatearEntero(valor)
  }
}

/* ==========================================================================
   Serie para la gráfica
   ========================================================================== */

export interface SerieDiaria {
  adSetId: string
  nombre: string
  /** Alineada con `fechas`. `null` = ese día no hubo resultados, no hubo cero. */
  puntos: Array<number | null>
}

export interface SeriesCostoPorResultado {
  fechas: string[]
  series: SerieDiaria[]
  /** Techo del eje Y en centavos. 0 cuando no hay ningún punto. */
  maximoCents: number
}

/**
 * Costo por resultado por día, una serie por ad set, sobre un eje X común.
 *
 * El eje X es la unión de todas las fechas y no las de cada ad set: si B
 * empezó dos días después, sus dos primeros puntos tienen que quedar vacíos y
 * no correrse a la izquierda, que dibujaría dos curvas desfasadas y sugeriría
 * una comparación falsa.
 */
export function seriesCostoPorResultado(
  adSets: ReadonlyArray<{ id: string; nombre: string; diarias: readonly MetricaDiaria[] }>,
): SeriesCostoPorResultado {
  const fechas = [...new Set(adSets.flatMap((a) => a.diarias.map((d) => d.fecha)))].sort()

  let maximoCents = 0
  const series = adSets.map((adSet) => {
    const porFecha = new Map(adSet.diarias.map((d) => [d.fecha, d] as const))
    const puntos = fechas.map((fecha) => {
      const dia = porFecha.get(fecha)
      if (!dia || dia.resultados <= 0) return null
      const valor = Math.round(dia.gastoCents / dia.resultados)
      if (valor > maximoCents) maximoCents = valor
      return valor
    })
    return { adSetId: adSet.id, nombre: adSet.nombre, puntos }
  })

  return { fechas, series, maximoCents }
}

/* ==========================================================================
   CSV de Meta Ads / TikTok Ads
   ========================================================================== */

export type FuenteCsv = 'meta' | 'tiktok'

export const FUENTE_CSV_LABEL: Record<FuenteCsv, string> = {
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
}

export interface FilaCsvMetricas {
  /** Nombre del ad set tal como viene en el export. Se casa por nombre. */
  adSet: string
  fecha: string
  gastoCents: number
  impresiones: number
  alcance: number
  clics: number
  resultados: number
}

export interface ResultadoCsv {
  filas: FilaCsvMetricas[]
  /** Un renglón malo no tira la importación: se reporta y se sigue. */
  errores: string[]
}

/**
 * Encabezados que sabemos leer.
 *
 * Una sola tabla para Meta y TikTok, en inglés y en español. La alternativa
 * —un mapa por plataforma— se rompe en cuanto alguien exporta con el idioma de
 * la interfaz cambiado, que es lo que pasa siempre, y el mensaje de error
 * culpa a la plataforma equivocada.
 */
const ALIAS_COLUMNAS: Record<keyof FilaCsvMetricas, readonly string[]> = {
  adSet: [
    'ad set name',
    'ad set',
    'nombre del conjunto de anuncios',
    'conjunto de anuncios',
    'ad group name',
    'ad group',
    'grupo de anuncios',
  ],
  fecha: ['day', 'date', 'dia', 'fecha', 'reporting starts', 'by day', 'inicio del informe'],
  gastoCents: [
    'amount spent',
    'amount spent (mxn)',
    'importe gastado',
    'importe gastado (mxn)',
    'cost',
    'spend',
    'gasto',
    'costo',
  ],
  impresiones: ['impressions', 'impresiones'],
  alcance: ['reach', 'alcance'],
  clics: ['link clicks', 'clicks', 'clics', 'clics en el enlace', 'clics (todos)'],
  resultados: ['results', 'resultados', 'conversions', 'conversiones'],
}

/** Sin acentos, sin dobles espacios y en minúsculas: así se comparan los encabezados. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/**
 * Partidor de CSV que respeta comillas.
 *
 * `texto.split(',')` no sirve: el export de Meta trae nombres de ad set con
 * coma ("A · Interés, 25-45") y ese solo renglón corre todas las columnas de
 * lugar sin avisar.
 */
export function partirCsv(texto: string): string[][] {
  // Excel en Windows escribe un BOM al inicio siempre. Sin quitarlo, la primera
  // columna se llama "﻿Ad set name" y no empata con ningún alias — el
  // archivo se ve idéntico y la importación falla diciendo que no encuentra la
  // columna que sí está ahí.
  const limpio = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const separador = detectarSeparador(limpio)

  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]

    if (enComillas) {
      if (c === '"') {
        // "" adentro de comillas es una comilla literal.
        if (limpio[i + 1] === '"') {
          campo += '"'
          i++
        } else {
          enComillas = false
        }
      } else {
        campo += c
      }
      continue
    }

    if (c === '"') {
      enComillas = true
    } else if (c === separador) {
      fila.push(campo)
      campo = ''
    } else if (c === '\n' || c === '\r') {
      // \r\n cuenta como un solo salto.
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else {
      campo += c
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas.filter((f) => f.some((c) => c.trim() !== ''))
}

/**
 * Coma o punto y coma.
 *
 * Excel en español exporta con `;` y no con `,`, y un archivo que pasó por
 * Excel es la mitad de los que llegan. Se decide contando en el encabezado, no
 * en todo el texto: un nombre de ad set con punto y coma no debe poder cambiar
 * cómo se parte el archivo entero.
 */
function detectarSeparador(texto: string): string {
  const encabezado = texto.slice(0, texto.search(/[\r\n]/) + 1 || undefined)
  const comas = (encabezado.match(/,/g) ?? []).length
  const puntoYComa = (encabezado.match(/;/g) ?? []).length
  return puntoYComa > comas ? ';' : ','
}

function enteroDe(texto: string | undefined): number {
  if (!texto) return 0
  const limpio = texto.replaceAll(/[\s,\u00a0\u202f]/g, '')
  const n = Number(limpio)
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
}

/** El export trae la fecha como `2026-08-01` o `01/08/2026`. */
function fechaDe(texto: string | undefined): string | null {
  if (!texto) return null
  const t = texto.trim().slice(0, 10)
  if (SOLO_FECHA.test(t)) return t

  const barras = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  // Día/mes/año: es el orden de los exports en español, que son los que llegan.
  if (barras) return `${barras[3]}-${barras[2]}-${barras[1]}`

  return null
}

/**
 * Lee un export de Meta Ads o TikTok Ads y devuelve filas listas para validar.
 *
 * NO valida contra la base: no sabe si el ad set existe ni si la fecha cae
 * dentro de la campaña. Eso lo hace el Server Action, que sí tiene la base
 * enfrente. Aquí solo se resuelve la forma del archivo.
 */
export function parsearCsvDeAds(texto: string): ResultadoCsv {
  const filas = partirCsv(texto)
  const encabezado = filas[0]

  if (!encabezado) {
    return {
      filas: [],
      errores: ['El archivo está vacío. Exporta el reporte por día desde el ads manager.'],
    }
  }

  const columnas = encabezado.map(normalizar)
  const indice = (campo: keyof FilaCsvMetricas): number =>
    columnas.findIndex((c) => ALIAS_COLUMNAS[campo].includes(c))

  const iAdSet = indice('adSet')
  const iFecha = indice('fecha')

  if (iAdSet < 0 || iFecha < 0) {
    return {
      filas: [],
      errores: [
        'No se encontró la columna del ad set o la del día. Exporta el reporte desglosado por ' +
          'día y por conjunto de anuncios, sin cambiar los encabezados.',
      ],
    }
  }

  const iGasto = indice('gastoCents')
  const iImpresiones = indice('impresiones')
  const iAlcance = indice('alcance')
  const iClics = indice('clics')
  const iResultados = indice('resultados')

  const salida: FilaCsvMetricas[] = []
  const errores: string[] = []

  for (let n = 1; n < filas.length; n++) {
    const fila = filas[n]
    if (!fila) continue

    const adSet = (fila[iAdSet] ?? '').trim()
    const fecha = fechaDe(fila[iFecha])

    if (!adSet) {
      errores.push(`Renglón ${n + 1}: sin nombre de ad set.`)
      continue
    }
    if (!fecha) {
      errores.push(`Renglón ${n + 1}: la fecha "${fila[iFecha] ?? ''}" no se entiende.`)
      continue
    }

    const gastoCents = iGasto >= 0 ? (pesosACentavos(fila[iGasto] ?? '') ?? 0) : 0

    salida.push({
      adSet,
      fecha,
      gastoCents,
      impresiones: iImpresiones >= 0 ? enteroDe(fila[iImpresiones]) : 0,
      alcance: iAlcance >= 0 ? enteroDe(fila[iAlcance]) : 0,
      clics: iClics >= 0 ? enteroDe(fila[iClics]) : 0,
      resultados: iResultados >= 0 ? enteroDe(fila[iResultados]) : 0,
    })
  }

  if (salida.length === 0 && errores.length === 0) {
    errores.push('El archivo no trae ningún renglón de datos, solo encabezados.')
  }

  return { filas: salida, errores }
}

/* ==========================================================================
   Instrucciones para el ads manager
   ========================================================================== */

/**
 * Parte las instrucciones en pasos numerables.
 *
 * Un párrafo corrido de tres acciones se aplica mal: quien lo lee en el
 * celular con el ads manager abierto en la otra mano pierde el renglón y se
 * salta una. Se respetan los saltos de línea que haya escrito el Pautero y,
 * si vino todo en una sola línea, se corta por oración.
 */
export function pasosDeInstrucciones(texto: string): string[] {
  const porLinea = texto
    .split('\n')
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim())
    .filter((l) => l !== '')

  if (porLinea.length > 1) return porLinea

  const unaLinea = porLinea[0] ?? ''
  if (unaLinea === '') return []

  return unaLinea
    .split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/* ==========================================================================
   Formas que viajan del servidor a la interfaz.

   Viven aquí y no en `@/lib/datos/pauta` porque los componentes de cliente las
   necesitan y ese módulo lleva `server-only`. Un `import type` se borra al
   compilar, pero apoyarse en eso es frágil: basta que alguien cambie el import
   a uno de valor para que el bundle de cliente truene en producción.
   ========================================================================== */

export interface AdSetPauta {
  id: string
  nombre: string
  tipoPublico: TipoPublico
  /** `{"intereses": ["jazz"], "edad": [25, 45]}` tal como lo guardó el Pautero. */
  publico: Record<string, unknown>
  presupuestoCents: number
  gastadoCents: number
  estado: EstadoAdSet
  diarias: MetricaDiaria[]
  totales: Totales
}

export interface CreativoPauta {
  id: string
  adSetId: string
  adSetNombre: string
  piezaId: string
  formato: 'post' | 'carrusel' | 'reel'
  titulo: string
  publicarEl: string | null
  estado: EstadoCreativo
  /** Color del pilar. Es dato de la base, no diseño: entra por `style`. */
  color: string | null
}

export interface AlternativaPropuesta {
  tipo: TipoPropuesta | null
  razonamiento: string | null
  instrucciones: string | null
}

export interface PropuestaPauta {
  id: string
  campanaId: string
  campanaNombre: string
  adSetId: string | null
  adSetNombre: string | null
  tipo: TipoPropuesta
  razonamiento: string
  impacto: string | null
  riesgo: string | null
  alternativa: AlternativaPropuesta
  estado: EstadoPropuesta
  /** Los pasos exactos en Meta/TikTok. Es el entregable real de aprobar. */
  instrucciones: string | null
  aplicadaEn: string | null
  notaAplicacion: string | null
  creadaEn: string
  /** "DÍA 4 DE 7", calculado con la fecha en que se escribió la propuesta. */
  dia: DiaDeCampana
}

export interface CampanaPauta {
  id: string
  nombre: string
  objetivo: string
  plataforma: PlataformaAds
  presupuestoCents: number
  gastadoCents: number
  inicio: string
  fin: string
  estado: EstadoCampana
  objetivoAprendizaje: string | null
  metricaResultado: string | null
  aprendizaje: string | null
  adSets: AdSetPauta[]
  creativos: CreativoPauta[]
  propuestas: PropuestaPauta[]
  /** Suma de los ad sets. Es de donde salen el resultado principal y su costo. */
  totales: Totales
}

export interface DatosPauta {
  /** Todo lo que no está cerrado: activas, pausadas y borradores. */
  activas: CampanaPauta[]
  historico: CampanaPauta[]
}

/** Las instrucciones que aplican según cuál de las dos opciones se aprobó. */
export function instruccionesVigentes(propuesta: PropuestaPauta): string | null {
  return propuesta.estado === 'aprobada_alternativa'
    ? (propuesta.alternativa.instrucciones ?? propuesta.instrucciones)
    : propuesta.instrucciones
}

/** Un ad set al que se le pueden capturar métricas, ya con su campaña. */
export interface AdSetCapturable {
  id: string
  nombre: string
  campanaId: string
  campanaNombre: string
  inicio: string
  fin: string
}

/**
 * Solo las campañas abiertas. Capturar métricas de una campaña cerrada es casi
 * siempre un ad set escogido por error en la lista, y ensucia un histórico que
 * ya se dio por bueno.
 */
export function adSetsCapturables(datos: DatosPauta): AdSetCapturable[] {
  return datos.activas.flatMap((c) =>
    c.adSets.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      campanaId: c.id,
      campanaNombre: c.nombre,
      inicio: c.inicio,
      fin: c.fin,
    })),
  )
}
