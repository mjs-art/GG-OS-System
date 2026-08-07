import { fold } from '@/domain/brand-rules'
import type { AgentKey } from '@/domain/labels'

/**
 * Detección de correcciones que ya son patrón.
 *
 * `human_edits` es el activo real del sistema, pero listarlo es pasivo: alguien
 * tiene que leer la lista y acordarse. Esto lo vuelve activo. Cuando una misma
 * palabra se borra una y otra vez de lo que escribe un agente, deja de ser una
 * corrección suelta y es criterio de marca — y ese criterio se puede convertir
 * en regla dura de código, que el Editor de marca bloquea sin volver a
 * preguntar. Cierra el lazo: corrección repetida → regla → el agente deja de
 * cometer el mismo error el mes que entra.
 *
 * Solo cuentan las palabras BORRADAS: las que están en `old_value` y ya no en
 * `new_value`. Lo que la persona AGREGÓ no es una prohibición; convertir eso en
 * regla prohibiría justo lo que quiso meter.
 *
 * Lógica pura, sin IO, por la misma razón que `brand-rules.ts`: el criterio de
 * "qué cuenta como patrón" tiene que probarse con casos, no descubrirse en
 * producción el día que proponga una tontería.
 */

/** Los campos de `pieces` cuyo texto es prosa de agente y sí se puede tokenizar. */
const CAMPOS_DE_TEXTO: ReadonlySet<string> = new Set([
  'hook',
  'copy_in',
  'copy_out',
  'cta',
  'idea',
  'script',
])

/**
 * Debajo de cuatro letras casi todo es conector ("con", "por", "los") y ninguna
 * marca prohíbe una palabra de tres letras. El piso barre el ruido antes de que
 * el umbral tenga que hacerlo.
 */
const LONGITUD_MINIMA = 4

/**
 * Palabras de función en español que se repiten por gramática, no por criterio
 * de marca. La lista es corta a propósito: el umbral de repetición ya filtra el
 * ruido, esto solo saca las que sí se repetirían por ser conectores comunes y
 * que ensuciarían la sugerencia.
 */
const VACIAS: ReadonlySet<string> = new Set([
  'para',
  'pero',
  'como',
  'porque',
  'cuando',
  'donde',
  'sobre',
  'entre',
  'hasta',
  'desde',
  'esta',
  'este',
  'esto',
  'esos',
  'esas',
  'estos',
  'estas',
  'todo',
  'toda',
  'todos',
  'todas',
  'tanto',
  'tanta',
  'tambien',
  'solo',
  'unos',
  'unas',
  'aqui',
  'alli',
  'muy',
  'mas',
  'sus',
])

/** Una edición de `human_edits`, reducida a lo que la detección necesita. */
export interface EdicionParaAnalisis {
  field: string
  oldValue: string | null
  newValue: string | null
  agent: AgentKey | null
}

export interface SugerenciaPalabra {
  /** La palabra tal como se escribió, para mostrarla y para sembrar la regla. */
  palabra: string
  /** En cuántas ediciones distintas se borró. El umbral se mide contra esto. */
  veces: number
  /** Qué agentes la habían escrito. Alimenta el chip de procedencia. */
  agentes: AgentKey[]
}

export interface OpcionesDeteccion {
  /**
   * Palabras ya cubiertas por el Context Card o por una regla léxica. No se
   * vuelven a sugerir: proponer prohibir lo que ya está prohibido es ruido.
   */
  yaCubiertas?: readonly string[]
  /**
   * Cuántas veces borrada para contar como patrón. Default 2 — la propia UI de
   * Marca ya dice la regla: "si el cliente ya te corrigió alguna dos veces, va
   * aquí".
   */
  umbral?: number
  /** Tope de sugerencias. Una lista larga deja de ser accionable. */
  limite?: number
}

const TOKEN = /[\p{L}\p{N}]+/gu

/** Las palabras de un texto, mapeando su forma normalizada a la de superficie. */
function palabrasDe(texto: string): Map<string, string> {
  const mapa = new Map<string, string>()
  for (const match of texto.matchAll(TOKEN)) {
    const surface = match[0]
    const clave = fold(surface)
    // La primera forma de superficie gana: es la que se le mostrará a la
    // persona, y con acentos y mayúsculas de verdad en vez de la normalizada.
    if (!mapa.has(clave)) mapa.set(clave, surface)
  }
  return mapa
}

function clavesDe(texto: string): Set<string> {
  const set = new Set<string>()
  for (const match of texto.matchAll(TOKEN)) set.add(fold(match[0]))
  return set
}

/** Un token puramente numérico ("2024") no es una palabra que se prohíba. */
function esNumero(clave: string): boolean {
  return /^\p{N}+$/u.test(clave)
}

/**
 * Encuentra las palabras que una persona borra de forma recurrente al corregir
 * a un agente. Cada palabra devuelta es candidata a regla dura léxica.
 */
export function detectarPalabrasRecurrentes(
  ediciones: readonly EdicionParaAnalisis[],
  opciones: OpcionesDeteccion = {},
): SugerenciaPalabra[] {
  const umbral = opciones.umbral ?? 2
  const limite = opciones.limite ?? 5
  const cubiertas = new Set((opciones.yaCubiertas ?? []).map(fold))

  interface Acumulado {
    surface: string
    veces: number
    agentes: Set<AgentKey>
  }
  const acc = new Map<string, Acumulado>()

  for (const edicion of ediciones) {
    if (!CAMPOS_DE_TEXTO.has(edicion.field)) continue
    // Sin las dos mitades no hay nada que comparar: un alta sin `old_value` o un
    // borrado sin `new_value` no dicen qué palabra se quitó.
    if (typeof edicion.oldValue !== 'string' || typeof edicion.newValue !== 'string') continue

    const viejas = palabrasDe(edicion.oldValue)
    const nuevas = clavesDe(edicion.newValue)

    for (const [clave, surface] of viejas) {
      // Sigue en el texto nuevo: no se borró, se movió o se mantuvo.
      if (nuevas.has(clave)) continue
      if (cubiertas.has(clave)) continue
      if (clave.length < LONGITUD_MINIMA) continue
      if (esNumero(clave)) continue
      if (VACIAS.has(clave)) continue

      const previo = acc.get(clave)
      if (previo) {
        previo.veces += 1
        if (edicion.agent) previo.agentes.add(edicion.agent)
      } else {
        acc.set(clave, {
          surface,
          veces: 1,
          agentes: new Set(edicion.agent ? [edicion.agent] : []),
        })
      }
    }
  }

  return (
    [...acc.values()]
      .filter((a) => a.veces >= umbral)
      .map((a) => ({
        palabra: a.surface,
        veces: a.veces,
        agentes: [...a.agentes].sort(),
      }))
      // Lo más repetido primero; el desempate alfabético mantiene el orden estable
      // entre renders, igual que la cola de la Bandeja.
      .sort((a, b) => b.veces - a.veces || a.palabra.localeCompare(b.palabra))
      .slice(0, limite)
  )
}
