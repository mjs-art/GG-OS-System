'use client'

import { Toaster } from 'sonner'

/**
 * El único `<Toaster>` de la app.
 *
 * Sonner renderiza cada aviso en TODAS las regiones montadas, así que dos
 * `<Toaster>` en el árbol duplican cada toast. Llegó a pasar: el Planner y
 * Volumen montaron el suyo por separado y en la página de cliente, que tiene
 * las dos secciones, cada aviso salía dos veces.
 *
 * Los estilos van por token y no por el tema de sonner: el suyo trae sombra y
 * esquinas redondeadas, y aquí no hay sombras.
 */
export function Avisos() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'type-mono border-line bg-surface text-fg rounded-xs border',
          description: 'text-fg-muted normal-case',
          actionButton: 'bg-accent text-on-accent',
        },
      }}
    />
  )
}
