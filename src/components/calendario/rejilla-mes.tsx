'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Mono } from '@/components/ui/primitives'
import { agruparPorDia, construirMes, DIAS_SEMANA } from '@/domain/calendario'
import { cn } from '@/lib/cn'
import type { MonthKey } from '@/lib/time'
import { ModalDia } from './modal-dia'

/**
 * La rejilla mensual. Una sola, usada por las dos vistas.
 *
 * El componente no sabe si está mostrando un cliente o once: recibe entradas
 * ya normalizadas. Esa es la razón de que `EntradaCalendario` sea plana en vez
 * de recibir piezas, stories y fechas por separado — dos componentes de
 * calendario que divergen es exactamente el problema que esto evita.
 *
 * Tampoco sabe para cuántos clientes puede dar de alta un pendiente: recibe
 * `clientesParaTarea` ya resuelta. En la vista de un cliente es una lista de
 * uno; en la global, todos los que están visibles ese mes.
 */

export type TipoEntrada = 'pieza' | 'story' | 'fecha-clave' | 'evento' | 'tarea'

export interface EntradaCalendario {
  id: string
  /** `2026-09-14` o un ISO completo; se recorta al día. */
  fecha: string
  titulo: string
  tipo: TipoEntrada
  /** Color del pilar en la vista de cliente; de la marca en la global. */
  color?: string
  /** Etiqueta corta en mono: el formato, o el nombre del cliente. */
  etiqueta?: string
  href?: string
}

const ESTILO_TIPO: Record<TipoEntrada, string> = {
  pieza: 'border-l-[3px]',
  story: 'border-l-[3px] border-dashed opacity-90',
  'fecha-clave': 'bg-surface-2 border-l-[3px]',
  evento: 'border-l-[3px] border-dotted',
  tarea: 'bg-surface-2 border-l-[3px] border-dashed',
}

export function RejillaMes({
  mes,
  hoy,
  entradas,
  clientesParaTarea,
  compacta = false,
}: {
  mes: MonthKey
  /** `2026-09-14`. Se inyecta para que el render sea determinista y testeable. */
  hoy: string
  entradas: readonly EntradaCalendario[]
  /** A quién se le puede dar de alta un pendiente desde esta rejilla. */
  clientesParaTarea: readonly { id: string; name: string }[]
  compacta?: boolean
}) {
  const semanas = construirMes(mes, hoy)
  const porDia = agruparPorDia(entradas, (e) => e.fecha)
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null)

  return (
    <>
      <div className="border-line overflow-hidden rounded-xs border">
        <div className="border-line grid grid-cols-7 border-b">
          {DIAS_SEMANA.map((d) => (
            <Mono key={d} className="text-fg-muted border-line border-r px-2 py-2 last:border-r-0">
              {d}
            </Mono>
          ))}
        </div>

        {semanas.map((semana, i) => (
          <div
            key={semana[0]?.fecha ?? i}
            className="border-line grid grid-cols-7 border-b last:border-b-0"
          >
            {semana.map((dia) => {
              const delDia = porDia.get(dia.fecha) ?? []
              const piezas = delDia.filter((e) => e.tipo !== 'story')
              const stories = delDia.filter((e) => e.tipo === 'story')

              return (
                <div
                  key={dia.fecha}
                  className={cn(
                    'border-line flex flex-col border-r last:border-r-0',
                    compacta ? 'min-h-20' : 'min-h-32',
                    !dia.delMes && 'opacity-35',
                    // Fin de semana con un tinte apenas perceptible: ayuda a
                    // ubicarse sin competir con el contenido.
                    (dia.diaSemana === 0 || dia.diaSemana === 6) && 'bg-surface/40',
                  )}
                >
                  <div className="flex items-center justify-between px-2 pt-1.5">
                    <Mono
                      className={cn(
                        dia.esHoy
                          ? 'bg-accent text-on-accent rounded-xs px-1.5 py-0.5'
                          : 'text-fg-muted',
                      )}
                    >
                      {dia.diaDelMes}
                    </Mono>
                    <div className="flex items-center gap-1.5">
                      {delDia.length > 2 && <Mono className="text-fg-muted">{delDia.length}</Mono>}
                      <button
                        type="button"
                        onClick={() => setDiaAbierto(dia.fecha)}
                        aria-label={`Agregar un pendiente el día ${dia.diaDelMes}`}
                        className="text-fg-muted hover:bg-surface-2 hover:text-accent-hot rounded-xs px-1 leading-none transition-colors duration-150"
                      >
                        <Mono>+</Mono>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5 px-1 pt-1 pb-1">
                    {piezas.map((e) => {
                      const contenido = (
                        <>
                          {e.etiqueta && (
                            <Mono className="text-fg-muted block truncate text-[9px]">
                              {e.etiqueta}
                            </Mono>
                          )}
                          <span className="block truncate text-[11px] leading-tight">
                            {e.titulo}
                          </span>
                        </>
                      )
                      const clase = cn(
                        'block px-1.5 py-1 transition-colors duration-150',
                        ESTILO_TIPO[e.tipo],
                        e.href && 'hover:bg-surface-2',
                      )
                      const estilo = { borderLeftColor: e.color ?? 'var(--color-line)' }

                      return e.href ? (
                        <Link key={e.id} href={e.href} className={clase} style={estilo}>
                          {contenido}
                        </Link>
                      ) : (
                        <div key={e.id} className={clase} style={estilo}>
                          {contenido}
                        </div>
                      )
                    })}
                  </div>

                  {/* Las stories van en su propia tira, separadas por hairline:
                    se planean y se cuentan aparte del feed. */}
                  {stories.length > 0 && (
                    <div className="border-line mt-auto flex items-center gap-1 border-t px-2 py-1">
                      <Mono className="text-fg-muted text-[9px]">ST</Mono>
                      <div className="flex flex-1 gap-0.5">
                        {stories.slice(0, 8).map((s) => (
                          <span
                            key={s.id}
                            title={s.titulo}
                            className="h-1.5 flex-1 rounded-full"
                            style={{ backgroundColor: s.color ?? 'var(--color-fg-muted)' }}
                          />
                        ))}
                      </div>
                      <Mono className="text-fg-muted text-[9px]">{stories.length}</Mono>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {diaAbierto && (
        <ModalDia
          fecha={diaAbierto}
          entradas={porDia.get(diaAbierto) ?? []}
          clientes={clientesParaTarea}
          onClose={() => setDiaAbierto(null)}
        />
      )}
    </>
  )
}
