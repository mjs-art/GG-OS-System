'use client'

import { useEffect, useState } from 'react'
import { SECCIONES } from '@/domain/secciones'
import { cn } from '@/lib/cn'

/**
 * Navegación lateral por anclas, con la sección activa marcada.
 *
 * El scroll-spy usa IntersectionObserver y no un listener de scroll: un
 * listener corre en cada píxel y con una página de doce secciones se siente.
 *
 * `rootMargin` recorta la ventana a una franja delgada bajo el header sticky.
 * Sin eso, dos secciones están visibles a la vez casi siempre y la marca
 * parpadea entre ellas.
 */

export function NavSecciones() {
  const [activa, setActiva] = useState<string>(SECCIONES[0]?.id ?? '')

  useEffect(() => {
    const observador = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActiva(visible.target.id)
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 },
    )

    for (const { id } of SECCIONES) {
      const el = document.getElementById(id)
      if (el) observador.observe(el)
    }

    return () => observador.disconnect()
  }, [])

  return (
    <nav
      aria-label="Secciones del cliente"
      // top-14 (3.5rem barra del layout) + ~4rem del HeaderCliente
      // (mt-4 + display text-xl + subtext + barra de mes con pb-4).
      // Si cambia la altura del header, ajustar este número.
      className="sticky top-[7.5rem] hidden h-fit w-40 shrink-0 lg:block"
      data-print="hide"
    >
      <ul className="flex flex-col">
        {SECCIONES.map(({ id, label, privado }) => {
          const esActiva = activa === id
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={esActiva ? 'true' : undefined}
                className={cn(
                  'type-mono flex items-center gap-2 border-l-2 py-1.5 pl-3 transition-colors duration-150',
                  esActiva
                    ? 'border-accent-hot text-fg'
                    : 'text-fg-muted hover:text-fg border-transparent',
                )}
              >
                {privado && (
                  <span aria-hidden className="text-[9px]">
                    🔒
                  </span>
                )}
                {label}
              </a>
            </li>
          )
        })}
      </ul>
      <p className="type-mono text-fg-muted mt-3 pl-3 opacity-60">solo tú</p>
    </nav>
  )
}
