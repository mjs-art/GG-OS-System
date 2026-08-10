import Link from 'next/link'
import { dolares } from '@/components/agentes/formato'
import { TarjetaAgente } from '@/components/agentes/tarjeta-agente'
import { Display, Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import type { PanelAgentes } from '@/lib/datos/agentes'

/**
 * AGENTES — una tarjeta por agente del registro.
 *
 * El selector de cliente de arriba no es un filtro cosmético: define a quién le
 * aplica el switch y contra qué tope se compara el gasto. Mezclar el costo de
 * todos los clientes con el tope de uno solo produciría una barra de
 * presupuesto que miente, y esa barra es la que decide si se sigue gastando.
 */
export interface TableroAgentesProps {
  panel: PanelAgentes
  /** La ruta de esta pantalla. Se usa para armar los links del selector. */
  basePath?: string
}

export function TableroAgentes({ panel, basePath = '/agentes' }: TableroAgentesProps) {
  const { agentes, clientes, clienteActivo } = panel

  const encendidos = agentes.filter((a) => a.encendidoEn > 0).length
  const costoTotal = agentes.reduce((suma, a) => suma + a.costoMesCents, 0)

  const sufijo = clienteActivo ? `?cliente=${clienteActivo.slug}` : ''

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Display as="h1" className="text-4xl">
          Agentes
        </Display>
        <Mono className="text-fg-muted">
          {agentes.length} agentes · {encendidos} encendidos · {dolares(costoTotal)} USD del mes
        </Mono>
        {encendidos === 0 && (
          // Cero encendidos no es un problema que reportar: es el estado de
          // fábrica. Se explica para que nadie "arregle" lo que no está roto.
          <p className="text-fg-muted max-w-prose text-[13px]">
            Los {agentes.length} están apagados, y así se entregan. Encender un agente es una
            decisión por cliente: préndelo en uno, mide costo, latencia y tasa de edición durante un
            mes completo, y hasta entonces enciende el segundo.
          </p>
        )}
      </header>

      {clientes.length > 0 && (
        <nav aria-label="Cliente al que le aplican los switches" className="flex flex-col gap-2">
          <Mono className="text-fg-muted">Configurando</Mono>
          <div className="flex flex-wrap gap-2">
            {/* Con un solo cliente, "Todos" y ese cliente son lo mismo y el
                chip solo confunde. */}
            {clientes.length > 1 && (
              <EnlaceCliente href={basePath} activo={clienteActivo === null}>
                Todos
              </EnlaceCliente>
            )}
            {clientes.map((cliente) => (
              <EnlaceCliente
                key={cliente.id}
                href={`${basePath}?cliente=${cliente.slug}`}
                activo={clienteActivo?.id === cliente.id}
              >
                {cliente.nombre}
              </EnlaceCliente>
            ))}
          </div>
        </nav>
      )}

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {agentes.map((metricas) => (
          <TarjetaAgente
            key={metricas.key}
            metricas={metricas}
            cliente={clienteActivo}
            // Con un cliente seleccionado solo hay una política, así que
            // "encendido en uno" y "encendido aquí" son lo mismo.
            encendidoAqui={metricas.encendidoEn > 0}
            href={`${basePath}/${metricas.key}${sufijo}`}
          />
        ))}
      </div>
    </div>
  )
}

function EnlaceCliente({
  href,
  activo,
  children,
}: {
  href: string
  activo: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'true' : undefined}
      className={cn(
        'type-mono rounded-xs border px-2.5 py-1.5 transition-colors duration-150 ease-out',
        activo ? 'border-accent bg-surface-2 text-fg' : 'border-line text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </Link>
  )
}
