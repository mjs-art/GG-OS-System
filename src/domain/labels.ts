/**
 * Etiquetas en español de los enums de la base.
 *
 * Los enums de Postgres van sin acento ni eñe (`campana`, `critica`) porque un
 * identificador con caracteres especiales es una fuente de dolor en migraciones
 * y en clientes de SQL. Pero eso jamás debe llegar a la pantalla: "campana" es
 * otra palabra, y el mes que se le presenta al cliente no puede decirla.
 *
 * Este archivo es el único puente. Los `Record` son exhaustivos a propósito:
 * agregar un valor al enum sin etiquetarlo no compila.
 */

import type { Database } from '@/lib/supabase/database.types'

type Enums = Database['public']['Tables']

export type PieceStatus = Enums['pieces']['Row']['status']
export type PieceFormat = Enums['pieces']['Row']['format']
export type StoryKind = Enums['stories']['Row']['kind']
export type Platform = NonNullable<Enums['pieces']['Row']['platforms']>[number]
export type RuleSeverity = Enums['brand_rules']['Row']['severity']
export type RuleCheck = Enums['brand_rules']['Row']['check_by']
export type AgentKey = Enums['agent_runs']['Row']['agent']

export const PIECE_STATUS_LABEL: Record<PieceStatus, string> = {
  idea: 'Idea',
  escrito: 'Escrito',
  revisado: 'Revisado',
  con_cliente: 'Con cliente',
  aprobado: 'Aprobado',
  publicado: 'Publicado',
}

/** El orden del pipeline. La barra de Resumen lo recorre en esta secuencia. */
export const PIECE_STATUS_ORDER: readonly PieceStatus[] = [
  'idea',
  'escrito',
  'revisado',
  'con_cliente',
  'aprobado',
  'publicado',
]

export const PIECE_FORMAT_LABEL: Record<PieceFormat, string> = {
  post: 'Post',
  carrusel: 'Carrusel',
  reel: 'Reel',
}

export const STORY_KIND_LABEL: Record<StoryKind, string> = {
  diaria: 'Diaria',
  // El enum va sin eñe; la pantalla no.
  campana: 'De campaña',
  interactiva: 'Interactiva',
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

export const RULE_SEVERITY_LABEL: Record<RuleSeverity, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

export const RULE_CHECK_LABEL: Record<RuleCheck, string> = {
  codigo: 'Código',
  modelo: 'Modelo',
}

export const AGENT_LABEL: Record<AgentKey, string> = {
  estratega: 'Estratega',
  analista: 'Analista',
  guionista: 'Guionista',
  redactor: 'Redactor',
  editor_marca: 'Editor de marca',
  pautero: 'Pautero',
  auditor: 'Auditor',
  cuenta: 'Cuenta',
  investigador: 'Investigador',
}

/** Los estados a partir de los cuales el cliente ve la pieza. Espeja `app.is_client_visible`. */
export const CLIENT_VISIBLE_STATUSES: readonly PieceStatus[] = [
  'con_cliente',
  'aprobado',
  'publicado',
]

export function isClientVisible(status: PieceStatus): boolean {
  return CLIENT_VISIBLE_STATUSES.includes(status)
}
