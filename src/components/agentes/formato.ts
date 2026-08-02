/**
 * Formato de los números de la pantalla de Agentes.
 *
 * Sin directiva: lo usan tanto el tablero (servidor) como la bitácora
 * (cliente).
 */

/**
 * Dinero, siempre desde centavos enteros.
 *
 * `agent_runs.cost_cents` guarda **centavos de dólar**, que es la unidad en la
 * que factura el proveedor del modelo. Se divide aquí y en ningún otro lado: un
 * float de pesos paseándose por la app acaba en $284.99999, y peor, en dos
 * pantallas que muestran totales distintos del mismo mes.
 *
 * No se usa Intl con `currency: 'USD'` porque en `es-MX` sale "USD 4.50" y en
 * `en-US` "$4.50": el mismo dato cambiaría de forma según quién lo mire. La
 * pantalla pone la etiqueta USD una sola vez, arriba.
 */
export function dolares(centavos: number): string {
  return `$${(centavos / 100).toFixed(2)}`
}

/** 1,240 — separador de miles en español de México. */
export function miles(valor: number): string {
  return new Intl.NumberFormat('es-MX').format(valor)
}

/** "1.2 s" arriba de un segundo, "840 ms" abajo. Un guion cuando no se midió. */
export function duracion(ms: number | null): string {
  if (ms === null) return '—'
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${miles(ms)} ms`
}

/** Los tokens de una corrida: "1,204 / 380". Guion cuando el proveedor no los reportó. */
export function tokens(entrada: number | null, salida: number | null): string {
  if (entrada === null && salida === null) return '—'
  return `${entrada === null ? '—' : miles(entrada)} / ${salida === null ? '—' : miles(salida)}`
}

/** Qué tanto del tope mensual ya se gastó. 0–100, y 0 cuando no hay tope. */
export function porcentajeDelTope(gastadoCents: number, topeCents: number): number {
  if (topeCents <= 0) return 0
  return Math.min(100, Math.round((gastadoCents / topeCents) * 100))
}
