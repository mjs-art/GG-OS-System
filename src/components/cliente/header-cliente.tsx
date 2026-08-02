import Link from 'next/link'
import { Button, Chip, Display, Mono } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import { addMonths, formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * Header fijo del dashboard de cliente.
 *
 * El selector de mes son dos `<Link>`, no botones con estado: el mes vive en
 * la URL. Así se comparte por link, sobrevive al refresh y el botón de atrás
 * del navegador hace lo que uno espera. Un `useState` aquí rompería las tres.
 */
export function HeaderCliente({
  cliente,
  mes,
  redes,
}: {
  cliente: Cliente
  mes: MonthKey
  redes: Array<{ platform: string; estado: 'ok' | 'warn' | 'bad' }>
}) {
  const anterior = addMonths(mes, -1)
  const siguiente = addMonths(mes, 1)

  return (
    <header className="bg-bg border-line sticky top-0 z-20 border-b">
      <div className="flex flex-wrap items-center gap-4 px-6 py-4">
        <span
          aria-hidden
          className="type-display grid size-10 shrink-0 place-items-center rounded-xs text-base"
          style={{
            backgroundColor: cliente.brandColor ?? 'var(--color-surface-2)',
            color: 'var(--color-on-accent)',
          }}
        >
          {cliente.name.charAt(0)}
        </span>

        <div className="min-w-0">
          <Display as="h1" className="truncate text-2xl">
            {cliente.name}
          </Display>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {cliente.handle && <Mono className="text-fg-muted">{cliente.handle}</Mono>}
            {cliente.tier && <Chip tone="neutral">{cliente.tier}</Chip>}
            {redes.map((r) => (
              <Chip
                key={r.platform}
                tone="neutral"
                dot={
                  r.estado === 'ok'
                    ? 'var(--color-ok)'
                    : r.estado === 'warn'
                      ? 'var(--color-high)'
                      : 'var(--color-accent-hot)'
                }
              >
                {r.platform}
              </Chip>
            ))}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="border-line flex items-center rounded-xs border">
            <Link
              href={`?mes=${anterior}`}
              aria-label={`Ir a ${formatMonthKey(anterior)}`}
              className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
            >
              ‹
            </Link>
            <Mono className="min-w-[9rem] px-2 text-center">{formatMonthKey(mes)}</Mono>
            <Link
              href={`?mes=${siguiente}`}
              aria-label={`Ir a ${formatMonthKey(siguiente)}`}
              className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
            >
              ›
            </Link>
          </div>

          {/* Importar es una operación de mudanza: se hace una vez por cliente
              y luego estorba. Por eso va como enlace discreto y no como botón
              compitiendo con los dos que sí se usan cada semana. */}
          <Link
            href={`/cliente/${cliente.slug}/importar`}
            className="type-mono text-fg-muted hover:text-fg px-2 py-2"
          >
            Importar de Notion
          </Link>

          <Button variant="secondary">Modo cliente</Button>
          <Button variant="primary">Presentar mes</Button>
        </div>
      </div>
    </header>
  )
}
