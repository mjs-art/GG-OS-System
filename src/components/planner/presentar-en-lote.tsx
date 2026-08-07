'use client'

import { useMemo, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { presentarPiezasEnLote } from '@/components/planner/acciones'
import { Button, Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL, type PieceFormat } from '@/domain/labels'
import { cn } from '@/lib/cn'
import { formatDate } from '@/lib/time'

/**
 * Presentar al cliente en lote: mandar al portal todas las piezas revisadas de
 * un golpe, en vez de cambiarles el estado una por una.
 *
 * Es additivo a propósito: no toca el grid ni su drag-and-drop. La selección
 * vive en su propio modal —todas marcadas por default, porque lo normal es
 * presentar todo lo que ya se revisó— con un contador vivo para que se vea qué
 * se va a mandar antes de mandarlo. Al cliente solo llega lo que estaba en
 * `revisado`; esa garantía la vuelve a aplicar el servidor.
 */

export interface PiezaPresentable {
  id: string
  etiqueta: string
  format: PieceFormat
  publishAt: string | null
}

export function PresentarEnLote({
  slug,
  piezas,
  onPresentadas,
}: {
  slug: string
  piezas: readonly PiezaPresentable[]
  /** Actualiza el estado del planner en el acto con las que se presentaron. */
  onPresentadas: (ids: string[]) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set())
  const [enviando, setEnviando] = useState(false)

  const total = piezas.length

  function abrir() {
    // Todo marcado al abrir: presentar todo lo revisado es el caso común.
    setSeleccion(new Set(piezas.map((p) => p.id)))
    setAbierto(true)
  }

  function alternar(id: string) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa)
      if (siguiente.has(id)) siguiente.delete(id)
      else siguiente.add(id)
      return siguiente
    })
  }

  const seleccionadas = useMemo(
    () => piezas.filter((p) => seleccion.has(p.id)).map((p) => p.id),
    [piezas, seleccion],
  )

  async function presentar() {
    if (enviando || seleccionadas.length === 0) return
    setEnviando(true)

    const resultado = await presentarPiezasEnLote({ slug, ids: seleccionadas })
    setEnviando(false)

    if (!resultado.ok) {
      toast.error('No se pudieron presentar', { description: resultado.mensaje })
      return
    }

    if (resultado.presentadas === 0) {
      toast('Nada que presentar', {
        description: 'Esas piezas ya no estaban en revisado. Recarga el planner.',
      })
      return
    }

    onPresentadas(seleccionadas)
    setAbierto(false)
    toast.success(
      `${resultado.presentadas} ${resultado.presentadas === 1 ? 'pieza presentada' : 'piezas presentadas'} al cliente`,
      { description: 'Ya aparecen en el portal para aprobar o pedir cambios.' },
    )
  }

  return (
    <>
      <Button variant="secondary" onClick={abrir} disabled={total === 0}>
        <Send aria-hidden className="size-3.5" />
        Presentar al cliente
        {total > 0 && <span className="text-fg-muted">· {total}</span>}
      </Button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Presentar piezas al cliente"
        >
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            onClick={() => setAbierto(false)}
            className="bg-bg/80 absolute inset-0 cursor-default"
          />

          <div className="border-line bg-surface relative flex w-full max-w-lg flex-col rounded-xs border">
            <header className="border-line border-b px-5 py-4">
              <Mono className="text-fg-muted">Presentar al cliente</Mono>
              <p className="text-fg-muted mt-1 text-[13px]">
                Estas piezas ya están revisadas. Las que dejes marcadas pasan a{' '}
                <span className="text-fg">con cliente</span> y aparecen en el portal.
              </p>
            </header>

            <ul className="max-h-[45vh] overflow-y-auto px-5 py-2">
              {piezas.map((p) => {
                const marcada = seleccion.has(p.id)
                return (
                  <li key={p.id} className="border-line border-b last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => alternar(p.id)}
                        className="accent-accent size-4 shrink-0"
                      />
                      <span
                        className={cn('flex-1 truncate text-[14px]', !marcada && 'text-fg-muted')}
                      >
                        {p.etiqueta}
                      </span>
                      <Mono className="text-fg-muted shrink-0">
                        {PIECE_FORMAT_LABEL[p.format]}
                        {p.publishAt ? ` · ${formatDate(new Date(p.publishAt))}` : ''}
                      </Mono>
                    </label>
                  </li>
                )
              })}
            </ul>

            <footer className="border-line flex items-center justify-between gap-3 border-t px-5 py-3">
              <Mono className="text-fg-muted" aria-live="polite">
                {seleccionadas.length} de {total} seleccionadas
              </Mono>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  onClick={presentar}
                  disabled={enviando || seleccionadas.length === 0}
                >
                  {enviando ? 'Presentando…' : `Presentar ${seleccionadas.length}`}
                </Button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  )
}
