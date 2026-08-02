import { DIAS_SEMANA, fechaLocal } from '@/domain/calendario'
import { formatDate, formatTime } from '@/lib/time'

/**
 * Las fechas del Planner, siempre en la zona del estudio.
 *
 * El riel muestra el día del mes suelto, y eso no sale de `Intl` sin arrastrar
 * el mes con él. Se deriva de `fechaLocal`, que ya devuelve `AAAA-MM-DD` en
 * America/Tijuana: así el 30 de septiembre a las 6 pm no se convierte en 1 de
 * octubre por estar leyendo en UTC.
 */

export interface PartesFecha {
  /** `2026-09-05`, en la zona del estudio. */
  iso: string
  /** `05` — el número grande del riel. */
  dia: string
  /** `sáb` */
  diaSemana: string
  /** `7:00 p.m.` */
  hora: string
  /** `5 sept · 7:00 p.m.` — lo que se lee en el overlay del tile. */
  corta: string
}

export function partesDeFecha(publishAt: string | null): PartesFecha | null {
  if (!publishAt) return null
  const fecha = new Date(publishAt)
  if (Number.isNaN(fecha.getTime())) return null

  const iso = fechaLocal(fecha)
  const dia = iso.slice(8)
  // El día de la semana se calcula sobre la fecha ya local, a mediodía UTC,
  // para que ningún corrimiento de zona lo mueva al día vecino.
  const diaSemana = DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()] ?? ''
  const hora = formatTime(fecha)

  return { iso, dia, diaSemana, hora, corta: `${formatDate(fecha)} · ${hora}` }
}

/** El mismo texto para todo lo que no tiene fecha. Uno solo, no seis variantes. */
export const SIN_FECHA = 'Sin fecha'
