'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { resolverRetro } from '@/components/whatsapp/acciones'
import {
  AreaTexto,
  Button,
  Campo,
  Card,
  Chip,
  Display,
  Entrada,
  Mono,
  Selector,
} from '@/components/ui/primitives'
import type { RetroWhatsApp, TipoRetro } from '@/domain/whatsapp'

/**
 * RETRO ABIERTA — la retroalimentación del cliente que todavía no se resuelve.
 *
 * Resolver una retro es el momento en que se captura el aprendizaje: lo que el
 * cliente corrigió queda en `human_edits`, que es el criterio de la marca hecho
 * dato. Por eso el formulario ofrece registrarlo, aunque no cuelgue de una
 * pieza — un "no le digan clásico reinventado" es aprendizaje aunque sea del
 * mes en general.
 */

const TONO_POR_TIPO: Record<TipoRetro, 'ok' | 'high' | 'neutral'> = {
  aprobacion: 'ok',
  cambio: 'high',
  comentario: 'neutral',
}

const CAMPOS_APRENDIZAJE = [
  { valor: 'general', label: 'Criterio general' },
  { valor: 'hook', label: 'Hook' },
  { valor: 'copy_in', label: 'Texto en la pieza' },
  { valor: 'copy_out', label: 'Caption' },
  { valor: 'cta', label: 'CTA' },
] as const

export function RetroAbierta({ retros }: { retros: RetroWhatsApp[] }) {
  if (retros.length === 0) return null

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Display as="h2" className="text-2xl">
          Retro por resolver
        </Display>
        <Mono className="text-fg-muted">
          {retros.length} {retros.length === 1 ? 'pendiente' : 'pendientes'}. Al resolver, el
          aprendizaje queda guardado.
        </Mono>
      </header>

      <ul className="flex flex-col gap-4">
        {retros.map((retro) => (
          <li key={retro.id}>
            <RetroTarjeta retro={retro} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RetroTarjeta({ retro }: { retro: RetroWhatsApp }) {
  const router = useRouter()
  const [conAprendizaje, setConAprendizaje] = useState(false)
  const [resolviendo, setResolviendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [, iniciar] = useTransition()

  const resolucionRef = useRef<HTMLTextAreaElement>(null)
  const campoRef = useRef<HTMLSelectElement>(null)
  const antesRef = useRef<HTMLInputElement>(null)
  const despuesRef = useRef<HTMLTextAreaElement>(null)

  function resolver() {
    if (resolviendo) return
    setError(null)
    setResolviendo(true)

    const resolution = resolucionRef.current?.value ?? ''
    const edit = conAprendizaje
      ? {
          field: campoRef.current?.value ?? 'general',
          oldValue: antesRef.current?.value ?? null,
          newValue: despuesRef.current?.value ?? '',
        }
      : null

    iniciar(async () => {
      const resultado = await resolverRetro({
        feedbackId: retro.id,
        resolution,
        ...(edit ? { edit } : {}),
      })
      setResolviendo(false)
      if (resultado.ok) {
        router.refresh()
        return
      }
      setError(resultado.mensaje)
    })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <Display className="text-lg">{retro.clienteNombre}</Display>
        <Chip tone={TONO_POR_TIPO[retro.kind]}>{retro.kind}</Chip>
      </div>

      <p className="border-line text-fg border-l-[3px] pl-3 text-[13px]">{retro.body}</p>

      <Campo label="Qué hiciste con la retro">
        <AreaTexto
          ref={resolucionRef}
          rows={2}
          placeholder="Ajusté el copy y reprogramé la pieza."
        />
      </Campo>

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="accent-accent-hot"
          checked={conAprendizaje}
          onChange={(e) => setConAprendizaje(e.target.checked)}
        />
        <Mono className="text-fg-muted">Registrar aprendizaje de marca</Mono>
      </label>

      {conAprendizaje && (
        <div className="border-line flex flex-col gap-3 rounded-xs border border-dashed p-4">
          <Campo label="Sobre qué">
            <Selector ref={campoRef} defaultValue="general">
              {CAMPOS_APRENDIZAJE.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.label}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo label="Cómo decía (opcional)">
            <Entrada ref={antesRef} placeholder="clásico reinventado" />
          </Campo>
          <Campo label="Cómo debe decir">
            <AreaTexto ref={despuesRef} rows={2} placeholder="de la casa, sin llamarle clásico" />
          </Campo>
        </div>
      )}

      {error && (
        <p
          role="status"
          className="border-critical text-fg bg-surface rounded-xs border-l-[3px] px-3 py-2 text-[13px]"
        >
          {error}
        </p>
      )}

      <div>
        <Button variant="primary" onClick={resolver} disabled={resolviendo}>
          {resolviendo ? 'Resolviendo…' : 'Resolver'}
        </Button>
      </div>
    </Card>
  )
}
