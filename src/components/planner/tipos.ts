import type { PieceFormat, PieceStatus, Platform } from '@/domain/labels'

/**
 * Tipos y constantes compartidos del Planner.
 *
 * Este módulo NO lleva directiva, y eso es deliberado. Un `export const` que
 * vive en un archivo con `'use client'` y lo importa un Server Component no
 * llega como valor: llega como referencia serializable, y el error sale en
 * runtime con TypeScript callado. Misma razón por la que existe
 * `src/domain/secciones.ts`.
 */

export type { AssetSource, Cliente, Pieza, Pilar, Story } from '@/lib/datos/clientes'
// Solo tipos: `export type` se borra al compilar, así que los módulos
// `server-only` de los que salen nunca llegan al bundle del navegador.
export type { MiembroDelEstudio } from '@/lib/datos/equipo'
export type { SprintPlanner } from '@/lib/datos/planner'

/** Las URLs listas para pintar, por id de pieza. Las firma el servidor. */
export type UrlsDeAssets = Readonly<Record<string, string>>

export type SubVista = 'grid' | 'calendario' | 'tabla' | 'stories'

export const SUB_VISTAS: readonly { id: SubVista; label: string }[] = [
  { id: 'grid', label: 'Grid' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'tabla', label: 'Tabla' },
  { id: 'stories', label: 'Stories' },
]

export const FORMATOS: readonly PieceFormat[] = ['post', 'carrusel', 'reel']

export const PLATAFORMAS: readonly Platform[] = ['instagram', 'facebook', 'tiktok', 'linkedin']

export const ESTADOS: readonly PieceStatus[] = [
  'idea',
  'escrito',
  'revisado',
  'con_cliente',
  'aprobado',
  'publicado',
]

/**
 * Los cuatro botones de agente del drawer.
 *
 * `agente` es la llave del agente que haría el trabajo. La interfaz la usa para
 * decir con nombre cuál está apagado, en vez de un "no disponible" genérico.
 */
export const ACCIONES_DE_AGENTE = [
  { id: 'reescribir', label: 'Reescribir', agente: 'redactor' },
  { id: 'voz', label: 'Revisar voz', agente: 'editor_marca' },
  { id: 'plataforma', label: 'Adaptar plataforma', agente: 'redactor' },
  { id: 'guion', label: 'Proponer guion', agente: 'guionista' },
] as const

export type AccionDeAgente = (typeof ACCIONES_DE_AGENTE)[number]

/** Los campos del drawer que llevan chip de procedencia. Coinciden con `authored_by`. */
export const CAMPOS_CON_PROCEDENCIA = [
  'idea',
  'hook',
  'script',
  'copy_in',
  'copy_out',
  'cta',
  'hashtags',
] as const

export type CampoConProcedencia = (typeof CAMPOS_CON_PROCEDENCIA)[number]
