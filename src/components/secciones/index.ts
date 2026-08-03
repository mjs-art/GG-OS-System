/**
 * Las cinco secciones de abajo del dashboard de cliente.
 *
 * El barril solo re-exporta **componentes**. Nada de constantes: un valor que
 * cruza la frontera cliente/servidor desde un módulo con `'use client'` llega
 * como referencia serializable en vez del valor, y el error sale en runtime sin
 * que TypeScript diga nada. Las constantes compartidas viven en `etiquetas.ts`,
 * que no lleva directiva.
 */

export { SeccionRedes } from './seccion-redes'
export { SeccionReferencias } from './seccion-referencias'
export { SeccionMarca } from './seccion-marca'
export { SeccionArchivos } from './seccion-archivos'
export { SeccionPendientes } from './seccion-pendientes'
export { SeccionPrivado } from './seccion-privado'
