/**
 * El tope de gasto de un agente y el aviso al 80%.
 *
 * Regla de negocio (CLAUDE.md): "Cada agente tiene tope de gasto mensual por
 * cliente. Al llegar, el runner se niega a correr. Un bug de reintentos no debe
 * poder costar mil dólares mientras nadie ve." Esa regla se verifica por código,
 * y aquí es donde vive el código —puro, sin IO— para que el runner, el tablero y
 * las pruebas usen exactamente la misma aritmética. Todo en centavos enteros de
 * USD, que es como la base guarda `agent_policies.monthly_cap_cents` y
 * `agent_runs.cost_cents`.
 *
 * Dos decisiones que valen su comentario:
 *
 *   · El aviso se compara en enteros (`gastado·5 >= tope·4`), no con `0.8` en
 *     flotante. `0.8 * tope` puede caer en una fracción que no se representa
 *     exacto en binario, y "¿ya llegó al 80%?" no debería depender de un error
 *     de redondeo en el centavo de la frontera. `4/5` es exacto.
 *   · Un tope de 0 no es "gratis infinito": es un agente que no puede gastar. Se
 *     trata como agotado, y `puedeCorrer` lo detiene igual que si ya se hubiera
 *     pasado. Encender un agente con tope 0 sería encenderlo apagado.
 */

/** La fracción del tope a la que salta el aviso. Documental: la comparación
 *  real usa la forma entera 4/5 (ver arriba). */
export const UMBRAL_AVISO = 0.8

export type EstadoPresupuesto = 'ok' | 'aviso' | 'agotado'

/**
 * En qué franja del tope cae un gasto acumulado. Lo usa el tablero para pintar
 * el chip a partir de datos que ya lee (costo del mes contra suma de topes), sin
 * una consulta extra.
 */
export function estadoDePresupuesto(gastadoCents: number, topeCents: number): EstadoPresupuesto {
  // Tope 0 (o negativo, que no debería pasar) = no puede gastar = agotado.
  if (topeCents <= 0) return 'agotado'
  if (gastadoCents >= topeCents) return 'agotado'
  // ¿Ya tocó el 80%? gastado/tope >= 4/5, en enteros.
  if (gastadoCents * 5 >= topeCents * 4) return 'aviso'
  return 'ok'
}

/**
 * La puerta del presupuesto ANTES de llamar al proveedor. Es la misma pregunta
 * que hace el runner en su Puerta 3, extraída aquí para que la frontera del tope
 * viva en un solo lugar. Corre solo si todavía queda margen: gasto < tope y tope
 * positivo.
 */
export function puedeCorrer({
  topeCents,
  gastadoCents,
}: {
  topeCents: number
  gastadoCents: number
}): boolean {
  return topeCents > 0 && gastadoCents < topeCents
}

export interface EvaluacionPresupuesto {
  /** Gasto del mes tras sumar el costo de esta corrida. */
  readonly gastadoDespuesCents: number
  /** Lo que queda del tope, nunca negativo. */
  readonly restanteCents: number
  readonly estadoAntes: EstadoPresupuesto
  readonly estadoDespues: EstadoPresupuesto
  /**
   * Esta corrida fue la que empujó el gasto de "ok" a tocar el aviso (o directo
   * a agotado). Es `true` exactamente en el cruce —una sola vez—, no en cada
   * corrida que ya vive arriba del 80%. Así la notificación no se repite en cada
   * llamada del mes una vez pasado el umbral.
   */
  readonly cruzoAviso: boolean
  /** Fracción del tope ya gastada tras esta corrida. Para mostrar, no para decidir. */
  readonly fraccionDespues: number
}

/**
 * Evalúa el presupuesto DESPUÉS de una corrida exitosa: cuánto queda, en qué
 * franja cae ahora y —lo importante— si esta corrida fue la que cruzó el 80%.
 *
 * El runner llama a `puedeCorrer` antes, así que cuando esto se ejecuta el
 * estado de entrada es 'ok' o 'aviso', nunca 'agotado' (una corrida agotada no
 * habría corrido). El cruce es, por lo tanto, pasar de 'ok' a algo que no es
 * 'ok'.
 */
export function evaluarCorrida({
  topeCents,
  gastadoAntesCents,
  costoCents,
}: {
  topeCents: number
  gastadoAntesCents: number
  costoCents: number
}): EvaluacionPresupuesto {
  const gastadoDespuesCents = gastadoAntesCents + costoCents
  const estadoAntes = estadoDePresupuesto(gastadoAntesCents, topeCents)
  const estadoDespues = estadoDePresupuesto(gastadoDespuesCents, topeCents)

  return {
    gastadoDespuesCents,
    restanteCents: Math.max(0, topeCents - gastadoDespuesCents),
    estadoAntes,
    estadoDespues,
    cruzoAviso: estadoAntes === 'ok' && estadoDespues !== 'ok',
    fraccionDespues: topeCents > 0 ? gastadoDespuesCents / topeCents : 1,
  }
}
