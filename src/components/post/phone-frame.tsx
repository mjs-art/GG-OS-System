import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Marco de teléfono para los previews de Instagram y TikTok.
 *
 * Es decorativo puro: da contexto visual de "así se ve en el celular" sin fingir
 * un dispositivo real. El notch, los bordes redondeados y el fondo oscuro hacen
 * que el preview se lea como app, no como imagen suelta.
 */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto max-w-[320px]', className)}>
      {/* Notch + barra superior */}
      <div className="bg-surface-2 mx-auto flex h-4 w-full items-center justify-center rounded-t-xl">
        <span aria-hidden className="bg-bg h-1 w-16 rounded-full" />
      </div>
      {/* Cuerpo del teléfono */}
      <div className="bg-bg border-line overflow-hidden border-x">{children}</div>
      {/* Barra inferior con home indicator */}
      <div className="bg-surface-2 border-line flex h-5 items-center justify-center rounded-b-xl border-x border-b">
        <span aria-hidden className="bg-fg-muted h-1 w-24 rounded-full opacity-30" />
      </div>
    </div>
  )
}
