import type { ChipTone } from '@/components/ui/primitives'

/**
 * Etiquetas y tonos de las cinco secciones de abajo.
 *
 * Este módulo **no lleva directiva** y es a propósito: lo importan tanto los
 * componentes de servidor como los de cliente. Si viviera dentro de un archivo
 * con `'use client'`, React le entregaría al servidor una referencia
 * serializable en vez del objeto, y el síntoma sería un
 * `TAREA_ESTADO_LABEL[x] is undefined` en producción, sin que TypeScript diga
 * nada. Ya pasó con `SECCIONES`.
 *
 * Los enums de la base van sin acento porque son identificadores de Postgres.
 * Aquí es donde recuperan la tilde antes de llegar a la pantalla.
 */

export type DependeDe = 'yo' | 'cliente' | 'agente'
export type EstadoTarea = 'pendiente' | 'en_curso' | 'bloqueada' | 'hecha'

export const DEPENDE_LABEL: Record<DependeDe, string> = {
  yo: 'Yo',
  cliente: 'Cliente',
  agente: 'Agente',
}

/**
 * Tres tonos distintos y no tres grises: la columna existe para separar de un
 * vistazo lo que se puede resolver hoy de lo que lleva días esperando al
 * cliente. Si los tres chips se vieran igual, la columna no serviría de nada.
 */
export const DEPENDE_TONE: Record<DependeDe, ChipTone> = {
  yo: 'accent',
  cliente: 'high',
  agente: 'agent',
}

export const TAREA_ESTADO_LABEL: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  hecha: 'Hecha',
}

export const TAREA_ESTADO_TONE: Record<EstadoTarea, ChipTone> = {
  pendiente: 'neutral',
  en_curso: 'medium',
  bloqueada: 'critical',
  hecha: 'ok',
}

/**
 * `brand_assets.kind` es texto libre en la base, así que esto es un mapa de
 * cortesía, no un `Record` exhaustivo: un kind que nadie etiquetó se muestra
 * tal cual en vez de desaparecer.
 */
const ARCHIVO_KIND_LABEL: Record<string, string> = {
  logo: 'Logo',
  tipografia: 'Tipografía',
  paleta: 'Paleta',
  web: 'Sitio web',
  red: 'Red social',
  imagenes: 'Banco de imágenes',
  accesos: 'Accesos',
  documento: 'Documento',
}

export function etiquetaDeArchivo(kind: string): string {
  return ARCHIVO_KIND_LABEL[kind] ?? kind
}

/** El `kind` que marca la tarjeta de accesos. Ahí solo va el link al gestor. */
export const KIND_ACCESOS = 'accesos'

/** El `kind` de la paleta: sus muestras se leen de `notes`. */
export const KIND_PALETA = 'paleta'

/**
 * Nombres de campo de `human_edits` en español. Son los mismos nombres de
 * columna que usa el drawer del planner, y ahí sí se ven en inglés porque son
 * llaves; en la lectura de aprendizaje se leen como prosa.
 */
const CAMPO_LABEL: Record<string, string> = {
  hook: 'Hook',
  copy_in: 'Copy in',
  copy_out: 'Copy out',
  cta: 'CTA',
  script: 'Guion',
  hashtags: 'Hashtags',
  idea: 'Idea',
}

export function etiquetaDeCampo(field: string): string {
  return CAMPO_LABEL[field] ?? field
}

/** Los tipos de regla que el formulario de "Agregar regla" sabe construir. */
export const TIPOS_DE_REGLA = [
  {
    valor: 'hashtags_exact',
    label: 'Número exacto de hashtags',
    verifica: 'codigo',
    pide: 'cantidad',
  },
  { valor: 'lowercase', label: 'Todo el copy en minúsculas', verifica: 'codigo', pide: null },
  { valor: 'banned_words', label: 'Palabras prohibidas', verifica: 'codigo', pide: 'palabras' },
  {
    valor: 'juicio',
    label: 'Regla de juicio (la revisa un modelo)',
    verifica: 'modelo',
    pide: null,
  },
] as const

export type TipoDeRegla = (typeof TIPOS_DE_REGLA)[number]['valor']
