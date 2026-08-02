'use client'

import { Mono } from '@/components/ui/primitives'
import { Pulso } from '@/components/planner/controles'
import { UMBRAL_DESVIACION, type SegmentoPilar } from '@/domain/planner'

/**
 * Balance de pilares: cómo quedó repartido el mes contra lo que dice el
 * Context Card.
 *
 * Va arriba del grid y no en una sección aparte porque la pregunta que
 * responde —"¿este mes está desbalanceado?"— se contesta mirando el grid, y
 * separar el número de la evidencia obliga a recordar el número.
 */
export function BarraPilares({ segmentos }: { segmentos: readonly SegmentoPilar[] }) {
  const total = segmentos.reduce((suma, s) => suma + s.piezas, 0)
  if (total === 0) return null

  return (
    <div className="mb-6">
      <div className="border-line flex h-7 w-full overflow-hidden rounded-xs border">
        {segmentos.map((s) => (
          <Pulso
            key={s.id}
            activo={s.excedido}
            className="border-line flex items-center justify-center overflow-hidden border-r last:border-r-0"
            style={{
              width: `${s.realPct}%`,
              // El color del pilar viene de la base como DATO, no del sistema
              // de diseño: por eso entra por `style` y no por una utilidad.
              backgroundColor: s.color ?? 'var(--color-surface-2)',
            }}
          >
            {s.realPct >= 8 && (
              <Mono className="text-on-accent px-1 whitespace-nowrap">
                {Math.round(s.realPct)}%
              </Mono>
            )}
          </Pulso>
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segmentos.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-1 shrink-0"
              style={{ backgroundColor: s.color ?? 'var(--color-line)' }}
            />
            <Mono className="text-fg">{s.nombre}</Mono>
            <Mono className="text-fg-muted">
              {Math.round(s.realPct)}% de {s.objetivoPct}%
            </Mono>
            <Mono className={s.excedido ? 'text-accent-hot' : 'text-fg-muted'}>
              {s.excedido
                ? `+${Math.round(s.desviacion)} pts sobre el objetivo`
                : Math.abs(s.desviacion) <= UMBRAL_DESVIACION
                  ? 'en rango'
                  : `${Math.round(s.desviacion)} pts`}
            </Mono>
          </li>
        ))}
      </ul>
    </div>
  )
}
