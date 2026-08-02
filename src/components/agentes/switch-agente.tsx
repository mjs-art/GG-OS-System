'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { cambiarEstadoAgente, type EstadoSwitch } from '@/components/agentes/acciones'
import { Mono } from '@/components/ui/primitives'
import type { AgentKey } from '@/domain/labels'
import { cn } from '@/lib/cn'

/**
 * El interruptor de un agente, para UN cliente.
 *
 * No existe un switch "para todos los clientes" y no es un descuido: encender
 * un agente es una decisión consciente por cliente, con su tope de gasto y su
 * medición aparte. Un botón que los prende todos de un jalón es exactamente lo
 * que la operación no debe permitir.
 *
 * Es cliente solo por el mensaje de resultado. La mutación sigue siendo un
 * Server Action con validación Zod, y sin JavaScript el `<form>` funciona
 * igual: lo único que se pierde es el aviso en línea.
 */

const ESTADO_INICIAL: EstadoSwitch = { status: 'inicial' }

export function SwitchAgente({
  agente,
  clienteId,
  clienteNombre,
  encendido,
}: {
  agente: AgentKey
  clienteId: string
  clienteNombre: string
  encendido: boolean
}) {
  const [estado, accion] = useActionState(cambiarEstadoAgente, ESTADO_INICIAL)

  return (
    <form action={accion} className="flex flex-col gap-1.5">
      <input type="hidden" name="agente" value={agente} />
      <input type="hidden" name="clienteId" value={clienteId} />
      <input type="hidden" name="encender" value={encendido ? 'false' : 'true'} />

      <Palanca encendido={encendido} clienteNombre={clienteNombre} />

      {estado.status === 'error' && estado.mensaje && (
        <Mono role="status" className="text-critical max-w-[22ch] leading-relaxed">
          {estado.mensaje}
        </Mono>
      )}
    </form>
  )
}

/**
 * Va en su propio componente porque `useFormStatus` solo lee el estado del
 * `<form>` que lo contiene: llamado desde el mismo componente que renderiza el
 * form, siempre reportaría "no está enviando".
 */
function Palanca({ encendido, clienteNombre }: { encendido: boolean; clienteNombre: string }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      role="switch"
      aria-checked={encendido}
      disabled={pending}
      aria-label={`${encendido ? 'Apagar' : 'Encender'} para ${clienteNombre}`}
      className={cn(
        'group inline-flex items-center gap-2 rounded-xs',
        'transition-opacity duration-150 disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'border-line flex h-5 w-9 items-center rounded-xs border p-0.5',
          'transition-colors duration-150 ease-out',
          encendido ? 'bg-accent justify-end' : 'justify-start bg-transparent',
        )}
      >
        <span
          className={cn(
            'block size-3.5 rounded-xs transition-colors duration-150',
            encendido ? 'bg-on-accent' : 'bg-fg-muted',
          )}
        />
      </span>
      <Mono className={encendido ? 'text-fg' : 'text-fg-muted'}>
        {encendido ? 'Encendido' : 'Apagado'}
      </Mono>
    </button>
  )
}
