'use client'

import { Layers } from 'lucide-react'
import { Chip, Mono } from '@/components/ui/primitives'
import type { GrupoEscalamiento, OpcionEscalamiento } from '@/domain/bandeja'
import { AGENT_LABEL } from '@/domain/labels'
import { cn } from '@/lib/cn'

/**
 * El acelerador de la Bandeja: cuando un agente hizo la misma pregunta en varias
 * piezas, se contesta una vez y se cierran todas.
 *
 * Vive arriba de la lista, no dentro de ella: es una decisión sobre un grupo,
 * no sobre la tarjeta que trae el cursor. Las tarjetas de abajo siguen ahí por
 * si alguna merece una respuesta distinta — el lote es un atajo, no un candado.
 */

export function LoteEscalamientos({
  grupos,
  claveEnCurso,
  onResolverLote,
}: {
  grupos: GrupoEscalamiento[]
  /** La clave del grupo cuyo lote está en camino al servidor. */
  claveEnCurso: string | null
  onResolverLote: (grupo: GrupoEscalamiento, opcion: OpcionEscalamiento) => void
}) {
  if (grupos.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {grupos.map((grupo) => {
        const enCurso = claveEnCurso === grupo.clave
        const total = grupo.escalamientos.length

        return (
          <article
            key={grupo.clave}
            style={{ borderLeftColor: 'var(--color-accent-hot)' }}
            className={cn(
              'border-line bg-surface rounded-xs border border-l-[3px] px-5 py-4',
              'transition-opacity duration-150 ease-out',
              enCurso && 'opacity-60',
            )}
          >
            <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="flex items-center gap-2">
                <Layers aria-hidden className="text-accent-hot size-3.5" />
                <Chip tone="agent">{AGENT_LABEL[grupo.agente]}</Chip>
              </span>
              <Mono className="text-fg">{total} piezas · misma pregunta</Mono>
            </header>

            <p className="mt-3 max-w-prose text-[15px] leading-relaxed">{grupo.pregunta}</p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {grupo.opciones.map((opcion) => (
                <button
                  key={opcion.key}
                  type="button"
                  disabled={enCurso}
                  onClick={() => onResolverLote(grupo, opcion)}
                  className={cn(
                    'type-mono border-accent text-fg hover:bg-surface-2 inline-flex items-center gap-2',
                    'rounded-xs border px-3 py-2 transition-colors duration-150 ease-out',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  {opcion.label}
                  <span className="text-fg-muted">· las {total}</span>
                </button>
              ))}
            </div>
          </article>
        )
      })}
    </div>
  )
}
