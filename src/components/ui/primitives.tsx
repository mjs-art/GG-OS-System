import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ==========================================================================
   Primitivas del sistema de diseño.

   Si vas a escribir un hex, un border-gray-* o una sombra en un componente de
   feature, para: falta una primitiva aquí. Agrégala en este archivo.
   ========================================================================== */

/* --- Tipografía ---------------------------------------------------------- */

type TextProps = HTMLAttributes<HTMLElement>

export function Display({
  as: Tag = 'div',
  className,
  ...props
}: TextProps & { as?: 'h1' | 'h2' | 'h3' | 'div' | 'span' }) {
  return <Tag className={cn('type-display', className)} {...props} />
}

export function Mono({
  as: Tag = 'span',
  className,
  ...props
}: TextProps & { as?: 'span' | 'div' | 'p' | 'dt' | 'label' }) {
  return <Tag className={cn('type-mono', className)} {...props} />
}

/* --- Números grandes ------------------------------------------------------ */

export type Trend = 'up' | 'down' | 'flat'

/**
 * El bloque de número grande + label que se repite en Resumen, Redes y
 * Resultados. `trend` es la dirección del cambio; `isGood` dice si esa
 * dirección es buena — no siempre lo es: gasto en pauta que sube no es verde.
 */
export function Stat({
  value,
  label,
  delta,
  trend = 'flat',
  isGood,
  size = 'md',
  className,
}: {
  value: ReactNode
  label: string
  delta?: string
  trend?: Trend
  isGood?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const good = isGood ?? trend === 'up'
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Display
        className={cn(
          size === 'sm' && 'text-2xl',
          size === 'md' && 'text-4xl',
          size === 'lg' && 'text-6xl',
        )}
      >
        {value}
      </Display>
      <div className="flex items-baseline gap-2">
        <Mono className="text-fg-muted">{label}</Mono>
        {delta && (
          <Mono
            className={cn(
              trend === 'flat' && 'text-fg-muted',
              trend !== 'flat' && (good ? 'text-ok' : 'text-accent-hot'),
            )}
          >
            {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '·'} {delta}
          </Mono>
        )}
      </div>
    </div>
  )
}

/* --- Superficies ---------------------------------------------------------- */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('border-line bg-surface rounded-xs border p-5', className)} {...props} />
  )
}

export function Divider({ className, ...props }: ComponentProps<'hr'>) {
  return <hr className={cn('border-line border-0 border-b', className)} {...props} />
}

export function SectionHeader({
  id,
  title,
  action,
  hint,
}: {
  id: string
  title: string
  action?: ReactNode
  hint?: string
}) {
  return (
    <header id={id} className="border-line mb-6 scroll-mt-24 border-b pb-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Display as="h2" className="text-xl">
            {title}
          </Display>
          {hint && <p className="text-fg-muted mt-1 text-[13px]">{hint}</p>}
        </div>
        {action}
      </div>
    </header>
  )
}

/* --- Chips ---------------------------------------------------------------- */

export type ChipTone = 'neutral' | 'accent' | 'critical' | 'high' | 'medium' | 'ok' | 'agent'

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'border-line text-fg-muted',
  accent: 'border-accent text-accent-hot',
  critical: 'border-critical/50 text-critical',
  high: 'border-high/50 text-high',
  medium: 'border-medium/50 text-medium',
  ok: 'border-ok/50 text-ok',
  // Todo lo escrito por un agente lleva este chip. Nunca se oculta la
  // procedencia dentro del estudio: el modo cliente sí lo omite por completo.
  agent: 'border-line bg-surface-2 text-fg-muted',
}

export function Chip({
  tone = 'neutral',
  dot,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { tone?: ChipTone; dot?: string }) {
  return (
    <span
      className={cn(
        'type-mono inline-flex items-center gap-1.5 rounded-xs border px-2 py-1',
        CHIP_TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      )}
      {children}
    </span>
  )
}

/** Punto de semáforo. `label` es obligatorio: el color solo no es accesible. */
export function StatusDot({
  status,
  label,
  size = 8,
}: {
  status: 'ok' | 'warn' | 'bad'
  label: string
  size?: number
}) {
  const color = status === 'ok' ? 'bg-ok' : status === 'warn' ? 'bg-high' : 'bg-accent-hot'
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn('shrink-0 rounded-full', color)}
        style={{ width: size, height: size }}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/* --- Botones -------------------------------------------------------------- */

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: 'primary' | 'secondary' | 'ghost' | 'agent' }) {
  return (
    <button
      className={cn(
        'type-mono inline-flex items-center gap-2 rounded-xs px-3 py-2 transition-colors duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-40',
        // `text-on-accent` y no `text-fg`: el fondo es rojo oscuro en los dos
        // temas, así que el texto no puede seguir al tema.
        variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-hot',
        variant === 'secondary' && 'border-line text-fg hover:bg-surface-2 border',
        variant === 'ghost' && 'text-fg-muted hover:text-fg',
        // Botón que dispara un agente. El asterisco es la marca de "esto lo
        // escribe una máquina y tú lo revisas".
        variant === 'agent' && 'border-line text-fg hover:bg-surface-2 border',
        className,
      )}
      {...props}
    >
      {variant === 'agent' && <span aria-hidden className="bg-accent-hot size-1.5 rounded-full" />}
      {props.children}
    </button>
  )
}

/* --- Estados -------------------------------------------------------------- */

/**
 * Un estado vacío siempre dice qué hacer. "Sin datos" no es un estado vacío,
 * es una disculpa.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="border-line flex flex-col items-start gap-3 rounded-xs border border-dashed p-8">
      <Display className="text-lg">{title}</Display>
      <p className="text-fg-muted max-w-prose text-[13px]">{body}</p>
      {action}
    </div>
  )
}

/** Barra hairline de progreso. `max` de 0 se trata como vacío, no como NaN. */
export function ProgressBar({
  value,
  max,
  tone = 'accent',
  className,
}: {
  value: number
  max: number
  tone?: 'accent' | 'ok' | 'muted'
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div
      className={cn('border-line h-1.5 w-full overflow-hidden rounded-xs border', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <div
        className={cn(
          'h-full transition-[width] duration-150 ease-out',
          tone === 'accent' && 'bg-accent',
          tone === 'ok' && 'bg-ok',
          tone === 'muted' && 'bg-fg-muted',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
