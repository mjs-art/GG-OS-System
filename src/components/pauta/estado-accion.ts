/**
 * El estado que comparten los formularios de Pauta.
 *
 * Vive fuera de `acciones.ts` porque un módulo con `'use server'` solo puede
 * exportar funciones asíncronas: cualquier `export const` ahí truena al
 * compilar, y el mensaje de React no dice cuál de los dos archivos está mal.
 */
export interface EstadoAccion {
  estado: 'inicial' | 'ok' | 'error'
  /** Vacío mientras nadie ha enviado nada. Nunca `undefined`. */
  mensaje: string
  /** Detalle por renglón de una importación. Vacío en el resto de los casos. */
  detalles: string[]
}

export const ACCION_INICIAL: EstadoAccion = { estado: 'inicial', mensaje: '', detalles: [] }

export function accionOk(mensaje: string, detalles: string[] = []): EstadoAccion {
  return { estado: 'ok', mensaje, detalles }
}

export function accionError(mensaje: string, detalles: string[] = []): EstadoAccion {
  return { estado: 'error', mensaje, detalles }
}
