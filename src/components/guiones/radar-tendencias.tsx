'use client'

import { useRef, useState, useTransition } from 'react'
import { agregarTendencia, calcularFitDeTendencia } from '@/components/guiones/acciones'
import { Button, Display, EmptyState, Mono, ProgressBar } from '@/components/ui/primitives'
import { PLATFORM_LABEL, type Platform } from '@/domain/labels'
import {
  calcularFitDeMarca,
  describirMomentum,
  diasEntre,
  estaFria,
  ordenarTendencias,
  partesDeFecha,
  pesoMomentum,
  PLATAFORMAS,
  TREND_KIND_LABEL,
  TREND_KINDS,
  TREND_MOMENTUM_LABEL,
  type Fit,
  type TrendKind,
  type TrendMomentum,
} from '@/domain/tendencias'
import type { Tendencia } from '@/lib/datos/guiones'

/**
 * § Radar de tendencias.
 *
 * Aquí es donde la división del trabajo se hace visible: **las tendencias las
 * registra una persona**. No hay API limpia de audios en tendencia de TikTok ni
 * de Instagram, y quien la promete vende scraping que se rompe en tres semanas.
 * Ana anota lo que ve corriendo; el Guionista lo traduce a guion con fit de marca.
 *
 * El radar es de la ORG y el fit es por CLIENTE. Esa asimetría es a propósito:
 * un audio que despega le sirve a varios clientes de la agencia, pero le queda
 * a unos y no a otros.
 */
export function RadarTendencias({
  clientId,
  slug,
  nombreCliente,
  pilares,
  tendencias,
  hoy,
}: {
  clientId: string
  slug: string
  nombreCliente: string
  pilares: string[]
  tendencias: Tendencia[]
  hoy: string
}) {
  const dialogo = useRef<HTMLDialogElement>(null)
  const ordenadas = ordenarTendencias(tendencias, hoy)

  return (
    <section aria-labelledby="radar-tendencias">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Display as="h3" id="radar-tendencias" className="text-lg">
            Radar de tendencias
          </Display>
          <Mono className="text-fg-muted mt-2 block normal-case">
            Las tendencias las registras tú. El Guionista las traduce a guion.
          </Mono>
        </div>
        <Button onClick={() => dialogo.current?.showModal()}>Agregar tendencia</Button>
      </header>

      {ordenadas.length === 0 ? (
        <EmptyState
          title="El radar está vacío"
          body="Cuando veas un audio, un formato o un ángulo corriendo en las cuentas que sigues, anótalo aquí con la fecha en que lo viste. El Guionista trabaja sobre lo que esté en esta tabla, y el radar se comparte con todos los clientes de la agencia."
          action={<Button onClick={() => dialogo.current?.showModal()}>Agregar tendencia</Button>}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] border-collapse text-left">
            <thead>
              <tr className="border-line type-mono text-fg-muted border-b">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Plataforma
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Tipo
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Tendencia
                </th>
                <th scope="col" className="w-44 py-2 pr-3 font-medium">
                  Momentum
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Fit
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  La viste
                </th>
                <th scope="col" className="py-2 font-medium">
                  Notas
                </th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((t) => (
                <Renglon key={t.id} tendencia={t} pilares={pilares} hoy={hoy} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalTendencia
        ref={dialogo}
        clientId={clientId}
        slug={slug}
        nombreCliente={nombreCliente}
        hoy={hoy}
      />
    </section>
  )
}

function Renglon({
  tendencia,
  pilares,
  hoy,
}: {
  tendencia: Tendencia
  pilares: string[]
  hoy: string
}) {
  const dias = Math.max(0, diasEntre(tendencia.vistaEl, hoy))
  const fit = calcularFitDeMarca(
    {
      titulo: tendencia.titulo,
      notas: tendencia.notas,
      tipo: tendencia.tipo,
      momentum: tendencia.momentum,
      dias,
    },
    pilares,
  )
  const fria = estaFria(tendencia.vistaEl, hoy)
  const { dia, mes } = partesDeFecha(tendencia.vistaEl)
  const link = tendencia.audioUrl ?? tendencia.referenciaUrl

  return (
    <tr className={`border-line border-b align-top ${fria ? 'opacity-60' : ''}`}>
      <td className="type-mono text-fg-muted py-3 pr-3">{PLATFORM_LABEL[tendencia.plataforma]}</td>
      <td className="type-mono text-fg-muted py-3 pr-3">{TREND_KIND_LABEL[tendencia.tipo]}</td>
      <td className="py-3 pr-3 text-[13px]">
        {tendencia.titulo}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer noopener"
            className="type-mono text-fg-muted hover:text-accent-hot ml-2 underline underline-offset-4"
          >
            {tendencia.audioUrl ? 'audio ↗' : 'ref ↗'}
          </a>
        )}
      </td>
      <td className="py-3 pr-3">
        <ProgressBar
          value={Math.round(pesoMomentum(tendencia.momentum, dias) * 100)}
          max={100}
          tone={tendencia.momentum === 'bajando' ? 'muted' : 'accent'}
        />
        <Mono className="text-fg-muted mt-1.5 block normal-case">
          {describirMomentum(tendencia.momentum, tendencia.vistaEl, hoy)}
        </Mono>
      </td>
      <td className="py-3 pr-3 text-right">
        <Display className="text-xl">{fit.score}</Display>
      </td>
      <td className="type-mono text-fg-muted py-3 pr-3 whitespace-nowrap">
        {dia} {mes}
      </td>
      <td className="text-fg-muted py-3 text-[13px]">
        {tendencia.notas ?? '—'}
        {fria && (
          <Mono className="text-fg-muted mt-1 block normal-case">
            Ya se enfrió. Confirma si sigue corriendo antes de mandarla a guion.
          </Mono>
        )}
      </td>
    </tr>
  )
}

const CAMPO =
  'border-line bg-surface-2 text-fg placeholder:text-fg-muted w-full rounded-xs border px-3 py-2 text-[13px]'

/**
 * El modal de captura.
 *
 * Es un `<dialog>` nativo y no un div flotante: la trampa del foco, el cierre
 * con Escape y el `aria-modal` ya vienen resueltos por el navegador, y una
 * reimplementación a mano de eso siempre acaba dejando el foco suelto detrás
 * del overlay.
 */
function ModalTendencia({
  ref,
  clientId,
  slug,
  nombreCliente,
  hoy,
}: {
  ref: React.RefObject<HTMLDialogElement | null>
  clientId: string
  slug: string
  nombreCliente: string
  hoy: string
}) {
  const [pendiente, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fit, setFit] = useState<Fit | null>(null)

  const [plataforma, setPlataforma] = useState<Platform>('instagram')
  const [tipo, setTipo] = useState<TrendKind>('audio')
  const [titulo, setTitulo] = useState('')
  const [link, setLink] = useState('')
  const [momentum, setMomentum] = useState<TrendMomentum>('subiendo')
  const [vistaEl, setVistaEl] = useState(hoy)
  const [notas, setNotas] = useState('')

  function limpiar() {
    setTitulo('')
    setLink('')
    setNotas('')
    setFit(null)
    setError(null)
    setVistaEl(hoy)
  }

  function calcular() {
    setError(null)
    startTransition(async () => {
      const resultado = await calcularFitDeTendencia({
        clientId,
        titulo,
        tipo,
        momentum,
        vistaEl,
        notas,
      })
      if (resultado.ok) setFit(resultado.fit)
      else setError(resultado.mensaje)
    })
  }

  function guardar() {
    setError(null)
    startTransition(async () => {
      const resultado = await agregarTendencia({
        clientId,
        slug,
        plataforma,
        tipo,
        titulo,
        link,
        momentum,
        vistaEl,
        notas,
      })
      if (resultado.ok) {
        limpiar()
        ref.current?.close()
      } else {
        setError(resultado.mensaje)
      }
    })
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-modal-tendencia"
      className="bg-surface text-fg border-line backdrop:bg-bg/80 m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xs border p-6"
    >
      <Display as="h3" id="titulo-modal-tendencia" className="text-lg">
        Agregar tendencia
      </Display>
      <p className="text-fg-muted mt-2 text-[13px]">
        Queda en el radar de toda la agencia. El fit se calcula contra {nombreCliente}.
      </p>

      <div className="mt-5 grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Plataforma
            </Mono>
            <select
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value as Platform)}
              className={CAMPO}
            >
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p]}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Tipo
            </Mono>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TrendKind)}
              className={CAMPO}
            >
              {TREND_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TREND_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="grid gap-1.5">
          <Mono className="text-fg-muted" as="span">
            Título
          </Mono>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Transición de barra vacía a barra llena al beat"
            className={CAMPO}
          />
        </label>

        <label className="grid gap-1.5">
          <Mono className="text-fg-muted" as="span">
            Link {tipo === 'audio' ? 'del audio' : 'de referencia'}
          </Mono>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
            className={CAMPO}
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Momentum
            </Mono>
            <select
              value={momentum}
              onChange={(e) => setMomentum(e.target.value as TrendMomentum)}
              className={CAMPO}
            >
              {(['subiendo', 'pico', 'bajando'] as const).map((m) => (
                <option key={m} value={m}>
                  {TREND_MOMENTUM_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Fecha en que la viste
            </Mono>
            <input
              type="date"
              value={vistaEl}
              max={hoy}
              onChange={(e) => setVistaEl(e.target.value)}
              className={CAMPO}
            />
          </label>
        </div>

        <label className="grid gap-1.5">
          <Mono className="text-fg-muted" as="span">
            Notas
          </Mono>
          <textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Dónde la viste, a quién le funcionó, en qué giro."
            className={CAMPO}
          />
        </label>
      </div>

      <div className="border-line mt-5 border-t pt-4">
        <Button variant="agent" onClick={calcular} disabled={pendiente}>
          Calcular fit de marca
        </Button>

        {fit && (
          <div className="mt-4 flex items-start gap-4">
            <div className="flex items-baseline gap-1">
              <Display className="text-4xl">{fit.score}</Display>
              <Mono className="text-fg-muted">/100</Mono>
            </div>
            <p className="text-fg-muted flex-1 text-[13px]">{fit.razon}</p>
          </div>
        )}
      </div>

      {error && <p className="text-accent-hot mt-4 text-[13px]">{error}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            limpiar()
            ref.current?.close()
          }}
          disabled={pendiente}
        >
          Cancelar
        </Button>
        <Button variant="primary" onClick={guardar} disabled={pendiente}>
          {pendiente ? 'Guardando…' : 'Guardar tendencia'}
        </Button>
      </div>
    </dialog>
  )
}
