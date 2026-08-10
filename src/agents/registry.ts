import type { z } from 'zod'
import {
  AGENT_KEYS,
  analistaInputSchema,
  analistaOutputSchema,
  auditorInputSchema,
  auditorOutputSchema,
  cuentaInputSchema,
  cuentaOutputSchema,
  editorMarcaInputSchema,
  editorMarcaOutputSchema,
  estrategaInputSchema,
  estrategaOutputSchema,
  guionistaInputSchema,
  guionistaOutputSchema,
  investigadorInputSchema,
  investigadorOutputSchema,
  pauteroInputSchema,
  pauteroOutputSchema,
  redactorInputSchema,
  redactorOutputSchema,
  type AgentKey,
} from '@/agents/contracts'

/**
 * El registro: una sola tabla que amarra cada agente con su contrato de
 * entrada, su contrato de salida y los campos de `pieces` que tiene permitido
 * escribir.
 *
 * El objetivo de diseño es que sea imposible en tiempo de compilación pedirle
 * al agente X un output del agente Y — `AgentOutput<'redactor'>` y
 * `AgentOutput<'pautero'>` son tipos distintos derivados de esta tabla, no
 * de una unión suelta que alguien tenga que acordarse de estrechar.
 */

/**
 * Campos de `public.pieces` que un agente puede escribir. La lista blanca vive
 * aquí y no en cada llamada: así "¿quién pudo haber escrito este campo?" tiene
 * una respuesta que se lee en diez segundos, y `authored_by` en la base nunca
 * puede recibir una combinación que no esté declarada.
 */
export const PIECE_FIELDS = [
  'pillar_id',
  'format',
  'platforms',
  'publish_at',
  'slot_index',
  'idea',
  'hook',
  'script',
  'copy_in',
  'copy_out',
  'cta',
  'hashtags',
  'boosted',
] as const

export type PieceField = (typeof PIECE_FIELDS)[number]

export interface AgentContract<
  K extends AgentKey = AgentKey,
  I extends z.ZodType = z.ZodType,
  O extends z.ZodType = z.ZodType,
> {
  readonly key: K
  /** La línea que se muestra en la tarjeta de `/agentes`. Texto de producto. */
  readonly description: string
  readonly input: I
  readonly output: O
  readonly writes: readonly PieceField[]
}

export const AGENTS = {
  estratega: {
    key: 'estratega',
    description: 'define cuánto contenido va al mes y en qué formatos',
    input: estrategaInputSchema,
    output: estrategaOutputSchema,
    // Arma el esqueleto del mes: cuántas piezas, de qué formato, en qué fecha.
    // No escribe una sola palabra de copy.
    writes: ['format', 'pillar_id', 'publish_at', 'slot_index'],
  },
  analista: {
    key: 'analista',
    description: 'lee resultados y dice qué quitar, qué meter más y qué mejorar',
    input: analistaInputSchema,
    output: analistaOutputSchema,
    // Propone cambios a piezas que aún no salen, pero no los aplica: el bloque
    // "para mitad de mes" es una lista para revisar, no un UPDATE.
    writes: [],
  },
  guionista: {
    key: 'guionista',
    description: 'propone guiones basados en tendencias con fit de marca',
    input: guionistaInputSchema,
    output: guionistaOutputSchema,
    writes: ['script'],
  },
  redactor: {
    key: 'redactor',
    description: 'escribe hook, copy y hashtags de cada pieza',
    input: redactorInputSchema,
    output: redactorOutputSchema,
    writes: ['hook', 'copy_in', 'copy_out', 'cta', 'hashtags'],
  },
  editor_marca: {
    key: 'editor_marca',
    description: 'verifica cada pieza contra las reglas del cliente',
    input: editorMarcaInputSchema,
    output: editorMarcaOutputSchema,
    // Dictamina, no corrige. Si el editor pudiera reescribir, su verdicto
    // dejaría de ser una revisión independiente.
    writes: [],
  },
  pautero: {
    key: 'pautero',
    description: 'arma la pauta, la mide y propone ajustes',
    input: pauteroInputSchema,
    output: pauteroOutputSchema,
    // Lo único que toca de una pieza es marcarla como impulsada. Presupuestos
    // y anuncios los mueve una persona en el ads manager.
    writes: ['boosted'],
  },
  auditor: {
    key: 'auditor',
    description: 'revisa el estado de las redes del cliente',
    input: auditorInputSchema,
    output: auditorOutputSchema,
    writes: [],
  },
  cuenta: {
    key: 'cuenta',
    description: 'presenta el mes y da seguimiento a las aprobaciones',
    input: cuentaInputSchema,
    output: cuentaOutputSchema,
    writes: [],
  },
  investigador: {
    key: 'investigador',
    description: 'lee la transcripción de un video de YouTube y propone qué hacer con ella',
    input: investigadorInputSchema,
    output: investigadorOutputSchema,
    // No escribe pieces: su entregable es un resumen y acciones sugeridas para
    // que una persona decida a qué cliente (si alguno) alimentar.
    writes: [],
  },
} as const satisfies { [K in AgentKey]: AgentContract<K> }

export type AgentRegistry = typeof AGENTS

/** El contrato completo de un agente, con sus tipos concretos. */
export type ContractFor<K extends AgentKey> = AgentRegistry[K]

export type AgentInput<K extends AgentKey> = z.infer<ContractFor<K>['input']>
export type AgentOutput<K extends AgentKey> = z.infer<ContractFor<K>['output']>

/** La parte útil de la salida, ya descartado el escalamiento. */
export type AgentData<K extends AgentKey> = Extract<AgentOutput<K>, { kind: 'resultado' }>['data']

export function contractFor<K extends AgentKey>(agent: K): ContractFor<K> {
  return AGENTS[agent]
}

/** Para validar lo que llega de la base o de un query param. */
export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value)
}

export function assertAgentKey(value: string): AgentKey {
  if (!isAgentKey(value)) {
    throw new Error(`Agente desconocido: "${value}".`)
  }
  return value
}

/** Los agentes que pueden escribir en `pieces`, por campo. Lo usa la UI de procedencia. */
export function agentsThatWrite(field: PieceField): readonly AgentKey[] {
  return AGENT_KEYS.filter((key) => (AGENTS[key].writes as readonly PieceField[]).includes(field))
}
