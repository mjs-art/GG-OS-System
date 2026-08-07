import type { PieceStatus } from '@/domain/labels'

/**
 * La decisión pura detrás de "preparar el mes": ¿sobre qué piezas SÍ corre el
 * Redactor en lote?
 *
 * Vive en `domain/` y no junto a la orquestación porque es donde está el riesgo
 * que sí puede salir caro: confundir "sin escribir" con "ya escrita" significa o
 * dejar copy sin hacer, o —mucho peor— pisar el copy que una persona ya editó,
 * que es el activo real del sistema. Eso se prueba con casos, no se descubre en
 * producción con las piezas ya sobrescritas.
 */

export interface PiezaParaPreparar {
  id: string
  status: PieceStatus
  hook: string | null
  idea: string | null
  pillarId: string | null
  platforms: readonly string[]
}

export interface Clasificacion {
  /** Se corre el Redactor sobre estas: en `idea`, sin hook y con sus insumos. */
  candidatas: PiezaParaPreparar[]
  /** Ya tienen copy o avanzaron en el pipeline. No se tocan. */
  yaTrabajadas: number
  /** En `idea` y sin escribir, pero les falta idea, pilar o plataforma. */
  sinInsumos: PiezaParaPreparar[]
}

function tieneInsumos(p: PiezaParaPreparar): boolean {
  return Boolean(p.idea && p.idea.trim() !== '' && p.pillarId) && p.platforms.length > 0
}

/**
 * Reparte las piezas del mes en tres canastas.
 *
 * Una pieza es candidata solo si sigue en `idea` y su hook está vacío: en cuanto
 * tiene hook —lo haya escrito un agente o una persona— cuenta como trabajada y
 * el lote no la toca. Reescribir en lote lo ya escrito borraría ediciones
 * humanas sin preguntar.
 */
export function clasificarPiezas(piezas: readonly PiezaParaPreparar[]): Clasificacion {
  const candidatas: PiezaParaPreparar[] = []
  const sinInsumos: PiezaParaPreparar[] = []
  let yaTrabajadas = 0

  for (const pieza of piezas) {
    const sinEscribir = pieza.status === 'idea' && (pieza.hook === null || pieza.hook.trim() === '')
    if (!sinEscribir) {
      yaTrabajadas += 1
      continue
    }
    if (tieneInsumos(pieza)) candidatas.push(pieza)
    else sinInsumos.push(pieza)
  }

  return { candidatas, yaTrabajadas, sinInsumos }
}
