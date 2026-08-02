'use client'

import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Display } from '@/components/ui/primitives'

/**
 * El cajón que entra desde la derecha.
 *
 * 520 px fijos en escritorio y ancho completo abajo de eso: en 375 px un panel
 * de 520 no cabe y se sale de la pantalla sin que nadie lo note en la máquina
 * de desarrollo.
 *
 * No hay librería de modal a propósito. Lo que un cajón necesita de verdad es
 * cerrar con Escape, recibir el foco al abrir y devolverlo al cerrar — tres
 * cosas que caben aquí y que se entienden leyéndolas.
 */
export function Drawer({
  abierto,
  onCerrar,
  titulo,
  subtitulo,
  acciones,
  children,
}: {
  abierto: boolean
  onCerrar: () => void
  titulo: string
  subtitulo?: ReactNode
  acciones?: ReactNode
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const cerrar = useRef<HTMLButtonElement>(null)
  const previo = useRef<Element | null>(null)

  useEffect(() => {
    if (!abierto) return

    previo.current = document.activeElement
    cerrar.current?.focus()

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', alTeclear)

    return () => {
      document.removeEventListener('keydown', alTeclear)
      // Devolver el foco a donde estaba: sin esto, cerrar el cajón deja el
      // tabulador al principio de la página y hay que recorrerla completa.
      if (previo.current instanceof HTMLElement) previo.current.focus()
    }
  }, [abierto, onCerrar])

  if (!abierto) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar el detalle"
        onClick={onCerrar}
        className="bg-bg/70 absolute inset-0 cursor-default"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="border-line bg-surface relative flex h-full w-full max-w-[520px] flex-col border-l"
      >
        <header className="border-line flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <Display as="h2" className="truncate text-lg">
              {titulo}
            </Display>
            {subtitulo && <div className="mt-1.5">{subtitulo}</div>}
          </div>
          <button
            ref={cerrar}
            type="button"
            onClick={onCerrar}
            className="text-fg-muted hover:text-fg shrink-0 rounded-xs p-1"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Cerrar</span>
          </button>
        </header>

        {acciones && <div className="border-line border-b px-5 py-3">{acciones}</div>}

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
