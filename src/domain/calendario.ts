import { STUDIO_TIMEZONE, type MonthKey } from '@/lib/time'

/**
 * La rejilla del calendario: lógica pura, sin React y sin IO.
 *
 * Está aparte del componente para poder probarla. Construir semanas a mano es
 * de esas cosas que se ven triviales y fallan en marzo, cuando el mes empieza
 * en domingo, o en un mes de 31 días que necesita seis filas en vez de cinco.
 */

export interface Dia {
  /** `2026-09-14`. Es la llave y también lo que se compara contra publish_at. */
  fecha: string
  diaDelMes: number
  /** Los días de relleno del mes anterior o el siguiente se pintan atenuados. */
  delMes: boolean
  esHoy: boolean
  /** 0 = domingo. Se usa para resaltar los fines de semana. */
  diaSemana: number
}

export const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const

/** `2026-09-14` en la zona del estudio, no en UTC ni en la del servidor. */
export function fechaLocal(date: Date, timeZone: string = STUDIO_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function iso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Devuelve siempre semanas completas de 7 días, empezando en domingo.
 *
 * Rellena con días del mes vecino en vez de dejar celdas vacías: una rejilla
 * con huecos al principio se lee mal y el drag & drop necesita que toda celda
 * sea un destino válido.
 */
export function construirMes(mes: MonthKey, hoy: string): Dia[][] {
  const [anioStr, mesStr] = mes.split('-')
  const anio = Number(anioStr)
  const numMes = Number(mesStr)

  // Día 0 del mes siguiente = último día de este mes.
  const diasEnMes = new Date(Date.UTC(anio, numMes, 0)).getUTCDate()
  const primerDiaSemana = new Date(Date.UTC(anio, numMes - 1, 1)).getUTCDay()

  const previo = new Date(Date.UTC(anio, numMes - 1, 0))
  const diasPrevio = previo.getUTCDate()
  const anioPrevio = previo.getUTCFullYear()
  const mesPrevio = previo.getUTCMonth() + 1

  const siguiente = new Date(Date.UTC(anio, numMes, 1))
  const anioSig = siguiente.getUTCFullYear()
  const mesSig = siguiente.getUTCMonth() + 1

  const celdas: Dia[] = []

  for (let i = primerDiaSemana - 1; i >= 0; i--) {
    const d = diasPrevio - i
    const fecha = iso(anioPrevio, mesPrevio, d)
    celdas.push({
      fecha,
      diaDelMes: d,
      delMes: false,
      esHoy: fecha === hoy,
      diaSemana: celdas.length % 7,
    })
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = iso(anio, numMes, d)
    celdas.push({
      fecha,
      diaDelMes: d,
      delMes: true,
      esHoy: fecha === hoy,
      diaSemana: celdas.length % 7,
    })
  }

  // Completar la última semana.
  let d = 1
  while (celdas.length % 7 !== 0) {
    const fecha = iso(anioSig, mesSig, d)
    celdas.push({
      fecha,
      diaDelMes: d,
      delMes: false,
      esHoy: fecha === hoy,
      diaSemana: celdas.length % 7,
    })
    d++
  }

  const semanas: Dia[][] = []
  for (let i = 0; i < celdas.length; i += 7) {
    semanas.push(celdas.slice(i, i + 7))
  }
  return semanas
}

/**
 * Agrupa cualquier cosa fechada por día.
 *
 * Genérico a propósito: el calendario muestra piezas, stories, fechas clave y
 * eventos, y todos se agrupan igual. Una función por tipo sería el mismo
 * bucle cuatro veces.
 */
export function agruparPorDia<T>(
  items: readonly T[],
  fechaDe: (item: T) => string | null,
): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of items) {
    const fecha = fechaDe(item)
    if (!fecha) continue
    // Acepta tanto '2026-09-14' como un ISO completo con hora.
    const dia = fecha.slice(0, 10)
    const lista = mapa.get(dia)
    if (lista) lista.push(item)
    else mapa.set(dia, [item])
  }
  return mapa
}
