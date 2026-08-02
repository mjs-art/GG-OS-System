import type { ComponentProps, ReactNode } from 'react'
import { Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/**
 * Campos de formulario de la sección Pauta.
 *
 * Viven aquí y no en `primitives.tsx` porque este agente no es dueño de ese
 * archivo. En cuanto una segunda sección necesite un input, hay que subirlos
 * tal cual: no tienen nada de específico de pauta.
 *
 * Todo sale de tokens de rol. Un input con un gris de la paleta default de
 * Tailwind escrito a mano se queda gris cuando el fondo se vuelve crema, y eso
 * no se nota hasta que un cliente ve la captura. Hay una prueba que lo impide.
 */

const BASE_CAMPO = cn(
  'border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px]',
  'placeholder:text-fg-muted',
  'disabled:cursor-not-allowed disabled:opacity-40',
)

export function Campo({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <Mono className="text-fg-muted">{label}</Mono>
      {children}
      {hint && <span className="text-fg-muted text-[12px] normal-case">{hint}</span>}
    </label>
  )
}

export function Entrada({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(BASE_CAMPO, className)} {...props} />
}

export function Selector({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(BASE_CAMPO, className)} {...props} />
}

export function AreaTexto({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(BASE_CAMPO, 'resize-y', className)} {...props} />
}
