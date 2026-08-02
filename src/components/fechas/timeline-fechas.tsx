'use client'

import { useRef, useState, useTransition } from 'react'
import { agregarFechaClave, proponerCampanas } from '@/components/fechas/acciones'
import { Button, Chip, Display, Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL, PIECE_STATUS_LABEL } from '@/domain/labels'
import {
  agruparPorMes,
  KEY_DATE_KIND_LABEL,
  ordenarFechasClave,
  partesDeFecha,
  type PropuestaFechaClave,
} from '@/domain/tendencias'
import type { FechaClave } from '@/lib/datos/fechas'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * El timeline de seis meses y su vista de lista.
 *
 * Es cliente porque la selección de una fecha abre un panel y la vista se
 * conmuta; el scroll horizontal y el agrupado ya vienen resueltos desde el
 * servidor y desde el dominio.
 */
export function TimelineFechas({
  clientId,
  slug,
  mesInicial,
  meses,
  fechas,
  hoy,
}: {
  clientId: string
  slug: string
  mesInicial: MonthKey
  meses: number
  fechas: FechaClave[]
  hoy: string
}) {
  const [vista, setVista] = useState<'timeline' | 'lista'>('timeline')
  const [seleccionada, setSeleccionada] = useState<FechaClave | null>(null)
  const panel = useRef<HTMLDialogElement>(null)

  const columnas = agruparPorMes(fechas, (f) => f.fecha, mesInicial, meses)
  const mesDeHoy = hoy.slice(0, 7)

  function abrir(fecha: FechaClave) {
    setSeleccionada(fecha)
    panel.current?.showModal()
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant={vista === 'timeline' ? 'primary' : 'ghost'}
          onClick={() => setVista('timeline')}
          aria-pressed={vista === 'timeline'}
        >
          Timeline
        </Button>
        <Button
          variant={vista === 'lista' ? 'primary' : 'ghost'}
          onClick={() => setVista('lista')}
          aria-pressed={vista === 'lista'}
        >
          Vista de lista
        </Button>
      </div>

      {vista === 'timeline' ? (
        // Los meses son columnas separadas por hairlines y el contenedor
        // scrollea en horizontal: seis meses no caben a 375px y partirlos en
        // dos filas rompería la lectura de "qué viene después".
        <div className="border-line overflow-x-auto rounded-xs border">
          <div className="flex min-w-max">
            {columnas.map((columna) => (
              <ColumnaMes
                key={columna.mes}
                clientId={clientId}
                slug={slug}
                mes={columna.mes}
                esMesActual={columna.mes === mesDeHoy}
                fechas={columna.items}
                onAbrir={abrir}
              />
            ))}
          </div>
        </div>
      ) : (
        <TablaFechas fechas={ordenarFechasClave(fechas)} onAbrir={abrir} />
      )}

      <PanelFecha ref={panel} fecha={seleccionada} />
    </>
  )
}

function ColumnaMes({
  clientId,
  slug,
  mes,
  esMesActual,
  fechas,
  onAbrir,
}: {
  clientId: string
  slug: string
  mes: MonthKey
  esMesActual: boolean
  fechas: FechaClave[]
  onAbrir: (fecha: FechaClave) => void
}) {
  const [pendiente, startTransition] = useTransition()
  const [propuestas, setPropuestas] = useState<PropuestaFechaClave[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function proponer() {
    setError(null)
    startTransition(async () => {
      const resultado = await proponerCampanas({ clientId, mes })
      if (resultado.ok) setPropuestas(resultado.propuestas)
      else setError(resultado.mensaje)
    })
  }

  function agregar(propuesta: PropuestaFechaClave) {
    setError(null)
    startTransition(async () => {
      const resultado = await agregarFechaClave({
        clientId,
        slug,
        fecha: propuesta.fecha,
        titulo: propuesta.titulo,
        tipo: propuesta.tipo,
        ideaCampana: propuesta.ideaCampana,
        llevaPresupuesto: false,
      })
      if (resultado.ok) {
        setPropuestas((actuales) => actuales?.filter((p) => p.fecha !== propuesta.fecha) ?? null)
      } else {
        setError(resultado.mensaje)
      }
    })
  }

  return (
    <div className="border-line w-64 shrink-0 border-r p-4 last:border-r-0">
      <Display as="h3" className={`text-base ${esMesActual ? 'text-accent-hot' : 'text-fg-muted'}`}>
        {formatMonthKey(mes)}
      </Display>

      <div className="mt-4 flex flex-col gap-2">
        {fechas.map((fecha) => (
          <TarjetaFecha key={fecha.id} fecha={fecha} onAbrir={onAbrir} />
        ))}

        {fechas.length === 0 && propuestas === null && (
          <div className="border-line flex flex-col items-start gap-3 rounded-xs border border-dashed p-4">
            <p className="text-fg-muted text-[13px]">
              Nada agendado. El Estratega puede sugerir qué se celebra o se vende este mes.
            </p>
            <Button variant="agent" onClick={proponer} disabled={pendiente}>
              {pendiente ? 'Pensando…' : 'Proponer campañas'}
            </Button>
          </div>
        )}

        {propuestas?.length === 0 && (
          <Mono className="text-fg-muted normal-case">
            Ya agregaste todas las propuestas de este mes.
          </Mono>
        )}

        {propuestas?.map((propuesta) => (
          <Propuesta
            key={propuesta.fecha}
            propuesta={propuesta}
            pendiente={pendiente}
            onAgregar={agregar}
          />
        ))}

        {error && <p className="text-accent-hot text-[13px]">{error}</p>}
      </div>
    </div>
  )
}

function TarjetaFecha({
  fecha,
  onAbrir,
}: {
  fecha: FechaClave
  onAbrir: (fecha: FechaClave) => void
}) {
  const { dia, mes } = partesDeFecha(fecha.fecha)
  const tieneContenido = fecha.piezas.length > 0

  return (
    <button
      type="button"
      onClick={() => onAbrir(fecha)}
      className="border-line hover:bg-surface-2 w-full rounded-xs border p-3 text-left transition-colors duration-150 ease-out"
    >
      {/* `span` y no `div` en todo lo que va dentro del botón: un div dentro de
          un <button> es HTML inválido y el día que alguien lo envuelva en un
          <p> el navegador parte el árbol en un lugar inesperado. */}
      <span className="flex items-baseline gap-1.5">
        <Display as="span" className="text-xl">
          {dia}
        </Display>
        <Mono className="text-fg-muted">{mes}</Mono>

        {/* Dos indicadores diminutos y nada más: si ya hay contenido y si lleva
            dinero. Todo lo demás cabe en el panel. */}
        <span className="ml-auto flex items-center gap-1.5">
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${tieneContenido ? 'bg-ok' : 'border-line border'}`}
          />
          <span className="sr-only">
            {tieneContenido ? `${fecha.piezas.length} piezas asignadas` : 'sin contenido asignado'}
          </span>
          {fecha.llevaPresupuesto && (
            <>
              <Mono aria-hidden className="text-accent-hot">
                $
              </Mono>
              <span className="sr-only">lleva pauta</span>
            </>
          )}
        </span>
      </span>

      <span className="mt-2 block text-[13px]">{fecha.titulo}</span>
      <Chip className="mt-2">{KEY_DATE_KIND_LABEL[fecha.tipo]}</Chip>
    </button>
  )
}

function Propuesta({
  propuesta,
  pendiente,
  onAgregar,
}: {
  propuesta: PropuestaFechaClave
  pendiente: boolean
  onAgregar: (propuesta: PropuestaFechaClave) => void
}) {
  const { dia, mes } = partesDeFecha(propuesta.fecha)

  return (
    <div className="border-line rounded-xs border border-dashed p-3">
      <div className="flex items-baseline gap-1.5">
        <Display className="text-xl">{dia}</Display>
        <Mono className="text-fg-muted">{mes}</Mono>
        <Chip tone="agent" className="ml-auto">
          Propuesta
        </Chip>
      </div>
      <p className="mt-2 text-[13px]">{propuesta.titulo}</p>
      <p className="text-fg-muted mt-1 text-[13px]">{propuesta.ideaCampana}</p>
      <Button className="mt-3" onClick={() => onAgregar(propuesta)} disabled={pendiente}>
        Agregar al mes
      </Button>
    </div>
  )
}

function TablaFechas({
  fechas,
  onAbrir,
}: {
  fechas: FechaClave[]
  onAbrir: (fecha: FechaClave) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] border-collapse text-left">
        <thead>
          <tr className="border-line type-mono text-fg-muted border-b">
            <th scope="col" className="py-2 pr-3 font-medium">
              Fecha
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Título
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Tipo
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Contenido
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Pauta
            </th>
            <th scope="col" className="py-2 font-medium">
              Idea de campaña
            </th>
          </tr>
        </thead>
        <tbody>
          {fechas.map((fecha) => {
            const { dia, mes, anio } = partesDeFecha(fecha.fecha)
            return (
              <tr key={fecha.id} className="border-line hover:bg-surface-2 border-b align-top">
                <td className="type-mono text-fg-muted py-3 pr-3 whitespace-nowrap">
                  {dia} {mes} {anio}
                </td>
                <td className="py-3 pr-3 text-[13px]">
                  <button
                    type="button"
                    onClick={() => onAbrir(fecha)}
                    className="hover:text-accent-hot text-left underline underline-offset-4"
                  >
                    {fecha.titulo}
                  </button>
                </td>
                <td className="py-3 pr-3">
                  <Chip>{KEY_DATE_KIND_LABEL[fecha.tipo]}</Chip>
                </td>
                <td className="type-mono text-fg-muted py-3 pr-3">
                  {fecha.piezas.length > 0 ? `${fecha.piezas.length} piezas` : '—'}
                </td>
                <td className="type-mono text-fg-muted py-3 pr-3">
                  {fecha.llevaPresupuesto ? 'Sí' : '—'}
                </td>
                <td className="text-fg-muted py-3 text-[13px]">{fecha.ideaCampana ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const PESOS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
})

/** El dinero se guarda en centavos enteros. Un float de pesos acaba en $284.99999. */
function pesos(cents: number): string {
  return PESOS.format(cents / 100)
}

/**
 * El panel lateral de una fecha.
 *
 * `<dialog>` pegado a la derecha en vez de un aside que empuje el timeline: el
 * timeline scrollea en horizontal y reacomodarlo al abrir el panel movería de
 * lugar la tarjeta que se acaba de tocar.
 */
function PanelFecha({
  ref,
  fecha,
}: {
  ref: React.RefObject<HTMLDialogElement | null>
  fecha: FechaClave | null
}) {
  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-panel-fecha"
      className="bg-surface text-fg border-line backdrop:bg-bg/80 mt-0 mr-0 mb-0 ml-auto h-dvh max-h-dvh w-[min(26rem,100vw)] rounded-none border-l p-6"
    >
      {fecha && (
        <div className="flex h-full flex-col">
          <header className="border-line border-b pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Mono className="text-fg-muted">
                  {partesDeFecha(fecha.fecha).dia} {partesDeFecha(fecha.fecha).mes}{' '}
                  {partesDeFecha(fecha.fecha).anio}
                </Mono>
                <Display as="h3" id="titulo-panel-fecha" className="mt-2 text-lg">
                  {fecha.titulo}
                </Display>
                <Chip className="mt-3">{KEY_DATE_KIND_LABEL[fecha.tipo]}</Chip>
              </div>
              <Button variant="ghost" onClick={() => ref.current?.close()}>
                Cerrar
              </Button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto py-4">
            <Bloque titulo="Notas">
              <p className="text-[13px]">{fecha.notas ?? 'Sin notas todavía.'}</p>
            </Bloque>

            <Bloque titulo="Idea de campaña">
              <p className="text-[13px]">
                {fecha.ideaCampana ??
                  'Sin idea de campaña. El Estratega puede proponer una desde el planner del mes.'}
              </p>
            </Bloque>

            <Bloque titulo="Piezas asignadas">
              {fecha.piezas.length === 0 ? (
                <p className="text-fg-muted text-[13px]">
                  Ninguna pieza cae en esta fecha. Arrastra una al día en el planner para amarrarla.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {fecha.piezas.map((pieza) => (
                    <li key={pieza.id} className="border-line rounded-xs border p-3">
                      <Mono className="text-fg-muted">
                        {PIECE_FORMAT_LABEL[pieza.formato]} · {PIECE_STATUS_LABEL[pieza.estado]}
                      </Mono>
                      <p className="mt-1.5 text-[13px]">{pieza.titulo}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>

            <Bloque titulo="Presupuesto de pauta">
              {fecha.campanas.length === 0 ? (
                <p className="text-fg-muted text-[13px]">
                  {fecha.llevaPresupuesto
                    ? 'Está marcada como fecha con pauta pero no hay campaña que la cubra. Créala en la sección Pauta.'
                    : 'Sin pauta para esta fecha.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {fecha.campanas.map((campana) => (
                    <li key={campana.id} className="border-line rounded-xs border p-3">
                      <p className="text-[13px]">{campana.nombre}</p>
                      <Mono className="text-fg-muted mt-1.5 block">
                        {pesos(campana.ejercidoCents)} de {pesos(campana.presupuestoCents)}
                      </Mono>
                    </li>
                  ))}
                </ul>
              )}
            </Bloque>
          </div>
        </div>
      )}
    </dialog>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <Mono className="text-fg-muted mb-2 block">{titulo}</Mono>
      {children}
    </section>
  )
}
