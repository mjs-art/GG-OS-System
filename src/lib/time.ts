/**
 * All time flows through here.
 *
 * Why: `new Date()` scattered through components makes rendering
 * non-deterministic, breaks snapshot tests, and — the real bug — silently uses
 * the *server's* timezone for a product whose whole domain is "which day does
 * this post go out in Tijuana".
 *
 * ESLint bans bare `new Date()` outside this file.
 */

/** Every client of this studio operates on Mexican Pacific time. */
export const STUDIO_TIMEZONE = 'America/Tijuana'
export const STUDIO_LOCALE = 'es-MX'

export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

/** Deterministic clock for tests and for seeding fixtures. */
export function fixedClock(iso: string): Clock {
  const frozen = new Date(iso)
  if (Number.isNaN(frozen.getTime())) {
    throw new Error(`fixedClock recibió una fecha inválida: ${iso}`)
  }
  return { now: () => new Date(frozen) }
}

/** `2026-09` — the canonical key for a planning month. */
export type MonthKey = `${number}-${string}`

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonthKey(value: string): value is MonthKey {
  return MONTH_KEY_RE.test(value)
}

export function parseMonthKey(value: string): MonthKey {
  if (!isMonthKey(value)) {
    throw new Error(`Mes inválido: "${value}". Se espera el formato AAAA-MM, por ejemplo 2026-09.`)
  }
  return value
}

export function toMonthKey(date: Date): MonthKey {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: STUDIO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)

  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  if (!year || !month) throw new Error('No se pudo derivar el mes de la fecha.')

  return `${Number(year)}-${month}`
}

/** Shifts a month key by N months. `addMonths('2026-11', 2) === '2027-01'`. */
export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [yearStr, monthStr] = key.split('-')
  const total = Number(yearStr) * 12 + (Number(monthStr) - 1) + delta
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  return `${year}-${String(month).padStart(2, '0')}`
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

export function formatMonthKey(key: MonthKey): string {
  const [year, month] = key.split('-')
  const name = MONTHS_ES[Number(month) - 1] ?? month
  return `${name} ${year}`
}

export function formatDate(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(STUDIO_LOCALE, {
    timeZone: STUDIO_TIMEZONE,
    day: 'numeric',
    month: 'short',
    ...options,
  }).format(date)
}

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(STUDIO_LOCALE, {
    timeZone: STUDIO_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/** "hace 2 días" / "en 3 días" — the phrasing the dashboard uses everywhere. */
export function relativeDays(from: Date, to: Date): string {
  const dayMs = 86_400_000
  const diff = Math.round((to.getTime() - from.getTime()) / dayMs)
  if (diff === 0) return 'hoy'
  if (diff === -1) return 'ayer'
  if (diff === 1) return 'mañana'
  return diff < 0 ? `hace ${Math.abs(diff)} días` : `en ${diff} días`
}
