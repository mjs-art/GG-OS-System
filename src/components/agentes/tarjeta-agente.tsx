import Link from 'next/link'
import { AGENTS } from '@/agents/registry'
import { dolares, porcentajeDelTope } from '@/components/agentes/formato'
import { Sparkline } from '@/components/agentes/sparkline'
import { SwitchAgente } from '@/components/agentes/switch-agente'
import { Chip, Display, Mono, ProgressBar } from '@/components/ui/primitives'
import { AGENT_LABEL } from '@/domain/labels'
import { cn } from '@/lib/cn'
import type { ClienteDeAgentes, EstadoAgente, MetricasAgente } from '@/lib/datos/agentes'

/**
 * Una tarjeta por agente.
 *
 * El nombre y la línea de "qué hace" salen de `@/agents/registry`: si mañana el
 * Redactor deja de escribir hashtags, la tarjeta lo dice sola.
 *
 * **Apagado es el estado normal.** Los ocho nacen apagados en el seed porque
 * encenderlos es una decisión consciente por cliente, así que aquí un agente
 * apagado se ve en muted y sin una sola señal de alarma. Lo que sí se ve fuerte
 * es la tasa de edición, que es la métrica que decide si vale la pena seguir.
 */

export interface TarjetaAgenteProps {
  metricas: MetricasAgente
  /** El cliente al que le aplica el switch. `null` = vista de todos los clientes. */
  cliente: ClienteDeAgentes | null
  /** Encendido para ESE cliente. Solo aplica cuando hay cliente. */
  encendidoAqui: boolean
  /** Ruta al detalle, con el cliente ya pegado si lo hay. */
  href: string
}

export function TarjetaAgente({ metricas, cliente, encendidoAqui, href }: TarjetaAgenteProps) {
  const { key, estado, trabajosHoy, escalamientosAbiertos, tasaEdicionPct, avisoPresupuesto } =
    metricas
  const pctTope = porcentajeDelTope(metricas.costoMesCents, metricas.topeMesCents)
  // Sin tope configurado (agente sin política) no hay nada de qué avisar: un
  // gasto de 0 contra tope 0 no es "agotado", es "sin configurar".
  const hayAviso = metricas.topeMesCents > 0 && avisoPresupuesto !== 'ok'

  return (
    <article className="border-line bg-surface flex flex-col gap-5 rounded-xs border p-5">
      <header className="flex items-start gap-3">
        <PuntoEstado estado={estado} />
        <div className="min-w-0 flex-1">
          <Display as="h2" className="text-xl">
            {AGENT_LABEL[key]}
          </Display>
          <p className="text-fg-muted mt-1.5 text-[13px] leading-snug">{AGENTS[key].description}</p>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
        <Numero valor={trabajosHoy} label="Trabajos hoy" />
        <Numero valor={escalamientosAbiertos} label="Escalamientos" />

        {/* La tasa de edición se lee más grande que las otras tres a propósito:
            es la que contesta "¿qué tanto hay que corregirle?", y una del 90%
            no significa que el modelo esté mal — significa que el Context Card
            está incompleto y que subirle el gasto sería tirar dinero. */}
        <div className="col-span-2">
          <dt className="sr-only">Tasa de edición</dt>
          <dd className="flex items-baseline gap-2">
            <Display className={cn('text-4xl', tasaEdicionPct === null && 'text-fg-muted')}>
              {tasaEdicionPct === null ? '—' : `${tasaEdicionPct}%`}
            </Display>
            <Mono className="text-fg-muted">Tasa de edición</Mono>
          </dd>
          <Mono className="text-fg-muted mt-1 block normal-case">
            {tasaEdicionPct === null
              ? 'Sin corridas que medir este mes.'
              : `${metricas.corridasMedidas} ${
                  metricas.corridasMedidas === 1 ? 'corrida medida' : 'corridas medidas'
                } este mes${tasaEdicionPct >= 70 ? ' · revisa el Context Card antes de subirle el gasto' : ''}`}
          </Mono>
        </div>

        <div className="col-span-2">
          <dt className="sr-only">Costo del mes</dt>
          <dd className="flex items-baseline justify-between gap-2">
            <Mono className="text-fg">
              {dolares(metricas.costoMesCents)} USD
              <span className="text-fg-muted"> / {dolares(metricas.topeMesCents)} de tope</span>
            </Mono>
            <Mono className="text-fg-muted">{pctTope}%</Mono>
          </dd>
          <ProgressBar
            className="mt-1.5"
            value={metricas.costoMesCents}
            max={Math.max(metricas.topeMesCents, 1)}
            tone={hayAviso ? 'accent' : 'muted'}
          />
          {hayAviso && (
            <div className="mt-2 flex flex-col gap-1">
              {avisoPresupuesto === 'agotado' ? (
                <Chip tone="critical" className="self-start">
                  tope del mes alcanzado
                </Chip>
              ) : (
                <Chip tone="high" className="self-start">
                  80% del tope
                </Chip>
              )}
              {avisoPresupuesto === 'agotado' && (
                <Mono className="text-fg-muted normal-case">
                  El agente no corre hasta el próximo mes o hasta subirle el tope.
                </Mono>
              )}
            </div>
          )}
        </div>
      </dl>

      <Sparkline
        valores={metricas.sparkline}
        etiqueta={`Corridas por día de los últimos ${metricas.sparkline.length} días`}
        className={estado === 'inactivo' ? 'text-fg-muted' : 'text-accent-hot'}
      />

      <footer className="border-line flex items-end justify-between gap-3 border-t pt-4">
        {cliente ? (
          <SwitchAgente
            agente={key}
            clienteId={cliente.id}
            clienteNombre={cliente.nombre}
            encendido={encendidoAqui}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <Mono className="text-fg-muted">
              Encendido en {metricas.encendidoEn} de {metricas.clientesConPolitica}
            </Mono>
            <Mono className="text-fg-muted normal-case opacity-70">
              Elige un cliente arriba para prenderlo o apagarlo.
            </Mono>
          </div>
        )}

        <Link
          href={href}
          className="type-mono border-line text-fg hover:bg-surface-2 shrink-0 rounded-xs border px-3 py-2 transition-colors duration-150"
        >
          Ver corridas
        </Link>
      </footer>
    </article>
  )
}

function Numero({ valor, label }: { valor: number; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <Display className="text-2xl">{valor}</Display>
        <Mono className="text-fg-muted mt-1 block">{label}</Mono>
      </dd>
    </div>
  )
}

const ESTADO_LABEL: Record<EstadoAgente, string> = {
  corriendo: 'Corriendo',
  con_errores: 'Con errores',
  inactivo: 'Inactivo',
}

/**
 * El punto de estado. `inactivo` va en muted y sin ruido: no es una falla, es
 * lo que se espera de un agente que nadie ha encendido todavía.
 */
export function PuntoEstado({ estado }: { estado: EstadoAgente }) {
  return (
    <span className="mt-1.5 inline-flex shrink-0 items-center">
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          estado === 'corriendo' && 'bg-accent animate-pulse [animation-duration:3s]',
          estado === 'con_errores' && 'bg-critical',
          estado === 'inactivo' && 'bg-fg-muted opacity-60',
        )}
      />
      <span className="sr-only">{ESTADO_LABEL[estado]}</span>
    </span>
  )
}
