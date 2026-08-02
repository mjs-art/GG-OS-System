import Link from 'next/link'
import { AGENTS } from '@/agents/registry'
import { DISPARADOR_LABEL, DISPARADORES, promptDeSistema } from '@/components/agentes/catalogo'
import { BitacoraCorridas, type CorridaVista } from '@/components/agentes/bitacora-corridas'
import { dolares, duracion, tokens } from '@/components/agentes/formato'
import { PuntoEstado } from '@/components/agentes/tarjeta-agente'
import { Chip, Display, Mono } from '@/components/ui/primitives'
import { AGENT_LABEL } from '@/domain/labels'
import type { CorridaBitacora, DetalleAgente as DatosDetalle } from '@/lib/datos/agentes'
import { formatDate, formatTime } from '@/lib/time'

/**
 * La pantalla de un agente: cómo está instruido, cuándo debería correr y todo
 * lo que ha corrido.
 *
 * Los tres bloques contestan las tres preguntas que se hacen cuando un agente
 * se porta raro, en el orden en que se hacen: qué le pedimos, cuándo lo
 * despertamos, y qué hizo la última vez.
 */

export interface DetalleAgenteProps {
  detalle: DatosDetalle
  basePath?: string
}

/**
 * Cuánto JSON se manda al navegador por corrida.
 *
 * Una entrada del Estratega con 90 días de rendimiento son decenas de KB; con
 * cincuenta corridas eso es media pantalla de payload que casi nadie abre. Se
 * recorta y se dice que está recortado — una bitácora que miente sobre lo que
 * enseña no sirve para auditar.
 */
const LIMITE_JSON = 8000

export function DetalleAgente({ detalle, basePath = '/agentes' }: DetalleAgenteProps) {
  const { key, metricas, corridas, clienteActivo } = detalle
  const sufijo = clienteActivo ? `?cliente=${clienteActivo.slug}` : ''

  const vista = corridas.map(aVista)

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Link href={`${basePath}${sufijo}`} className="type-mono text-fg-muted hover:text-fg w-fit">
          ← Agentes
        </Link>

        <header className="flex items-start gap-3">
          <PuntoEstado estado={metricas.estado} />
          <div>
            <Display as="h1" className="text-4xl">
              {AGENT_LABEL[key]}
            </Display>
            <p className="text-fg-muted mt-2 max-w-prose text-[13px]">{AGENTS[key].description}</p>
          </div>
        </header>

        <div className="border-line flex flex-wrap gap-x-8 gap-y-2 border-t pt-4">
          <DatoDeCabecera label="Trabajos hoy" valor={String(metricas.trabajosHoy)} />
          <DatoDeCabecera label="Escalamientos" valor={String(metricas.escalamientosAbiertos)} />
          <DatoDeCabecera
            label="Tasa de edición"
            valor={metricas.tasaEdicionPct === null ? '—' : `${metricas.tasaEdicionPct}%`}
          />
          <DatoDeCabecera
            label="Costo del mes"
            valor={`${dolares(metricas.costoMesCents)} de ${dolares(metricas.topeMesCents)} USD`}
          />
          {clienteActivo && <DatoDeCabecera label="Cliente" valor={clienteActivo.nombre} />}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Display as="h2" className="text-xl">
            Prompt de sistema
          </Display>
          <Mono className="text-fg-muted">solo lectura</Mono>
        </div>
        <p className="text-fg-muted max-w-prose text-[13px]">
          Está generado del contrato de{' '}
          <code className="font-mono text-[12px]">src/agents/registry.ts</code>: sale de la
          descripción del agente y de los campos que tiene permitido escribir, así que no se puede
          desincronizar del código. El prompt afinado y versionado llega con el proveedor real; hoy
          el estudio corre en modo mock y no hay ni una llamada de red a un modelo.
        </p>
        <textarea
          readOnly
          spellCheck={false}
          aria-label={`Prompt de sistema del ${AGENT_LABEL[key]}`}
          value={promptDeSistema(key)}
          rows={20}
          className="border-line bg-bg text-fg w-full resize-y rounded-xs border p-4 font-mono text-[12px] leading-relaxed"
        />
      </section>

      <section className="flex flex-col gap-3">
        <Display as="h2" className="text-xl">
          Disparadores
        </Display>
        <p className="text-fg-muted max-w-prose text-[13px]">
          Los de calendario todavía no corren solos: la cola de trabajos y el cron llegan con el
          proveedor real. Se listan porque son parte de cómo se opera este agente, no porque ya
          estén vivos.
        </p>
        <ul className="flex flex-col">
          {DISPARADORES[key].map((disparador) => (
            <li
              key={disparador.cuando}
              className="border-line flex flex-wrap items-center gap-3 border-b py-3 last:border-b-0"
            >
              <Chip tone={disparador.tipo === 'cron' ? 'accent' : 'neutral'}>
                {DISPARADOR_LABEL[disparador.tipo]}
              </Chip>
              <span className="text-[13px]">{disparador.cuando}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Display as="h2" className="text-xl">
            Bitácora de corridas
          </Display>
          <Mono className="text-fg-muted">
            {vista.length === 0
              ? 'sin corridas'
              : `últimas ${vista.length}${clienteActivo ? ` · ${clienteActivo.nombre}` : ''}`}
          </Mono>
        </div>
        <BitacoraCorridas corridas={vista} />
      </section>
    </div>
  )
}

function DatoDeCabecera({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Mono className="text-fg-muted">{label}</Mono>
      <Mono className="text-fg">{valor}</Mono>
    </div>
  )
}

/**
 * Todo lo que se ve en la tabla se formatea aquí, en el servidor.
 *
 * `Intl` con zona explícita da el mismo resultado en los dos lados, pero
 * mandarlo ya formateado quita de raíz cualquier desajuste de hidratación y
 * deja al componente de cliente sin una sola decisión de formato.
 */
function aVista(corrida: CorridaBitacora): CorridaVista {
  const cuando = new Date(corrida.iniciadaEn)

  return {
    id: corrida.id,
    fecha: formatDate(cuando),
    hora: formatTime(cuando),
    cliente: corrida.cliente,
    pieza: corrida.pieza,
    resultado: corrida.resultado,
    modelo: corrida.modelo,
    tokens: tokens(corrida.tokensEntrada, corrida.tokensSalida),
    costo: dolares(corrida.costoCents),
    duracion: duracion(corrida.duracionMs),
    contextVersion: corrida.contextVersion,
    disparador: corrida.disparador,
    input: aJson(corrida.input),
    output: aJson(corrida.output),
    error: corrida.error,
    camposEscritos: corrida.camposEscritos,
    edicionesHumanas: corrida.edicionesHumanas,
  }
}

function aJson(valor: unknown): string {
  if (valor === null || valor === undefined) return '—'
  const texto = JSON.stringify(valor, null, 2)
  if (texto.length <= LIMITE_JSON) return texto
  return `${texto.slice(0, LIMITE_JSON)}\n\n… recortado. La corrida completa vive en agent_runs.`
}
