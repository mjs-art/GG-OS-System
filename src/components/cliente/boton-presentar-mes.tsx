'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Display } from '@/components/ui/primitives'

/**
 * Único botón de cara al mes: abre un modal con el mismo Resumen que ya se ve
 * en la página, para enseñarlo en la llamada con el cliente sin salir de la
 * sección ni compartir la app completa. No hay portal de cliente todavía —
 * esto es Ana controlando su propia pantalla, no un enlace que alguien más abre.
 */
export function BotonPresentarMes({
  mesLabel,
  children,
}: {
  mesLabel: string
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const dialogo = useRef<HTMLDivElement>(null)
  const previo = useRef<Element | null>(null)

  useEffect(() => {
    if (!abierto) return

    previo.current = document.activeElement
    dialogo.current?.focus()

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('keydown', alTeclear)

    return () => {
      document.removeEventListener('keydown', alTeclear)
      if (previo.current instanceof HTMLElement) previo.current.focus()
    }
  }, [abierto])

  return (
    <>
      <Button variant="primary" type="button" onClick={() => setAbierto(true)}>
        Presentar mes
      </Button>

      {abierto && (
        <div className="bg-bg/90 fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
          <div
            ref={dialogo}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-presentar-mes"
            tabIndex={-1}
            className="border-line bg-surface w-full max-w-2xl rounded-xs border p-6"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <Display as="h2" id="titulo-presentar-mes" className="text-lg">
                {mesLabel}
              </Display>
              <Button
                variant="ghost"
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
              >
                Cerrar
              </Button>
            </div>

            {children}
          </div>
        </div>
      )}
    </>
  )
}
