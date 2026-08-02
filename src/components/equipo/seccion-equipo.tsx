'use client'

import { useActionState, useTransition } from 'react'
import { Button, Card, Chip, Mono, SectionHeader } from '@/components/ui/primitives'
import { cancelarInvitacionAccion, invitarAccion, type EstadoInvitar } from './acciones'
import type { InvitacionPendiente, MiembroDelEstudio } from '@/lib/datos/equipo'

const INICIAL: EstadoInvitar = { status: 'inicial' }

/** Clases del design system, calcadas del formulario de alta de cliente. */
const CAMPO = 'border-line bg-bg text-fg type-mono w-full rounded-xs border p-2'

export function SeccionEquipo({
  orgId,
  equipo,
  invitaciones,
  esOwner,
}: {
  orgId: string
  equipo: MiembroDelEstudio[]
  invitaciones: InvitacionPendiente[]
  esOwner: boolean
}) {
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <SectionHeader
        id="equipo"
        title="Equipo"
        hint="Quién es del estudio y quién sigue invitado."
      />

      <Card className="flex flex-col gap-3 p-0">
        <ul className="divide-line divide-y">
          {equipo.map((m) => (
            <li key={m.userId} className="flex items-center justify-between px-5 py-3">
              <Mono>{m.nombre}</Mono>
              <Chip tone={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      {invitaciones.length > 0 && (
        <div className="flex flex-col gap-3">
          <Mono className="text-fg-muted">Invitaciones pendientes</Mono>
          <Card className="flex flex-col gap-0 p-0">
            <ul className="divide-line divide-y">
              {invitaciones.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Mono>{i.email}</Mono>
                    <Chip tone="neutral">{i.role}</Chip>
                  </div>
                  {esOwner && <CancelarInvitacion invitacionId={i.id} />}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {esOwner ? (
        <FormularioInvitar orgId={orgId} />
      ) : (
        <Mono className="text-fg-muted">Solo el owner puede invitar gente nueva al equipo.</Mono>
      )}
    </section>
  )
}

function FormularioInvitar({ orgId }: { orgId: string }) {
  const [estado, action, pendiente] = useActionState(invitarAccion, INICIAL)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="orgId" value={orgId} />

      <div className="flex flex-wrap gap-4">
        <label className="flex min-w-56 flex-1 flex-col gap-1.5">
          <Mono className="text-fg-muted">Correo</Mono>
          <input
            type="email"
            name="email"
            required
            maxLength={255}
            autoComplete="off"
            className={CAMPO}
            placeholder="persona@ejemplo.com"
          />
        </label>

        <label className="flex min-w-40 flex-col gap-1.5">
          <Mono className="text-fg-muted">Rol</Mono>
          <select name="role" className={CAMPO} defaultValue="staff">
            <option value="staff">staff</option>
            <option value="owner">owner</option>
          </select>
        </label>
      </div>

      {estado.status !== 'inicial' && (
        <div
          className="bg-surface-2 border-l-[3px] px-4 py-3"
          style={{
            borderLeftColor:
              estado.status === 'error' ? 'var(--color-accent-hot)' : 'var(--color-ok)',
          }}
          role="status"
          aria-live="polite"
        >
          <p className="text-[13px]">{estado.mensaje}</p>
        </div>
      )}

      <div>
        <Button variant="primary" type="submit" disabled={pendiente}>
          {pendiente ? 'Invitando…' : 'Invitar al equipo'}
        </Button>
      </div>
    </form>
  )
}

function CancelarInvitacion({ invitacionId }: { invitacionId: string }) {
  const [pendiente, empezar] = useTransition()

  return (
    <Button
      variant="ghost"
      type="button"
      disabled={pendiente}
      onClick={() => empezar(() => cancelarInvitacionAccion(invitacionId))}
    >
      {pendiente ? 'Cancelando…' : 'Cancelar'}
    </Button>
  )
}
