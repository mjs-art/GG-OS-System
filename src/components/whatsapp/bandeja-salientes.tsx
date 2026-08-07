'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import {
  adjuntarMediaWhatsApp,
  aprobarYEnviarWhatsApp,
  quitarMediaWhatsApp,
  registrarRetro,
} from '@/components/whatsapp/acciones'
import { RetroAbierta } from '@/components/whatsapp/retro-abierta'
import {
  AreaTexto,
  Button,
  Card,
  Chip,
  Display,
  EmptyState,
  Entrada,
  Mono,
} from '@/components/ui/primitives'
import { urlMostrableDeEnlace } from '@/domain/drive'
import type { HiloWhatsApp, RetroWhatsApp, SalienteWhatsApp } from '@/domain/whatsapp'
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
  /** La retro del cliente que falta resolver, debajo de los salientes. */
  retros: RetroWhatsApp[]
}

export function BandejaSalientes({ hilos, ahora, retros }: BandejaSalientesProps) {
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

      <RetroAbierta retros={retros} />
    </div>
  )
}

function HiloTarjeta({ hilo, ahora }: { hilo: HiloWhatsApp; ahora: string }) {
  const router = useRouter()
  const [retroEstado, setRetroEstado] = useState<'idle' | 'guardada'>('idle')
  const [retroError, setRetroError] = useState<string | null>(null)
  const [, iniciarEnvio] = useTransition()

  function guardarRetro() {
    const entrante = hilo.ultimoEntrante
    if (!entrante?.body) return
    const texto = entrante.body
    const mensajeId = entrante.id
    setRetroError(null)

    iniciarEnvio(async () => {
      const resultado = await registrarRetro({
        conversationId: hilo.conversationId,
        messageId: mensajeId,
        body: texto,
        kind: 'cambio',
      })
      if (resultado.ok) {
        setRetroEstado('guardada')
        router.refresh()
        return
      }
      setRetroError(resultado.mensaje)
    })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <Display className="text-xl">{hilo.clienteNombre}</Display>
        <Mono className="text-fg-muted">{hilo.waPhone}</Mono>
      </div>

      {hilo.ultimoEntrante && (
        <div className="border-line flex flex-col gap-2 border-l-[3px] pl-3">
          <Mono className="text-fg-muted">
            El cliente escribió ·{' '}
            {relativeDays(new Date(hilo.ultimoEntrante.createdAt), new Date(ahora))}
          </Mono>
          <p className="text-fg text-[13px]">
            {hilo.ultimoEntrante.body ?? '(mandó un archivo, sin texto)'}
          </p>
          {hilo.ultimoEntrante.body &&
            (retroEstado === 'guardada' ? (
              <Mono className="text-ok text-[11px]">Guardado en retro</Mono>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={guardarRetro}>
                  Guardar como retro
                </Button>
                {retroError && <Mono className="text-accent-hot text-[11px]">{retroError}</Mono>}
              </div>
            ))}
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {hilo.salientes.map((saliente) => (
          <li key={saliente.id}>
            <SalienteEditor saliente={saliente} clienteNombre={hilo.clienteNombre} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

/**
 * Un borrador editable: texto, adjuntos (fotos/propuestas por link) y el botón
 * de aprobar. Cada uno maneja su propio estado para que aprobar uno no bloquee
 * la edición de otro del mismo hilo.
 */
function SalienteEditor({
  saliente,
  clienteNombre,
}: {
  saliente: SalienteWhatsApp
  clienteNombre: string
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [, iniciar] = useTransition()
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const linkRef = useRef<HTMLInputElement>(null)

  function correr(accion: () => Promise<{ ok: true } | { ok: false; mensaje: string }>) {
    if (ocupado) return
    setAviso(null)
    setOcupado(true)
    iniciar(async () => {
      const resultado = await accion()
      setOcupado(false)
      if (resultado.ok) {
        router.refresh()
        return
      }
      setAviso(resultado.mensaje)
    })
  }

  function aprobar() {
    const body = textoRef.current?.value ?? ''
    correr(() => aprobarYEnviarWhatsApp({ messageId: saliente.id, body }))
  }

  function adjuntar() {
    const url = linkRef.current?.value.trim() ?? ''
    if (!url) return
    correr(async () => {
      const r = await adjuntarMediaWhatsApp({ messageId: saliente.id, url })
      if (r.ok && linkRef.current) linkRef.current.value = ''
      return r
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {saliente.authoredByAgent ? (
          <Chip tone="agent">borrador · {saliente.authoredByAgent}</Chip>
        ) : (
          <Chip tone="neutral">borrador</Chip>
        )}
        {saliente.status === 'aprobado' && <Chip tone="ok">aprobado · reintentar envío</Chip>}
      </div>

      <label className="sr-only" htmlFor={`saliente-${saliente.id}`}>
        Borrador de respuesta para {clienteNombre}
      </label>
      <AreaTexto
        id={`saliente-${saliente.id}`}
        ref={textoRef}
        defaultValue={saliente.body ?? ''}
        rows={3}
      />

      {/* Adjuntos ya anexados */}
      {saliente.media.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {saliente.media.map((adjunto, index) => (
            <li
              key={`${adjunto.url}-${index}`}
              className="border-line relative rounded-xs border p-1"
            >
              <Miniatura url={adjunto.url} caption={adjunto.caption ?? null} />
              <button
                type="button"
                onClick={() => correr(() => quitarMediaWhatsApp({ messageId: saliente.id, index }))}
                disabled={ocupado}
                aria-label="Quitar adjunto"
                className="bg-bg border-line text-fg-muted hover:text-fg absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full border text-[11px] disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Anexar por link (foto o propuesta en Drive) */}
      <div className="flex items-center gap-2">
        <Entrada
          ref={linkRef}
          type="url"
          inputMode="url"
          placeholder="Pega un link de Drive para adjuntar una foto o propuesta"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              adjuntar()
            }
          }}
        />
        <Button variant="secondary" onClick={adjuntar} disabled={ocupado}>
          Adjuntar
        </Button>
      </div>

      {aviso && (
        <p
          role="status"
          className="border-critical text-fg bg-surface rounded-xs border-l-[3px] px-3 py-2 text-[13px]"
        >
          {aviso}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button variant="primary" onClick={aprobar} disabled={ocupado}>
          {ocupado ? 'Enviando…' : 'Aprobar y enviar'}
        </Button>
        <Mono className="text-fg-muted text-[11px]">
          Se manda el texto de arriba con sus adjuntos.
        </Mono>
      </div>
    </div>
  )
}

/**
 * La miniatura de un adjunto. Un link de Drive se muestra por su thumbnail; un
 * enlace directo, tal cual. `unoptimized` porque el dominio no lo conocemos de
 * antemano. Si no carga, queda un recuadro con la leyenda — nunca una imagen
 * rota sin explicación.
 */
function Miniatura({ url, caption }: { url: string; caption: string | null }) {
  const [rota, setRota] = useState(false)

  if (rota) {
    return (
      <div className="bg-surface-2 flex size-20 items-center justify-center rounded-xs p-1 text-center">
        <Mono className="text-fg-muted text-[10px]">{caption ?? 'Adjunto'}</Mono>
      </div>
    )
  }

  return (
    <div className="relative size-20 overflow-hidden rounded-xs">
      <Image
        src={urlMostrableDeEnlace(url)}
        alt={caption ?? 'Adjunto'}
        fill
        sizes="80px"
        unoptimized
        onError={() => setRota(true)}
        className="object-cover"
      />
    </div>
  )
}
