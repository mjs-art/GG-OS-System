import type { Metadata } from 'next'
import Link from 'next/link'
import { RejillaMes } from '@/components/calendario/rejilla-mes'
import { Chip, Display, EmptyState, Mono } from '@/components/ui/primitives'
import { fechaLocal } from '@/domain/calendario'
import { clientesDelCalendario, entradasDelMes } from '@/lib/datos/calendario'
import { mesActual } from '@/lib/datos/clientes'
import { addMonths, formatMonthKey, isMonthKey, systemClock, type MonthKey } from '@/lib/time'

export const metadata: Metadata = { title: 'Calendario' }

/**
 * El calendario de todo el estudio.
 *
 * Un mes, todos los clientes, cada uno con su color de marca. Es la vista que
 * responde "¿qué sale esta semana?" sin abrir once pestañas — y la que hace
 * evidente el problema real de una agencia: tres clientes publicando el mismo
 * jueves y ninguno el lunes.
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; cliente?: string }>
}) {
  const { mes: mesParam, cliente: clienteParam } = await searchParams
  const mes: MonthKey = mesParam && isMonthKey(mesParam) ? mesParam : mesActual(systemClock.now())
  const hoy = fechaLocal(systemClock.now())

  const clientes = await clientesDelCalendario(mes)
  const seleccionado = clientes.find((c) => c.slug === clienteParam)

  const entradas = await entradasDelMes(seleccionado ? { mes, clientId: seleccionado.id } : { mes })

  const enlaceMes = (m: MonthKey) =>
    `/calendario?mes=${m}${seleccionado ? `&cliente=${seleccionado.slug}` : ''}`

  const totalPiezas = entradas.filter((e) => e.tipo === 'pieza').length
  const totalStories = entradas.filter((e) => e.tipo === 'story').length

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Display as="h1" className="text-3xl">
            Calendario
          </Display>
          <Mono className="text-fg-muted mt-2 block">
            {totalPiezas} publicaciones · {totalStories} stories
            {seleccionado ? ` · ${seleccionado.name}` : ' · todos los clientes'}
          </Mono>
        </div>

        <div className="border-line flex items-center rounded-xs border">
          <Link
            href={enlaceMes(addMonths(mes, -1))}
            aria-label={`Ir a ${formatMonthKey(addMonths(mes, -1))}`}
            className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
          >
            ‹
          </Link>
          <Mono className="min-w-[9rem] px-2 text-center">{formatMonthKey(mes)}</Mono>
          <Link
            href={enlaceMes(addMonths(mes, 1))}
            aria-label={`Ir a ${formatMonthKey(addMonths(mes, 1))}`}
            className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
          >
            ›
          </Link>
        </div>
      </header>

      {/* Leyenda y filtro en el mismo control: cada chip dice de quién es el
          color y al mismo tiempo filtra. Dos widgets separados para lo mismo
          serían ruido. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/calendario?mes=${mes}`}>
          <Chip tone={seleccionado ? 'neutral' : 'accent'}>Todos</Chip>
        </Link>
        {clientes.map((c) => (
          <Link key={c.id} href={`/calendario?mes=${mes}&cliente=${c.slug}`}>
            <Chip
              tone={seleccionado?.id === c.id ? 'accent' : 'neutral'}
              dot={c.brandColor ?? 'var(--color-fg-muted)'}
            >
              {c.name}
              {c.piezas > 0 && <span className="text-fg-muted ml-1">{c.piezas}</span>}
            </Chip>
          </Link>
        ))}
      </div>

      {entradas.length === 0 ? (
        <EmptyState
          title={`Nada programado en ${formatMonthKey(mes)}`}
          body="Cuando las piezas tengan fecha de publicación van a aparecer aquí. Asígnalas desde el planner de cada cliente."
        />
      ) : (
        <RejillaMes mes={mes} hoy={hoy} entradas={entradas} />
      )}
    </main>
  )
}
