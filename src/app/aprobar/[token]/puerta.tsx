'use client'

import { useActionState } from 'react'
import { pedirAccesoPortal, type EstadoPortal } from './actions'

const INICIAL: EstadoPortal = { status: 'inicial' }

/**
 * La puerta: pide el correo y manda la liga.
 *
 * La liga del portal se reenvía por WhatsApp todo el tiempo, así que por sí
 * sola no puede dar acceso. Este paso es lo que la vuelve inofensiva: sin el
 * buzón, la liga no sirve.
 */
export function PuertaPortal({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(pedirAccesoPortal.bind(null, token), INICIAL)

  return (
    <div
      data-tema="claro"
      className="bg-bg text-fg flex min-h-dvh items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-sm">
        <h1 className="type-display text-3xl">Aprobar el mes</h1>

        {state.status === 'enviado' ? (
          <div className="border-line bg-surface mt-8 border p-5">
            <p className="type-mono text-ok">Revisa tu correo</p>
            <p className="mt-3 text-[14px]">{state.message}</p>
          </div>
        ) : (
          <form action={formAction} className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="type-mono text-fg-muted">
                Tu correo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                disabled={pending}
                placeholder="tu@correo.com"
                className="border-line bg-surface text-fg placeholder:text-fg-muted rounded-xs border px-3 py-2.5 text-[14px] disabled:opacity-50"
                {...(state.status === 'error' ? { 'aria-invalid': true } : {})}
                aria-describedby={state.status === 'error' ? 'email-error' : undefined}
              />
            </div>

            {state.status === 'error' && (
              <p id="email-error" role="alert" className="type-mono text-critical">
                {state.message}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="type-mono bg-accent text-on-accent hover:bg-accent-hot rounded-xs px-3 py-2.5 disabled:opacity-40"
            >
              {pending ? 'Mandando…' : 'Mandar liga de acceso'}
            </button>

            <p className="text-fg-muted text-[13px]">
              Te llega una liga por correo. No hay contraseña que recordar.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
