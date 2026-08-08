'use client'

import { CalendarDays, Inbox, MessageCircle, Settings, Sparkles, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Display, Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/**
 * Navegación global. 220px, colapsable a 64px.
 *
 * Es cliente solo por el estado de colapso y por `usePathname`. Todo lo que
 * pinta viene de props, así que colapsarla no vuelve a pedir nada al servidor.
 */

const ENLACES = [
  { href: '/', label: 'Bandeja', icon: Inbox },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/calendario', label: 'Calendario', icon: CalendarDays },
  { href: '/agentes', label: 'Agentes', icon: Sparkles },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
] as const

export function Sidebar({ pendientes = 0 }: { pendientes?: number }) {
  const [colapsado, setColapsado] = useState(false)
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'border-line bg-bg sticky top-0 flex h-dvh shrink-0 flex-col border-r transition-[width] duration-150 ease-out',
        colapsado ? 'w-16' : 'w-[220px]',
      )}
    >
      <div className="border-line flex h-14 items-center gap-3 border-b px-4">
        <Display className="text-accent-hot text-lg">AG</Display>
        {!colapsado && <Mono className="text-fg-muted truncate">Studio OS</Mono>}
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {ENLACES.map(({ href, label, icon: Icon }) => {
          // `/` solo está activo en exacto; los demás también en sus hijos.
          const activo = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? 'page' : undefined}
                title={colapsado ? label : undefined}
                className={cn(
                  'type-mono flex items-center gap-3 rounded-xs px-3 py-2.5 transition-colors duration-150',
                  activo ? 'bg-surface text-fg' : 'text-fg-muted hover:bg-surface hover:text-fg',
                )}
              >
                <Icon size={16} className="shrink-0" aria-hidden />
                {!colapsado && <span className="flex-1 truncate">{label}</span>}
                {href === '/' && pendientes > 0 && (
                  <span className="bg-accent text-on-accent rounded-xs px-1.5 py-0.5 text-[10px]">
                    {pendientes}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        onClick={() => setColapsado((v) => !v)}
        className="type-mono text-fg-muted hover:text-fg border-line border-t px-4 py-3 text-left"
        aria-expanded={!colapsado}
      >
        {colapsado ? '›' : '‹ Colapsar'}
      </button>
    </nav>
  )
}
