'use client'

import { useMemo, useState } from 'react'
import { Chip, Display, EmptyState, Mono } from '@/components/ui/primitives'
import { Drawer } from '@/components/planner/drawer'
import type { Story } from '@/components/planner/tipos'
import { agruparPorDia, construirMes, DIAS_SEMANA } from '@/domain/calendario'
import { PIECE_STATUS_LABEL, STORY_KIND_LABEL, type StoryKind } from '@/domain/labels'
import { conteoStories } from '@/domain/planner'
import { cn } from '@/lib/cn'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Planner · Stories — una columna por día del mes.
 *
 * Las stories se planean y se cuentan APARTE del feed, y esta vista existe para
 * que eso se vea: aquí lo que importa es la constancia diaria, no la
 * composición del grid. Un hueco de tres días se lee de un golpe.
 *
 * Ojo con el enum: en la base el tipo de campaña se llama `campana`, sin eñe,
 * porque un identificador con caracteres especiales duele en migraciones. A la
 * pantalla nunca llega así — para eso está `STORY_KIND_LABEL`.
 */

const TONO_TIPO: Record<StoryKind, 'neutral' | 'accent' | 'medium'> = {
  diaria: 'neutral',
  campana: 'accent',
  interactiva: 'medium',
}

export function VistaStories({
  stories,
  mes,
  hoy,
}: {
  stories: readonly Story[]
  mes: MonthKey
  /** `2026-09-14`, inyectado para que el render sea determinista. */
  hoy: string
}) {
  const [abierta, setAbierta] = useState<string | null>(null)

  const { total, porTipo } = conteoStories(stories)
  const porDia = useMemo(() => agruparPorDia(stories, (s) => s.scheduledOn), [stories])

  // Solo los días del propio mes: las columnas de relleno del calendario aquí
  // serían días de otro mes con otro plan.
  const dias = useMemo(
    () =>
      construirMes(mes, hoy)
        .flat()
        .filter((d) => d.delMes),
    [mes, hoy],
  )

  const seleccionada = abierta ? stories.find((s) => s.id === abierta) : undefined

  if (total === 0) {
    return (
      <EmptyState
        title={`Sin stories en ${formatMonthKey(mes)}`}
        body="La permanencia depende de la constancia diaria, así que este mes va en ceros. Pídele el plan de stories al Estratega en la sección Volumen, o captura las del primer día a mano."
      />
    )
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Display className="text-2xl">{total} stories</Display>
        <Mono className="text-fg-muted">
          {porTipo.diaria} diarias · {porTipo.campana} de campaña · {porTipo.interactiva}{' '}
          interactivas
        </Mono>
      </div>

      <div className="border-line overflow-x-auto rounded-xs border">
        <div className="flex min-w-max">
          {dias.map((dia) => {
            const delDia = porDia.get(dia.fecha) ?? []
            return (
              <div
                key={dia.fecha}
                className={cn(
                  'border-line flex w-28 shrink-0 flex-col border-r last:border-r-0',
                  (dia.diaSemana === 0 || dia.diaSemana === 6) && 'bg-surface/40',
                )}
              >
                <div className="border-line flex items-baseline gap-1.5 border-b px-2 py-2">
                  <span
                    className={cn(
                      'type-display text-base',
                      dia.esHoy ? 'text-accent-hot' : 'text-fg',
                    )}
                  >
                    {dia.diaDelMes}
                  </span>
                  <Mono className="text-fg-muted">{DIAS_SEMANA[dia.diaSemana]}</Mono>
                </div>

                <div className="flex min-h-40 flex-col gap-1 p-1.5">
                  {delDia.length === 0 ? (
                    <Mono className="text-fg-muted p-1 opacity-60">Sin story</Mono>
                  ) : (
                    delDia.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAbierta(s.id)}
                        className="border-line bg-surface hover:bg-surface-2 flex flex-col gap-1 rounded-xs border p-1.5 text-left"
                      >
                        {/* La miniatura es una barra vertical del alto de una
                            story: no hay assets todavía y una caja gris vacía
                            miente más que una proporción honesta. */}
                        <span
                          aria-hidden
                          className={cn(
                            'h-10 w-full rounded-xs',
                            s.kind === 'campana'
                              ? 'bg-accent'
                              : s.kind === 'interactiva'
                                ? 'bg-medium'
                                : 'bg-surface-2',
                          )}
                        />
                        <Mono className="text-fg-muted truncate">{STORY_KIND_LABEL[s.kind]}</Mono>
                        <Mono className="text-fg-muted truncate opacity-70">
                          {s.slides.length} {s.slides.length === 1 ? 'slide' : 'slides'}
                        </Mono>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Drawer
        abierto={Boolean(seleccionada)}
        onCerrar={() => setAbierta(null)}
        titulo={seleccionada ? STORY_KIND_LABEL[seleccionada.kind] : 'Story'}
        subtitulo={
          seleccionada && (
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={TONO_TIPO[seleccionada.kind]}>{STORY_KIND_LABEL[seleccionada.kind]}</Chip>
              <Mono className="text-fg-muted">{seleccionada.scheduledOn}</Mono>
              <Chip>{PIECE_STATUS_LABEL[seleccionada.status]}</Chip>
            </div>
          )
        }
      >
        {seleccionada && seleccionada.slides.length === 0 ? (
          <EmptyState
            title="Esta story todavía no tiene slides"
            body="El Redactor escribe el copy slide por slide cuando el plan del mes se aprueba. Mientras tanto puedes capturarlos a mano desde la tabla."
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {seleccionada?.slides.map((slide, i) => (
              <li key={i} className="border-line rounded-xs border p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Mono className="text-fg-muted">Slide {i + 1}</Mono>
                  {slide.sticker && <Chip tone="accent">{slide.sticker}</Chip>}
                </div>
                <p className="text-[13px] whitespace-pre-wrap">
                  {slide.copy ?? <span className="text-fg-muted">Sin copy todavía</span>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Drawer>
    </>
  )
}
