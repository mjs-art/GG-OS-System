'use client'

import { useActionState } from 'react'
import { Button, Card, Mono } from '@/components/ui/primitives'
import { enviarMagicLink, type EntrarState } from './actions'

const inicial: EntrarState = { status: 'inicial' }

export function FormularioEntrar({ destino }: { destino: string | undefined }) {
  const [state, formAction, pending] = useActionState(enviarMagicLink, inicial)

  if (state.status === 'enviado') {
    return (
      <Card>
        <Mono className="text-ok">Revisa tu correo</Mono>
        <p className="text-bone mt-3 text-[13px]">{state.message}</p>
      </Card>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {destino && <input type="hidden" name="destino" value={destino} />}

      <div className="flex flex-col gap-2">
        <Mono as="label" className="text-muted" {...{ htmlFor: 'email' }}>
          Correo
        </Mono>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          placeholder="tu@correo.com"
          className="border-line bg-ink-2 text-bone placeholder:text-muted rounded-xs border px-3 py-2.5 text-[14px] disabled:opacity-50"
          {...(state.status === 'error' ? { 'aria-invalid': true } : {})}
          aria-describedby={state.status === 'error' ? 'email-error' : undefined}
        />
      </div>

      {state.status === 'error' && (
        <Mono id="email-error" role="alert" className="text-burnt-hot">
          {state.message}
        </Mono>
      )}

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? 'Mandando…' : 'Mandar link'}
      </Button>
    </form>
  )
}
