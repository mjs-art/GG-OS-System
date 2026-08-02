import type { Metadata } from 'next'
import Link from 'next/link'
import { Display, EmptyState, Mono, ProgressBar } from '@/components/ui/primitives'
import { listarClientes, mesActual, type ResumenCliente } from '@/lib/datos/clientes'
import { formatDate, formatMonthKey, isMonthKey, systemClock, type MonthKey } from '@/lib/time'

export const metadata: Metadata = { title: 'Clientes' }

/**
 * El estado que se muestra por cliente sale de sus piezas, no de una columna.
 *
 * Guardarlo en la base sería un dato derivado que se desincroniza en cuanto
 * alguien mueve una pieza: el estado ES la forma del pipeline.
 */
function estadoDe(c: ResumenCliente): { texto: string; tono: string } {
  if (c.totalMes === 0) return { texto: 'Sin plan', tono: 'text-fg-muted' }
  if (c.pipeline.con_cliente > 0) return { texto: 'Con el cliente', tono: 'text-high' }
  if (c.pipeline.idea > 0) return { texto: 'Falta escribir', tono: 'text-accent-hot' }
  if (c.aprobadas === c.totalMes) return { texto: 'Al día', tono: 'text-ok' }
  return { texto: 'En revisión', tono: 'text-fg-muted' }
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const { mes: mesParam } = await searchParams
  const mes: MonthKey = mesParam && isMonthKey(mesParam) ? mesParam : mesActual(systemClock.now())

  const clientes = await listarClientes(mes)

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <Display as="h1" className="text-3xl">
            Clientes
          </Display>
          <Mono className="text-fg-muted mt-2 block">
            {clientes.length} activos · {formatMonthKey(mes)}
          </Mono>
        </div>
      </header>

      {clientes.length === 0 ? (
        <EmptyState
          title="Todavía no hay clientes"
          body="Cuando des de alta el primero, aquí vas a ver su avance del mes de un vistazo."
        />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-line border-b">
              {['Cliente', 'Redes', 'Avance del mes', 'Estado', 'Próxima'].map((h) => (
                <th key={h} className="type-mono text-fg-muted pb-2 font-medium">
                  {h}
                </th>
              ))}
              <th className="sr-only">Abrir</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => {
              const estado = estadoDe(c)
              return (
                <tr key={c.id} className="border-line hover:bg-surface group border-b">
                  <td className="py-3">
                    <Link
                      href={`/cliente/${c.slug}?mes=${mes}`}
                      className="flex items-center gap-3"
                    >
                      <span
                        aria-hidden
                        className="type-display grid size-8 shrink-0 place-items-center rounded-xs text-[13px]"
                        style={{
                          backgroundColor: c.brandColor ?? 'var(--color-surface-2)',
                          color: 'var(--color-on-accent)',
                        }}
                      >
                        {c.name.charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <Display className="block truncate text-[15px]">{c.name}</Display>
                        {c.handle && (
                          <Mono className="text-fg-muted block truncate">{c.handle}</Mono>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="py-3">
                    <Mono className="text-fg-muted">{c.tier ?? '—'}</Mono>
                  </td>
                  <td className="w-48 py-3 pr-6">
                    <ProgressBar value={c.aprobadas} max={c.totalMes} />
                    <Mono className="text-fg-muted mt-1.5 block">
                      {c.aprobadas} de {c.totalMes} listas
                    </Mono>
                  </td>
                  <td className="py-3">
                    <Mono className={estado.tono}>{estado.texto}</Mono>
                  </td>
                  <td className="py-3">
                    <Mono className="text-fg-muted">
                      {c.proximaPublicacion
                        ? formatDate(new Date(c.proximaPublicacion))
                        : 'sin fecha'}
                    </Mono>
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      href={`/cliente/${c.slug}?mes=${mes}`}
                      className="type-mono text-fg-muted group-hover:text-accent-hot"
                    >
                      Abrir →
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </main>
  )
}
