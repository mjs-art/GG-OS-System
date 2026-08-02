/**
 * Aritmética de resultados: variaciones, promedios y "cuál es el mejor".
 *
 * Lógica pura, sin React y sin IO, porque es la que se presenta al cliente. Un
 * porcentaje mal calculado en una junta cuesta más caro que un layout roto: el
 * layout se ve, el número equivocado se cree.
 *
 * Las tres cosas que esta capa existe para no equivocar:
 *   · Dividir entre cero. El mes anterior en cero no es "subió 100%": es que
 *     no hay contra qué comparar, y decirlo es más honesto que inventarlo.
 *   · "Mejor" no siempre es "más alto". El costo por resultado mejor es el más
 *     bajo, y un renglón resaltado al revés dirige el presupuesto al ad set
 *     equivocado.
 *   · El promedio de cero piezas es cero, no NaN. Un NaN se pinta como "NaN"
 *     en la tabla que se le enseña al cliente.
 */

import type { MonthKey } from '@/lib/time'

/** Hacia dónde tiene que moverse una métrica para que la noticia sea buena. */
export type Direccion = 'mayor_es_mejor' | 'menor_es_mejor'

export type Tendencia = 'up' | 'down' | 'flat'

export interface Variacion {
  actual: number
  /** `null` cuando no hay mes anterior capturado. */
  anterior: number | null
  /** `actual - anterior`. `null` sin base de comparación. */
  delta: number | null
  /**
   * Cambio porcentual. `null` cuando no hay base o cuando la base es cero:
   * de 0 a 187 no es "+∞%" ni "+100%", es que antes no había nada.
   */
  pct: number | null
  tendencia: Tendencia
  /** Si el movimiento es una buena noticia, según la dirección de la métrica. */
  esBueno: boolean
  /** Texto listo para el chip en mono. Nunca dice un porcentaje que no existe. */
  etiqueta: string
}

/**
 * Compara un mes contra el anterior.
 *
 * `anterior` acepta `null` a propósito: el primer mes de un cliente no tiene
 * con qué compararse y forzar un 0 ahí produce "+100%" en las ocho métricas.
 */
export function calcularVariacion(
  actual: number,
  anterior: number | null,
  direccion: Direccion = 'mayor_es_mejor',
): Variacion {
  if (anterior === null || !Number.isFinite(anterior) || !Number.isFinite(actual)) {
    return {
      actual,
      anterior: anterior ?? null,
      delta: null,
      pct: null,
      tendencia: 'flat',
      esBueno: false,
      etiqueta: 'sin mes anterior',
    }
  }

  const delta = actual - anterior
  const tendencia: Tendencia = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  const subio = delta > 0
  const esBueno = tendencia === 'flat' ? false : direccion === 'mayor_es_mejor' ? subio : !subio

  if (anterior === 0) {
    return {
      actual,
      anterior,
      delta,
      pct: null,
      tendencia,
      esBueno,
      // Sin base no hay porcentaje. Se muestra el salto absoluto, que sí existe.
      etiqueta: delta === 0 ? 'igual' : `${formatearNumero(Math.abs(delta))} vs 0`,
    }
  }

  const pct = (delta / Math.abs(anterior)) * 100

  return {
    actual,
    anterior,
    delta,
    pct,
    tendencia,
    esBueno,
    etiqueta: delta === 0 ? 'igual' : `${formatearPorcentaje(Math.abs(pct))}`,
  }
}

/** Promedio que nunca devuelve NaN: sin piezas el promedio es cero. */
export function promedio(total: number, piezas: number): number {
  if (piezas <= 0 || !Number.isFinite(total)) return 0
  return total / piezas
}

/** Porcentaje de una parte sobre un total. Total en cero es 0%, no NaN. */
export function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0
  return (parte / total) * 100
}

/**
 * El índice del mejor renglón de una tabla, o `-1` si no hay ninguno comparable.
 *
 * `direccion` no tiene default a propósito: obligar a declararla en cada
 * llamada es lo que evita que alguien resalte el costo por resultado más caro
 * como si fuera el mejor. Los empates se quedan con el primero, que en una
 * tabla ordenada es el más relevante.
 */
export function indiceDelMejor<T>(
  renglones: readonly T[],
  valor: (renglon: T) => number,
  direccion: Direccion,
): number {
  let mejor = -1
  let mejorValor = Number.NaN

  renglones.forEach((renglon, i) => {
    const v = valor(renglon)
    // Un renglón sin dato no puede ganar: quedaría resaltado un cero que solo
    // significa "no se ha medido".
    if (!Number.isFinite(v)) return
    if (mejor === -1) {
      mejor = i
      mejorValor = v
      return
    }
    const gana = direccion === 'mayor_es_mejor' ? v > mejorValor : v < mejorValor
    if (gana) {
      mejor = i
      mejorValor = v
    }
  })

  return mejor
}

/* -------------------------------------------------------------------------- */
/*  Rendimiento agregado — lo que alimenta el volumen del mes siguiente.       */
/* -------------------------------------------------------------------------- */

/** Una pieza medida. Las tablas de rendimiento se arman agrupando estas. */
export interface PiezaMedida {
  clave: string
  reach: number
  saves: number
  shares: number
  impressions: number
  interactions: number
}

export interface RenglonRendimiento {
  clave: string
  piezas: number
  alcanceTotal: number
  alcancePromedio: number
  guardadosPromedio: number
  compartidosPromedio: number
  /** Interacciones sobre alcance. Cero alcance es 0%, no NaN. */
  engagementPct: number
}

/**
 * Agrupa piezas medidas por su clave (formato o pilar) y saca los promedios.
 *
 * El engagement se calcula sobre el TOTAL de interacciones y el TOTAL de
 * alcance, no como promedio de porcentajes por pieza. Promediar porcentajes le
 * da el mismo peso a un reel de 5,000 de alcance que a un post de 80, y eso
 * infla el número justo en los meses con una pieza chica que salió bien.
 */
export function agruparRendimiento(piezas: readonly PiezaMedida[]): RenglonRendimiento[] {
  const grupos = new Map<string, PiezaMedida[]>()
  for (const pieza of piezas) {
    const lista = grupos.get(pieza.clave)
    if (lista) lista.push(pieza)
    else grupos.set(pieza.clave, [pieza])
  }

  return [...grupos.entries()].map(([clave, lista]) => {
    const n = lista.length
    const alcanceTotal = lista.reduce((a, p) => a + p.reach, 0)
    const interacciones = lista.reduce((a, p) => a + p.interactions, 0)

    return {
      clave,
      piezas: n,
      alcanceTotal,
      alcancePromedio: promedio(alcanceTotal, n),
      guardadosPromedio: promedio(
        lista.reduce((a, p) => a + p.saves, 0),
        n,
      ),
      compartidosPromedio: promedio(
        lista.reduce((a, p) => a + p.shares, 0),
        n,
      ),
      engagementPct: porcentaje(interacciones, alcanceTotal),
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  Crecimiento de seguidores                                                  */
/* -------------------------------------------------------------------------- */

export interface PuntoSeguidores {
  mes: MonthKey
  total: number
}

/**
 * Reconstruye la curva de seguidores hacia atrás.
 *
 * La base solo guarda `new_followers` por mes y el total actual vive en
 * `social_accounts`. El total al cierre de un mes es el de hoy menos todo lo
 * que se ganó después — restar hacia atrás es la única forma de dibujar la
 * curva sin una tabla de snapshots que nadie va a llenar.
 *
 * `meses` tiene que venir en orden ascendente. El resultado se recorta en cero:
 * si los deltas capturados suman más que el total actual, el dato está mal y
 * una gráfica con seguidores negativos no ayuda a verlo.
 */
export function serieDeSeguidores(
  seguidoresHoy: number,
  meses: readonly { mes: MonthKey; nuevos: number }[],
): PuntoSeguidores[] {
  const puntos: PuntoSeguidores[] = []
  let acumulado = 0

  for (let i = meses.length - 1; i >= 0; i--) {
    const punto = meses[i]
    if (!punto) continue
    puntos.unshift({ mes: punto.mes, total: Math.max(0, seguidoresHoy - acumulado) })
    acumulado += punto.nuevos
  }

  return puntos
}

/**
 * Puntos de una polilínea SVG a partir de una serie.
 *
 * Vive aquí y no en el componente porque es aritmética con dos casos de borde
 * que se ven feos y no truenan: un solo punto (no hay rango horizontal) y una
 * serie plana (no hay rango vertical, y dividir entre él da NaN). En los dos
 * la línea se dibuja a media altura.
 */
export function puntosDeLinea(
  valores: readonly number[],
  ancho: number,
  alto: number,
  padding = 0,
): Array<{ x: number; y: number }> {
  const n = valores.length
  if (n === 0) return []

  const util = Math.max(0, alto - padding * 2)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min

  return valores.map((valor, i) => ({
    x: n === 1 ? ancho / 2 : (i / (n - 1)) * ancho,
    y: rango === 0 ? alto / 2 : padding + util - ((valor - min) / rango) * util,
  }))
}

/* -------------------------------------------------------------------------- */
/*  Distribución por pilar                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Cuántos puntos porcentuales puede desviarse un pilar de su objetivo antes de
 * que la barra lo señale. Diez es el número del brief y es razonable: con tres
 * pilares, una pieza de más ya mueve tres o cuatro puntos.
 */
export const DESVIACION_MAXIMA_PILAR = 10

export interface DistribucionPilar {
  id: string
  nombre: string
  color: string
  piezas: number
  pct: number
  objetivoPct: number
  /** Positivo = va arriba del objetivo. */
  desviacion: number
  fueraDeRango: boolean
}

export function distribucionPorPilar(
  pilares: readonly { id: string; nombre: string; color: string; objetivoPct: number }[],
  piezasPorPilar: ReadonlyMap<string, number>,
): DistribucionPilar[] {
  const total = [...piezasPorPilar.values()].reduce((a, b) => a + b, 0)

  return pilares.map((pilar) => {
    const piezas = piezasPorPilar.get(pilar.id) ?? 0
    const pct = porcentaje(piezas, total)
    const desviacion = pct - pilar.objetivoPct

    return {
      id: pilar.id,
      nombre: pilar.nombre,
      color: pilar.color,
      piezas,
      pct,
      objetivoPct: pilar.objetivoPct,
      desviacion,
      // Sin piezas todavía no hay desviación que reportar: el mes está vacío,
      // no desbalanceado, y marcar los tres pilares en rojo el día 1 enseña a
      // ignorar la advertencia.
      fueraDeRango: total > 0 && Math.abs(desviacion) > DESVIACION_MAXIMA_PILAR,
    }
  })
}

/* -------------------------------------------------------------------------- */
/*  Formato                                                                    */
/* -------------------------------------------------------------------------- */

const NUMERO = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatearNumero(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  return NUMERO.format(Math.round(valor))
}

/** `184K`. Para los números grandes de la rejilla, donde el ancho manda. */
export function formatearCompacto(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  const abs = Math.abs(valor)
  if (abs >= 1_000_000) return `${DECIMAL.format(valor / 1_000_000)}M`
  if (abs >= 10_000) return `${NUMERO.format(valor / 1000)}K`
  return NUMERO.format(valor)
}

export function formatearPorcentaje(valor: number): string {
  if (!Number.isFinite(valor)) return '—'
  // Un decimal arriba de 10% es ruido; abajo, la diferencia entre 2.1% y 2.8%
  // es justo la que se discute.
  return Math.abs(valor) >= 10 ? `${NUMERO.format(valor)}%` : `${DECIMAL.format(valor)}%`
}

/** `↑ de 9` — la variación de un renglón del plan de volumen. */
export function formatearContraAnterior(actual: number, anterior: number | null): string {
  if (anterior === null) return 'nuevo'
  if (actual === anterior) return `igual que ${anterior}`
  return `${actual > anterior ? '↑' : '↓'} de ${anterior}`
}
