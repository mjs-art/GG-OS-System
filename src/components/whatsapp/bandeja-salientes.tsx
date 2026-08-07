'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { aprobarYEnviarWhatsApp } from '@/components/whatsapp/acciones'
import {
  AreaTexto,
  Button,
  Card,
  Chip,
  Display,
  EmptyState,
  Mono,
} from '@/components/ui/primitives'
import type { HiloWhatsApp, SalienteWhatsApp } from '@/domain/whatsapp'
import { relativeDays } from '@/lib/time'

/**
 * BANDEJA DE SALIENTES — los borradores de WhatsApp que esperan aprobación.
 *
 * La regla #1 vive aquí en su forma más literal: nada sale sin que una persona
 * lo lea, lo edite si hace falta, y apriete "Aprobar y enviar". El texto es
 * editable a propósito —el borrador del agente es un punto de partida, no la
 * última palabra— y lo que se manda es lo que quedó al aprobar.
 *
 * El envío no es optimista: a diferencia de resolver un escalamiento, aquí sale
 * un mensaje a un cliente real. Se espera la confirmación del servidor antes de
 * quitar la tarjeta, y si n8n falla se dice y se puede reintentar.
 */

export interface BandejaSalientesProps {
  hilos: HiloWhatsApp[]
  /** ISO del reloj del servidor: el cliente no inventa fechas. */
  ahora: string
}

export function BandejaSalientes({ hilos, ahora }: BandejaSalientesProps) {
  const total = hilos.reduce((suma, h) => suma + h.salientes.length, 0)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Display as="h1" className="text-5xl">
          WhatsApp
        </Display>
        <Mono className="text-fg-muted" aria-live="polite">
          {total === 0
            ? 'Sin borradores pendientes'
            : `${total} ${total === 1 ? 'borrador' : 'borradores'} por revisar en ${hilos.length} ${
                hilos.length === 1 ? 'conversación' : 'conversaciones'
              }`}
        </Mono>
      </header>

      {hilos.length === 0 ? (
        <EmptyState
          title="Nada por enviar"
          body="Cuando un cliente escriba por WhatsApp, el agente de Cuenta deja aquí un borrador de respuesta para que lo revises. También puedes escribir uno a mano."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {hilos.map((hilo) => (
            <li key={hilo.conversationId}>
              <HiloTarjeta hilo={hilo} ahora={ahora} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HiloTarjeta({ hilo, ahora }: { hilo: HiloWhatsApp; ahora: string }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ id: string; mensaje: string } | null>(null)
  const [, iniciarEnvio] = useTransition()
  const textos = useRef(new Map<string, HTMLTextAreaElement>())

  function aprobar(saliente: SalienteWhatsApp) {
    if (enviando) return
    setAviso(null)
    setEnviando(saliente.id)

    const texto = textos.current.get(saliente.id)?.value ?? ''

    iniciarEnvio(async () => {
      const resultado = await aprobarYEnviarWhatsApp({ messageId: saliente.id, body: texto })
      setEnviando(null)

      if (resultado.ok) {
        router.refresh()
        return
      }
      setAviso({ id: saliente.id, mensaje: resultado.mensaje })
    })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <Display className="text-xl">{hilo.clienteNombre}</Display>
        <Mono className="text-fg-muted">{hilo.waPhone}</Mono>
      </div>

      {hilo.ultimoEntrante && (
        <div className="border-line border-l-[3px] pl-3">
          <Mono className="text-fg-muted">
            El cliente escribió ·{' '}
            {relativeDays(new Date(hilo.ultimoEntrante.createdAt), new Date(ahora))}
          </Mono>
          <p className="text-fg mt-1 text-[13px]">
            {hilo.ultimoEntrante.body ?? '(mandó un archivo, sin texto)'}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {hilo.salientes.map((saliente) => (
          <li key={saliente.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {saliente.authoredByAgent ? (
                <Chip tone="agent">borrador · {saliente.authoredByAgent}</Chip>
              ) : (
                <Chip tone="neutral">borrador</Chip>
              )}
              {saliente.status === 'aprobado' && <Chip tone="ok">aprobado · reintentar envío</Chip>}
              {saliente.mediaCount > 0 && (
                <Chip tone="neutral">
                  {saliente.mediaCount} {saliente.mediaCount === 1 ? 'adjunto' : 'adjuntos'}
                </Chip>
              )}
            </div>

            <label className="sr-only" htmlFor={`saliente-${saliente.id}`}>
              Borrador de respuesta para {hilo.clienteNombre}
            </label>
            <AreaTexto
              id={`saliente-${saliente.id}`}
              ref={(el) => {
                if (el) textos.current.set(saliente.id, el)
                else textos.current.delete(saliente.id)
              }}
              defaultValue={saliente.body ?? ''}
              rows={3}
            />

            {aviso?.id === saliente.id && (
              <p
                role="status"
                className="border-critical text-fg bg-surface rounded-xs border-l-[3px] px-3 py-2 text-[13px]"
              >
                {aviso.mensaje}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                onClick={() => aprobar(saliente)}
                disabled={enviando === saliente.id}
              >
                {enviando === saliente.id ? 'Enviando…' : 'Aprobar y enviar'}
              </Button>
              <Mono className="text-fg-muted text-[11px]">
                Se manda tal como quede el texto de arriba.
              </Mono>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
