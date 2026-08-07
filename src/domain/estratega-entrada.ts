import type { PieceFormat } from '@/domain/labels'

/**
 * Arma el rendimiento por formato y por pilar que come el Estratega.
 *
 * Vive en `domain/` y se prueba aparte porque es donde se cuela el número que
 * después el Estratega presenta al cliente: un promedio mal sacado o un
 * porcentaje que se pasa de 100 no truena, se defiende en junta y queda mal.
 *
 * Lo que NO se rastrea todavía se dice con cero, no se inventa: el alcance en no
 * seguidores no existe por pieza en la base de esta etapa, así que va en 0 en
 * vez de un estimado que nadie puede sostener.
 */

export interface MedicionDePieza {
  format: PieceFormat
  pillarId: string | null
  reach: number
  saves: number
  interactions: number
}

export interface RendimientoFormato {
  format: PieceFormat
  pieces: number
  avg_reach: number
  avg_saves: number
  avg_engagement_pct: number
  avg_non_follower_reach: number
}

export interface PilarParaRendimiento {
  id: string
  name: string
  targetPct: number
}

export interface RendimientoPilar {
  pillar: string
  target_pct: number
  actual_pct: number
  avg_reach: number
}

const ORDEN_FORMATO: readonly PieceFormat[] = ['post', 'carrusel', 'reel']

const clampPct = (n: number): number => Math.max(0, Math.min(100, n))
const promedio = (total: number, n: number): number => (n > 0 ? total / n : 0)

/**
 * Un renglón por formato que de verdad tuvo piezas medidas. El schema del
 * contrato no exige formatos, así que un formato sin datos se omite en vez de
 * mandar ceros que el Estratega leería como "esto no funciona".
 */
export function rendimientoPorFormato(
  mediciones: readonly MedicionDePieza[],
): RendimientoFormato[] {
  return ORDEN_FORMATO.flatMap((format) => {
    const grupo = mediciones.filter((m) => m.format === format)
    if (grupo.length === 0) return []

    const alcance = grupo.reduce((a, m) => a + m.reach, 0)
    const interacciones = grupo.reduce((a, m) => a + m.interactions, 0)

    return [
      {
        format,
        pieces: grupo.length,
        avg_reach: promedio(alcance, grupo.length),
        avg_saves: promedio(
          grupo.reduce((a, m) => a + m.saves, 0),
          grupo.length,
        ),
        // Engagement sobre los totales, no promedio de porcentajes: así una
        // pieza chica que salió bien no infla el número. Se acota a 100 porque
        // interacciones > alcance es posible y no es un porcentaje válido.
        avg_engagement_pct: clampPct(alcance > 0 ? (interacciones / alcance) * 100 : 0),
        avg_non_follower_reach: 0,
      },
    ]
  })
}

/**
 * Un renglón por pilar del cliente, siempre — el contrato pide al menos uno, y
 * el objetivo del pilar existe aunque todavía no haya piezas medidas.
 *
 * `actual_pct` es la parte de piezas medidas que cayeron en ese pilar. Sin
 * piezas medidas es 0, que es la verdad honesta: no se ha publicado nada que
 * medir, no que el pilar valga cero.
 */
export function rendimientoPorPilar(
  mediciones: readonly MedicionDePieza[],
  pilares: readonly PilarParaRendimiento[],
): RendimientoPilar[] {
  const total = mediciones.length

  return pilares.map((p) => {
    const grupo = mediciones.filter((m) => m.pillarId === p.id)
    return {
      pillar: p.name,
      target_pct: clampPct(p.targetPct),
      actual_pct: clampPct(total > 0 ? (grupo.length / total) * 100 : 0),
      avg_reach: promedio(
        grupo.reduce((a, m) => a + m.reach, 0),
        grupo.length,
      ),
    }
  })
}
