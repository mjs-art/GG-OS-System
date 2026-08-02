'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Button, Display, Mono } from '@/components/ui/primitives'
import { formatDate } from '@/lib/time'
import { crearTareasDelDia } from './acciones'
import type { EntradaCalendario } from './rejilla-mes'

/**
 * El día del calendario, abierto.
 *
 * Muestra lo que ya hay programado ese día y un alta rápida de pendiente para
 * uno o varios clientes a la vez — sin salir del calendario ni pasar por el
 * perfil de cada cliente.
 */
export function ModalDia({
  fecha,
  entradas,
  clientes,
  onClose,
}: {
  /** `2026-09-14`. */
  fecha: string
  entradas: readonly EntradaCalendario[]
  clientes: readonly { id: string; name: string }[]
  onClose: () => void
}) {
  const dialogo = useRef<HTMLDivElement>(null)
  const previo = useRef<Element | null>(null)

  const unico = clientes.length === 1 ? clientes[0] : undefined
  const [titulo, setTitulo] = useState('')
  const [seleccionados, setSeleccionados] = useState<string[]>(unico ? [unico.id] : [])
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  useEffect(() => {
    previo.current = document.activeElement
    dialogo.current?.focus()

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', alTeclear)

    return () => {
      document.removeEventListener('keydown', alTeclear)
      if (previo.current instanceof HTMLElement) previo.current.focus()
    }
  }, [onClose])

  const fechaFormateada = formatDate(new Date(fecha), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  // `formatDate` da "domingo, 20 de septiembre": sentence case, no Title Case.
  // La clase `capitalize` de Tailwind pondría mayúscula en cada palabra.
  const etiquetaFecha = fechaFormateada.charAt(0).toUpperCase() + fechaFormateada.slice(1)

  function alternar(id: string) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function alGuardar() {
    if (!titulo.trim() || seleccionados.length === 0) return
    startTransition(async () => {
      const resultado = await crearTareasDelDia({ clientIds: seleccionados, titulo, fecha })
      if (resultado.ok) {
        setTitulo('')
        setMensaje(
          seleccionados.length > 1
            ? `Guardado para ${seleccionados.length} clientes.`
            : 'Pendiente guardado.',
        )
      } else {
        setMensaje(resultado.mensaje)
      }
    })
  }

  return (
    <div className="bg-bg/90 fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal-dia"
        tabIndex={-1}
        className="border-line bg-surface w-full max-w-md rounded-xs border p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <Display as="h2" id="titulo-modal-dia" className="text-lg">
            {etiquetaFecha}
          </Display>
          <Button variant="ghost" type="button" onClick={onClose} aria-label="Cerrar">
            Cerrar
          </Button>
        </div>

        {entradas.length > 0 && (
          <ul className="border-line mb-5 flex flex-col gap-2 border-b pb-5">
            {entradas.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[13px]">
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: e.color ?? 'var(--color-line)' }}
                />
                {e.etiqueta && <Mono className="text-fg-muted shrink-0">{e.etiqueta}</Mono>}
                {e.href ? (
                  <Link href={e.href} className="hover:text-accent-hot truncate" onClick={onClose}>
                    {e.titulo}
                  </Link>
                ) : (
                  <span className="truncate">{e.titulo}</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <Mono className="text-fg-muted">Qué hay que hacer</Mono>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Escribe el pendiente…"
              maxLength={300}
              className="border-line bg-bg focus:border-accent-hot rounded-xs border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>

          {clientes.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Mono className="text-fg-muted">Para</Mono>
              <div className="flex flex-wrap gap-2">
                {clientes.map((c) => (
                  <label
                    key={c.id}
                    className="border-line flex cursor-pointer items-center gap-1.5 rounded-xs border px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(c.id)}
                      onChange={() => alternar(c.id)}
                      className="accent-accent size-3.5"
                    />
                    <Mono>{c.name}</Mono>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mensaje && <Mono className="text-fg-muted">{mensaje}</Mono>}

          <Button
            variant="primary"
            type="button"
            disabled={pendiente || !titulo.trim() || seleccionados.length === 0}
            onClick={alGuardar}
          >
            {pendiente
              ? 'Guardando…'
              : seleccionados.length > 1
                ? `Guardar para ${seleccionados.length}`
                : 'Guardar pendiente'}
          </Button>
        </div>
      </div>
    </div>
  )
}
