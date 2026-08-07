'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Building2,
  CalendarDays,
  Hash,
  Inbox,
  Search,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Mono } from '@/components/ui/primitives'
import { construirComandos, filtrarComandos, type IconoComando } from '@/domain/paleta'
import { SECCIONES } from '@/domain/secciones'
import { cn } from '@/lib/cn'

/**
 * Paleta de comandos (⌘K).
 *
 * Un solo lugar para saltar a cualquier cliente, sección o pantalla sin mouse.
 * Con doce secciones por cliente y varios clientes, la navegación es lo que más
 * tiempo come, y esto la vuelve dos teclas.
 *
 * Va en el layout, así que está en cada página del estudio. La lógica de qué
 * mostrar y cómo filtrar vive en `@/domain/paleta`, que sí se prueba; aquí solo
 * queda el teclado y el foco, que se prueban a mano.
 */

const ICONOS: Record<IconoComando, LucideIcon> = {
  bandeja: Inbox,
  clientes: Users,
  calendario: CalendarDays,
  agentes: Sparkles,
  ajustes: Settings,
  cliente: Building2,
  seccion: Hash,
}

export function PaletaComandos({ clientes }: { clientes: { slug: string; name: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()

  const [abierta, setAbierta] = useState(false)
  const [query, setQuery] = useState('')
  const [indice, setIndice] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // El cliente actual sale del pathname (/cliente/:slug), y su nombre de la
  // lista que ya tenemos — así las secciones se etiquetan sin otra consulta.
  const slugActual = useMemo(() => pathname.match(/^\/cliente\/([^/#?]+)/)?.[1] ?? null, [pathname])
  const nombreActual = useMemo(
    () => clientes.find((c) => c.slug === slugActual)?.name ?? null,
    [clientes, slugActual],
  )

  const comandos = useMemo(
    () =>
      construirComandos({
        clientes,
        clienteActualSlug: slugActual,
        clienteActualNombre: nombreActual,
        secciones: SECCIONES.map((s) => ({ id: s.id, label: s.label })),
      }),
    [clientes, slugActual, nombreActual],
  )

  const resultados = useMemo(() => filtrarComandos(comandos, query), [comandos, query])

  // El cursor nunca se queda fuera de la lista al teclear: si el filtro se
  // encoge, vuelve al principio en vez de apuntar a una fila que ya no existe.
  const indiceActivo = resultados.length === 0 ? -1 : Math.min(indice, resultados.length - 1)

  function abrir() {
    setQuery('')
    setIndice(0)
    setAbierta(true)
  }

  function cerrar() {
    setAbierta(false)
  }

  function elegir(href: string) {
    cerrar()
    router.push(href)
  }

  /* --- ⌘K global -------------------------------------------------------- */
  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      if ((evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault()
        setAbierta((previo) => !previo)
        setQuery('')
        setIndice(0)
      }
    }
    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [])

  // Al abrir, el foco va al input. En un efecto y no en el onClick porque el
  // input apenas existe cuando `abierta` pasa a true.
  useEffect(() => {
    if (abierta) inputRef.current?.focus()
  }, [abierta])

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Buscar y saltar (Command K)"
        className={cn(
          'border-line text-fg-muted hover:text-fg hover:border-accent flex items-center gap-2',
          'rounded-xs border px-3 py-1.5 transition-colors duration-150',
        )}
      >
        <Search aria-hidden className="size-3.5" />
        <span className="type-mono hidden sm:inline">Buscar</span>
        <Mono className="border-line ml-1 hidden rounded-xs border px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </Mono>
      </button>

      {abierta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Paleta de comandos"
        >
          {/* Scrim: oscurece sin ser una superficie del sistema. Cerrar al
              tocar fuera es lo que se espera de un modal como este. */}
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            onClick={cerrar}
            className="bg-bg/80 absolute inset-0 cursor-default"
          />

          <div className="border-line bg-surface relative w-full max-w-xl rounded-xs border">
            <div className="border-line flex items-center gap-3 border-b px-4 py-3">
              <Search aria-hidden className="text-fg-muted size-4 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(evento) => {
                  setQuery(evento.target.value)
                  setIndice(0)
                }}
                onKeyDown={(evento) => {
                  if (evento.key === 'Escape') {
                    evento.preventDefault()
                    cerrar()
                    return
                  }
                  if (evento.key === 'ArrowDown') {
                    evento.preventDefault()
                    setIndice((i) => Math.min(i + 1, resultados.length - 1))
                    return
                  }
                  if (evento.key === 'ArrowUp') {
                    evento.preventDefault()
                    setIndice((i) => Math.max(i - 1, 0))
                    return
                  }
                  if (evento.key === 'Enter') {
                    evento.preventDefault()
                    const elegido = resultados[indiceActivo]
                    if (elegido) elegir(elegido.href)
                  }
                }}
                placeholder="Ir a un cliente, una sección, una pantalla…"
                className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-[15px] outline-none"
              />
            </div>

            {resultados.length === 0 ? (
              <p className="text-fg-muted px-4 py-8 text-center text-[13px]">
                Nada con &ldquo;{query}&rdquo;. Prueba el nombre de un cliente o de una sección.
              </p>
            ) : (
              <ul className="max-h-[50vh] overflow-y-auto py-2">
                {resultados.map((comando, posicion) => {
                  const Icono = ICONOS[comando.icono]
                  const activo = posicion === indiceActivo
                  return (
                    <li key={comando.id}>
                      <button
                        type="button"
                        onMouseMove={() => setIndice(posicion)}
                        onClick={() => elegir(comando.href)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100',
                          activo ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg',
                        )}
                      >
                        <Icono
                          aria-hidden
                          className={cn('size-4 shrink-0', activo ? 'text-accent-hot' : '')}
                        />
                        <span className="text-fg flex-1 truncate text-[14px]">{comando.label}</span>
                        <Mono className="text-fg-muted shrink-0">{comando.grupo}</Mono>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="border-line text-fg-muted flex items-center gap-4 border-t px-4 py-2">
              <Mono className="text-[10px]">↑↓ moverse</Mono>
              <Mono className="text-[10px]">↵ ir</Mono>
              <Mono className="text-[10px]">esc cerrar</Mono>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
