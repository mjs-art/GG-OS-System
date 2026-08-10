'use client'

import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState, type FormEvent } from 'react'
import { Button, Campo, Entrada, Mono, Selector } from '@/components/ui/primitives'
import type { ClienteSelector } from '@/lib/datos/investigacion'

/**
 * Pega un link, corre el agente Investigador y refresca la lista de abajo.
 *
 * Va por `/api/jobs/investigador` y no por Server Action por la misma razón
 * que `CorrerAnalistaBoton`: el runner escribe con service_role, que solo se
 * permite en `api/jobs`. Sin estado optimista — lo que se muestra es lo que
 * el agente dejó registrado.
 */
type Respuesta =
  | { ok: true; tipo: 'resumen' }
  | { ok: true; tipo: 'escalado'; pregunta: string }
  | { ok: false; message: string }

function avisoDe(data: Respuesta): { tono: 'ok' | 'error'; texto: string } {
  if (!data.ok) return { tono: 'error', texto: data.message }
  if (data.tipo === 'escalado')
    return { tono: 'ok', texto: `El Investigador preguntó: ${data.pregunta}` }
  return { tono: 'ok', texto: 'Resumen listo.' }
}

export function FormularioInvestigacion({ clientes }: { clientes: ClienteSelector[] }) {
  const router = useRouter()
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [clientId, setClientId] = useState('')
  const [corriendo, setCorriendo] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  const correr = useCallback(
    async (evento: FormEvent<HTMLFormElement>) => {
      evento.preventDefault()
      setCorriendo(true)
      setAviso(null)

      let siguiente: { tono: 'ok' | 'error'; texto: string }
      try {
        const res = await fetch('/api/jobs/investigador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeUrl, clientId: clientId || null }),
        })
        siguiente = avisoDe((await res.json()) as Respuesta)
      } catch {
        siguiente = {
          tono: 'error',
          texto: 'No se pudo contactar al Investigador. Intenta de nuevo.',
        }
      }

      setCorriendo(false)
      setAviso(siguiente)
      if (siguiente.tono === 'ok') {
        setYoutubeUrl('')
        router.refresh()
      }
    },
    [youtubeUrl, clientId, router],
  )

  return (
    <form
      onSubmit={correr}
      className="border-line bg-surface flex flex-col gap-4 rounded-xs border p-5"
    >
      <Campo label="Link de YouTube">
        <Entrada
          type="url"
          required
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(evento) => setYoutubeUrl(evento.target.value)}
          disabled={corriendo}
        />
      </Campo>
      <Campo
        label="¿Es para un cliente en particular?"
        hint="Déjalo en blanco si es investigación general."
      >
        <Selector
          value={clientId}
          onChange={(evento) => setClientId(evento.target.value)}
          disabled={corriendo}
        >
          <option value="">Investigación general</option>
          {clientes.map((cliente) => (
            <option key={cliente.id} value={cliente.id}>
              {cliente.nombre}
            </option>
          ))}
        </Selector>
      </Campo>
      <div className="flex flex-wrap items-center gap-3" data-print="hide">
        <Button
          type="submit"
          variant="agent"
          disabled={corriendo || youtubeUrl.trim() === ''}
          aria-busy={corriendo}
        >
          {corriendo && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {corriendo ? 'Investigando' : 'Investigar'}
        </Button>
        {aviso && (
          <Mono role="status" className={aviso.tono === 'ok' ? 'text-fg-muted' : 'text-accent-hot'}>
            {aviso.texto}
          </Mono>
        )}
      </div>
    </form>
  )
}
