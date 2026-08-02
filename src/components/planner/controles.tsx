'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/**
 * Controles chicos del Planner: el segmented control y el pulso del balance.
 *
 * Viven aquí y no en `primitives.tsx` porque hasta ahora solo los usa esta
 * sección. En cuanto una segunda los necesite, se suben — una primitiva que
 * solo tiene un consumidor todavía no es una primitiva, es una suposición.
 */

/* --- Segmented control ----------------------------------------------------- */

export interface OpcionSegmento<T extends string> {
  id: T
  label: string
  /** Se muestra pegado al label, en el mismo mono pero atenuado. */
  contador?: number
}

export function SegmentedControl<T extends string>({
  opciones,
  valor,
  onCambio,
  etiqueta,
  className,
}: {
  opciones: readonly OpcionSegmento<T>[]
  valor: T
  onCambio: (id: T) => void
  /** Para lectores de pantalla: un grupo de botones sin nombre no se entiende. */
  etiqueta: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={etiqueta}
      className={cn('border-line inline-flex rounded-xs border', className)}
    >
      {opciones.map((o) => {
        const activo = o.id === valor
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onCambio(o.id)}
            className={cn(
              'type-mono border-line flex items-center gap-1.5 border-r px-3 py-1.5 last:border-r-0',
              'transition-colors duration-150 ease-out',
              activo
                ? 'bg-accent text-on-accent'
                : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
            )}
          >
            {o.label}
            {o.contador !== undefined && (
              <span className={activo ? 'opacity-70' : 'opacity-60'}>{o.contador}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* --- Interruptor de una sola cosa ------------------------------------------ */

export function Interruptor({
  activo,
  onCambio,
  children,
}: {
  activo: boolean
  onCambio: (activo: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={() => onCambio(!activo)}
      className={cn(
        'type-mono border-line inline-flex items-center gap-2 rounded-xs border px-3 py-1.5',
        'transition-colors duration-150 ease-out',
        activo ? 'border-accent text-accent-hot' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', activo ? 'bg-accent-hot' : 'bg-fg-muted opacity-50')}
      />
      {children}
    </button>
  )
}

/* --- Label de campo -------------------------------------------------------- */

/** El label en mono arriba del campo, con espacio a la derecha para el chip. */
export function LabelCampo({
  htmlFor,
  children,
  extra,
}: {
  htmlFor?: string
  children: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <Mono as="label" className="text-fg-muted" {...(htmlFor ? { htmlFor } : {})}>
        {children}
      </Mono>
      {extra}
    </div>
  )
}

/* --- Pulso ----------------------------------------------------------------- */

/**
 * Envoltura que hace latir a su hijo.
 *
 * Se anima con la Web Animations API en vez de una clase de CSS porque los
 * keyframes tendrían que vivir en `globals.css`, y una animación que solo usa
 * una sección no merece un token global. De paso se respeta
 * `prefers-reduced-motion` de verdad: si está activo, no se crea la animación
 * en lugar de acelerarla a cero.
 */
export function Pulso({
  activo,
  className,
  children,
  style,
}: {
  activo: boolean
  className?: string
  children?: ReactNode
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!activo || !el || typeof el.animate !== 'function') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const animacion = el.animate([{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], {
      duration: 1800,
      iterations: Infinity,
      easing: 'ease-in-out',
    })
    return () => animacion.cancel()
  }, [activo])

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  )
}

/* --- Sacudida -------------------------------------------------------------- */

/**
 * El tile tiembla y nada se mueve.
 *
 * Es la respuesta al candado: un toast solo no basta porque llega a otra parte
 * de la pantalla y la mirada está en el tile. El temblor dice "aquí no" en el
 * lugar donde ocurrió.
 */
export function sacudir(el: HTMLElement | null | undefined): void {
  if (!el || typeof el.animate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 280, easing: 'ease-out' },
  )
}
