'use client'

import { useActionState, useState } from 'react'
import { decidirPieza, type EstadoDecision } from './decidir'

const INICIAL: EstadoDecision = { status: 'inicial' }

/**
 * Aprobar o pedir cambio.
 *
 * Pedir un cambio SIEMPRE exige decir cuál. No es una molestia de formulario:
 * la base tiene un CHECK que rechaza una decisión de tipo `cambios` sin nota,
 * porque "no me gusta" sin más le cuesta al estudio una ronda entera de
 * adivinanzas.
 */
export function AccionesPieza({
  clientId,
  pieceId,
  yaDecidida,
  acento,
}: {
  clientId: string
  pieceId: string
  yaDecidida: boolean
  acento: string
}) {
  const [pidiendoCambio, setPidiendoCambio] = useState(false)
  const [state, formAction, pending] = useActionState(
    decidirPieza.bind(null, clientId, pieceId),
    INICIAL,
  )

  if (state.status === 'listo') {
    return (
      <div className="border-line border-t px-5 py-4">
        <p className="type-mono text-ok">{state.message}</p>
      </div>
    )
  }

  return (
    <div className="border-line border-t px-5 py-4" data-print="hide">
      {yaDecidida && (
        <p className="type-mono text-fg-muted mb-3">
          Ya respondiste esta pieza. Puedes cambiar tu respuesta.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-3">
        {pidiendoCambio && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`nota-${pieceId}`} className="type-mono text-fg-muted">
              ¿Qué le cambiamos?
            </label>
            <textarea
              id={`nota-${pieceId}`}
              name="nota"
              rows={3}
              required
              disabled={pending}
              placeholder="Por ejemplo: el hook está bien pero cambia la foto por una de la barra llena."
              className="border-line bg-surface text-fg placeholder:text-fg-muted rounded-xs border px-3 py-2 text-[14px]"
            />
          </div>
        )}

        {state.status === 'error' && (
          <p role="alert" className="type-mono text-critical">
            {state.message}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!pidiendoCambio ? (
            <>
              <button
                type="submit"
                name="decision"
                value="aprobado"
                disabled={pending}
                className="type-mono text-on-accent rounded-xs px-3 py-2 disabled:opacity-40"
                style={{ backgroundColor: acento }}
              >
                {pending ? 'Guardando…' : 'Aprobar'}
              </button>
              <button
                type="button"
                onClick={() => setPidiendoCambio(true)}
                className="type-mono border-line hover:bg-surface rounded-xs border px-3 py-2"
              >
                Pedir cambio
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                name="decision"
                value="cambios"
                disabled={pending}
                className="type-mono border-line hover:bg-surface rounded-xs border px-3 py-2 disabled:opacity-40"
              >
                {pending ? 'Guardando…' : 'Mandar el cambio'}
              </button>
              <button
                type="button"
                onClick={() => setPidiendoCambio(false)}
                className="type-mono text-fg-muted hover:text-fg px-3 py-2"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  )
}
