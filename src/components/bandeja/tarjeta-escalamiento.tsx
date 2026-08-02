'use client'

import { useState, type Ref } from 'react'
import { Chip, Mono } from '@/components/ui/primitives'
import type { Escalamiento, OpcionEscalamiento } from '@/domain/bandeja'
import {
  AGENT_LABEL,
  PIECE_FORMAT_LABEL,
  RULE_SEVERITY_LABEL,
  type RuleSeverity,
} from '@/domain/labels'
import { cn } from '@/lib/cn'
import { formatDate, relativeDays } from '@/lib/time'

/**
 * Una pregunta de un agente, con las opciones que él mismo propone.
 *
 * La tarjeta trata el escalamiento como **trabajo normal**: nada de iconos de
 * advertencia, nada de rojo de error. Lo único que cambia de color es la franja
 * de la izquierda, y solo dice qué tan urgente es, no que algo salió mal.
 */

/** La franja de 3px. Los colores salen de los tokens semánticos, por rol. */
const COLOR_SEVERIDAD: Record<RuleSeverity, string> = {
  critica: 'var(--color-critical)',
  alta: 'var(--color-high)',
  media: 'var(--color-medium)',
  baja: 'var(--color-ok)',
}

export interface TarjetaEscalamientoProps {
  escalamiento: Escalamiento
  /** El cursor del teclado está encima. */
  activa: boolean
  /** Se está colapsando: ya se resolvió y la lista se está vaciando. */
  saliendo: boolean
  /** La respuesta va en camino al servidor. */
  pendiente: boolean
  /** ISO del reloj del servidor. El cliente no crea fechas por su cuenta. */
  ahora: string
  onSeleccionar: () => void
  onResolver: (opcion: OpcionEscalamiento | null, respuesta: string) => void
  onPosponer: () => void
  onAbrir: () => void
  ref?: Ref<HTMLElement>
}

export function TarjetaEscalamiento({
  escalamiento,
  activa,
  saliendo,
  pendiente,
  ahora,
  onSeleccionar,
  onResolver,
  onPosponer,
  onAbrir,
  ref,
}: TarjetaEscalamientoProps) {
  const [respuesta, setRespuesta] = useState('')
  const { agente, cliente, pieza, opciones, severidad } = escalamiento

  return (
    // El colapso usa grid-rows de 1fr a 0fr: es la única forma de animar de
    // "alto automático" a cero sin medir el contenido a mano. Bajo
    // prefers-reduced-motion el CSS global deja la transición en 0.01ms y la
    // tarjeta simplemente desaparece.
    <li
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
        saliendo ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
      )}
      aria-hidden={saliendo}
    >
      <div className="overflow-hidden">
        <article
          ref={ref}
          tabIndex={-1}
          onMouseDown={onSeleccionar}
          onFocus={onSeleccionar}
          aria-current={activa ? 'true' : undefined}
          style={{ borderLeftColor: COLOR_SEVERIDAD[severidad] }}
          className={cn(
            'border-line rounded-xs border border-l-[3px] px-5 py-4',
            'transition-colors duration-150 ease-out',
            activa ? 'bg-surface-2 outline-accent-hot outline-1' : 'bg-surface',
            pendiente && 'opacity-60',
          )}
        >
          <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Chip tone="agent">{AGENT_LABEL[agente]}</Chip>
            <Mono className="text-fg">{cliente.nombre}</Mono>
            <Mono className="text-fg-muted">{cuandoLlego(escalamiento.creadoEn, ahora)}</Mono>
            <Mono className="text-fg-muted ml-auto">{RULE_SEVERITY_LABEL[severidad]}</Mono>
          </header>

          <div className="mt-4 flex items-start gap-4">
            {pieza && <Miniatura pieza={pieza} />}
            <p className="max-w-prose flex-1 text-[15px] leading-relaxed">
              {escalamiento.pregunta}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {opciones.map((opcion, i) => (
              <button
                key={opcion.key}
                type="button"
                disabled={pendiente}
                onClick={() => onResolver(opcion, respuesta.trim())}
                className={cn(
                  'type-mono border-line text-fg hover:bg-surface inline-flex items-center gap-2',
                  'rounded-xs border px-3 py-2 transition-colors duration-150 ease-out',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {/* El número es el atajo: se aprende usando el mouse. */}
                {i < 9 && <span className="text-fg-muted">{i + 1}</span>}
                {opcion.label}
              </button>
            ))}

            {pieza && (
              <button
                type="button"
                onClick={onAbrir}
                className="type-mono text-fg-muted hover:text-fg rounded-xs px-2 py-2 transition-colors duration-150"
              >
                Abrir la pieza
              </button>
            )}

            <button
              type="button"
              onClick={onPosponer}
              disabled={pendiente}
              className="type-mono text-fg-muted hover:text-fg ml-auto rounded-xs px-2 py-2 transition-colors duration-150 disabled:opacity-40"
            >
              Posponer
            </button>
          </div>

          <form
            className="mt-3 flex items-center gap-2"
            onSubmit={(evento) => {
              evento.preventDefault()
              const texto = respuesta.trim()
              if (texto.length === 0) return
              onResolver(null, texto)
            }}
          >
            <input
              type="text"
              value={respuesta}
              disabled={pendiente}
              onChange={(evento) => setRespuesta(evento.target.value)}
              placeholder="Responder al agente…"
              aria-label={`Responder a ${AGENT_LABEL[agente]} sobre ${cliente.nombre}`}
              className={cn(
                'border-line bg-bg text-fg placeholder:text-fg-muted min-w-0 flex-1 rounded-xs',
                'border px-3 py-2 text-[13px] transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            />
            <button
              type="submit"
              disabled={pendiente || respuesta.trim().length === 0}
              className={cn(
                'type-mono bg-accent text-on-accent hover:bg-accent-hot rounded-xs px-3 py-2',
                'transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              Responder
            </button>
          </form>
        </article>
      </div>
    </li>
  )
}

/**
 * La miniatura de 64px.
 *
 * Hoy `pieces` no guarda ninguna URL de imagen —los archivos viven en el drive
 * del cliente y la tabla solo sabe si llegaron—, así que la miniatura es el
 * color del pilar con el formato y el día encima. Es un dato real y ubica la
 * pieza de un vistazo; el día que haya thumbnail, se cambia solo este bloque.
 */
function Miniatura({ pieza }: { pieza: NonNullable<Escalamiento['pieza']> }) {
  const dia = pieza.publishAt ? formatDate(new Date(pieza.publishAt)) : 'sin fecha'

  return (
    <div
      className="border-line flex size-16 shrink-0 flex-col justify-between rounded-xs border p-1.5"
      style={{ borderLeftColor: pieza.color, borderLeftWidth: 3 }}
    >
      <Mono className="text-fg-muted text-[9px] leading-tight">
        {PIECE_FORMAT_LABEL[pieza.formato]}
      </Mono>
      <Mono className="text-fg text-[9px] leading-tight">{dia}</Mono>
    </div>
  )
}

/** "hoy · 4:20 p.m." cuando es de hoy; "hace 3 días" cuando no. */
function cuandoLlego(creadoEn: string, ahora: string): string {
  const cuando = new Date(creadoEn)
  const referencia = new Date(ahora)
  const relativo = relativeDays(referencia, cuando)
  return relativo === 'hoy' ? formatDate(cuando, { hour: 'numeric', minute: '2-digit' }) : relativo
}
