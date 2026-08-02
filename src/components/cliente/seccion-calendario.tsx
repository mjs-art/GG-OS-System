import Link from 'next/link'
import { RejillaMes, type EntradaCalendario } from '@/components/calendario/rejilla-mes'
import { Display, EmptyState, Mono } from '@/components/ui/primitives'
import type { Cliente, Pilar } from '@/lib/datos/clientes'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Calendario del cliente.
 *
 * Misma rejilla que la página global, con los colores de los pilares en vez de
 * los de marca. La leyenda de pilares está aquí y no en la rejilla porque solo
 * tiene sentido en esta vista: en la global el color significa cliente.
 */
export function SeccionCalendario({
  cliente,
  mes,
  entradas,
  hoy,
}: {
  cliente: Cliente
  mes: MonthKey
  entradas: EntradaCalendario[]
  hoy: string
}) {
  const publicaciones = entradas.filter((e) => e.tipo === 'pieza').length
  const stories = entradas.filter((e) => e.tipo === 'story').length

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Calendario
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            {publicaciones} publicaciones y {stories} stories en {formatMonthKey(mes)}
          </p>
        </div>
        <Link
          href={`/calendario?mes=${mes}&cliente=${cliente.slug}`}
          className="type-mono text-fg-muted hover:text-accent-hot"
        >
          Ver en pantalla completa →
        </Link>
      </header>

      {cliente.pilares.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-4">
          {cliente.pilares.map((p: Pilar) => (
            <span key={p.id} className="flex items-center gap-2">
              <span aria-hidden className="h-3 w-1 shrink-0" style={{ backgroundColor: p.color }} />
              <Mono className="text-fg-muted">{p.name}</Mono>
            </span>
          ))}
        </div>
      )}

      {entradas.length === 0 ? (
        <EmptyState
          title={`Nada con fecha en ${formatMonthKey(mes)}`}
          body="Las piezas aparecen aquí en cuanto tengan fecha de publicación. Asígnalas arrastrándolas en el planner."
        />
      ) : (
        <RejillaMes mes={mes} hoy={hoy} entradas={entradas} />
      )}
    </>
  )
}
