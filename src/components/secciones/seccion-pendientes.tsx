import { Camera, MapPin } from 'lucide-react'
import { Display, EmptyState, Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import type { EventoPendiente, Tarea } from '@/lib/datos/secciones'
import { formatDate } from '@/lib/time'
import { TablaTareas, type FilaTarea } from './tabla-tareas'

/**
 * § Pendientes — la tabla de tareas y los eventos que hay que cubrir.
 *
 * `due_date` y `scheduled_on` son columnas **date**, sin hora. Se formatean en
 * UTC a propósito: `new Date('2026-08-05')` es medianoche UTC, y pintarla en la
 * zona de Tijuana la corre al día 4. Un pendiente que vence el 5 y se lee "4
 * ago" es un error que nadie reporta porque parece un descuido de quien lo
 * capturó.
 */
const SIN_HORA = { timeZone: 'UTC' } as const

export function SeccionPendientes({
  tareas,
  eventos,
  hoy,
}: {
  tareas: Tarea[]
  eventos: EventoPendiente[]
  /** `2026-08-01` en la zona del estudio. Define qué está vencido. */
  hoy: string
}) {
  const filas: FilaTarea[] = tareas.map((t) => ({
    id: t.id,
    title: t.title,
    dependsOn: t.dependsOn,
    status: t.status,
    textoFecha: t.dueDate ? formatDate(new Date(t.dueDate), SIN_HORA) : null,
    vencida: t.dueDate !== null && t.dueDate < hoy && t.status !== 'hecha',
  }))

  const abiertas = tareas.filter((t) => t.status !== 'hecha').length

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Pendientes
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            {abiertas === 0
              ? 'Nada abierto. La lista está limpia.'
              : `${abiertas} ${abiertas === 1 ? 'pendiente abierto' : 'pendientes abiertos'}.`}
          </p>
        </div>
      </header>

      <TablaTareas tareas={filas} />

      {/* --- Eventos y sesiones --------------------------------------------- */}

      <div className="border-line mt-12 border-t pt-8">
        <header className="mb-4">
          <Display as="h3" className="text-base">
            Eventos y sesiones pendientes
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            Lo que hay que cubrir o fotografiar. Sin este material, las piezas del mes se quedan sin
            con qué salir.
          </p>
        </header>

        {eventos.length === 0 ? (
          <EmptyState
            title="Nada agendado por cubrir"
            body="Agenda la sesión de foto o la cobertura del próximo evento y aparece aquí con su fecha y su lugar, junto con las piezas que dependen de ese material."
          />
        ) : (
          <ul className="flex flex-col">
            {eventos.map((e) => (
              <li key={e.id} className="border-line border-b py-5 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Display className="text-base">
                    {formatDate(new Date(e.scheduledOn), { ...SIN_HORA, weekday: 'short' })}
                  </Display>
                  <span className="flex-1 text-[13px]">{e.title}</span>
                  {e.place && (
                    <span className="text-fg-muted inline-flex items-center gap-1.5">
                      <MapPin aria-hidden className="size-3 shrink-0" />
                      <Mono>{e.place}</Mono>
                    </span>
                  )}
                </div>

                {e.notes && <p className="text-fg-muted mt-2 max-w-prose text-[13px]">{e.notes}</p>}

                {e.piezasEnEspera.length > 0 && (
                  <div className="mt-3">
                    <Mono as="div" className="text-fg-muted mb-2 inline-flex items-center gap-1.5">
                      <Camera aria-hidden className="size-3 shrink-0" />
                      {e.piezasEnEspera.length}{' '}
                      {e.piezasEnEspera.length === 1
                        ? 'pieza de ese mes espera material'
                        : 'piezas de ese mes esperan material'}
                    </Mono>
                    <ul className="flex flex-col gap-1">
                      {e.piezasEnEspera.map((p) => (
                        <li key={p.id} className="border-line border-l-2 pl-3 text-[13px]">
                          <Mono className="text-fg-muted mr-2">{PIECE_FORMAT_LABEL[p.format]}</Mono>
                          {p.hook ?? 'Sin hook todavía'}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
