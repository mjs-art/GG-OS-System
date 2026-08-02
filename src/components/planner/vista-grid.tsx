'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState, Mono } from '@/components/ui/primitives'
import { BarraPilares } from '@/components/planner/barra-pilares'
import { Interruptor, sacudir, SegmentedControl } from '@/components/planner/controles'
import { partesDeFecha, SIN_FECHA } from '@/components/planner/fechas'
import { TileFantasma, TilePieza } from '@/components/planner/tile-pieza'
import type { Pieza, Pilar } from '@/components/planner/tipos'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import type { ModoArrastre, SegmentoPilar } from '@/domain/planner'
import { cn } from '@/lib/cn'

/**
 * § Planner · Grid — la vista principal.
 *
 * Dos columnas: la cuadrícula tipo feed y, a su derecha, el riel de fechas.
 *
 * TODA la geometría sale de UNA medición: el ancho del grid. Los tiles son
 * cuadrados perfectos, así que el lado se deduce del ancho y del número de
 * columnas, y de ahí salen la altura de cada fila y la posición exacta de cada
 * entrada del riel. La alternativa —medir cada tile y cada entrada con
 * getBoundingClientRect— tiene un ciclo escondido: la altura del riel depende
 * del grid y el `ResizeObserver` del grid se vuelve a disparar. Con una sola
 * medición no hay ciclo, y las líneas quedan exactamente horizontales en vez
 * de "casi".
 */

const GAP = 2
const RIEL_ANCHO = 48

/**
 * El grid NO previsualiza el reacomodo mientras arrastras.
 *
 * `rectSortingStrategy` empujaría los demás tiles para mostrar el hueco, y eso
 * miente en el modo "intercambiar", donde solo dos piezas se mueven. La
 * previsualización real es el riel: la línea de la pieza se pinta y apunta a su
 * fecha nueva.
 */
const SIN_PREVISUALIZACION: SortingStrategy = () => null

/**
 * Las opciones de los sensores viven FUERA del componente.
 *
 * `useSensor` memoiza por identidad de referencia, así que un objeto literal en
 * línea produce un sensor distinto en cada render. Como el grid se re-renderiza
 * en cada `onDragOver` —para pintar la línea del riel— dnd-kit recibía sensores
 * nuevos a media interacción y abortaba el arrastre: el tile volvía a su lugar
 * sin error, sin toast y sin `onDragEnd`. Costó una tarde encontrarlo.
 */
// Seis píxeles de tolerancia: sin esto, un click para abrir el drawer se
// interpreta como arrastre en cuanto la mano tiembla un poco.
const ACTIVACION_PUNTERO = { activationConstraint: { distance: 6 } }
const ACTIVACION_TECLADO = { coordinateGetter: sortableKeyboardCoordinates }

export interface ResultadoSoltar {
  movido: boolean
  /** El id de la pieza amarrada que detuvo el movimiento, si hubo una. */
  bloqueadaId: string | null
}

export function VistaGrid({
  piezas,
  pilares,
  segmentos,
  columnas,
  onColumnas,
  contentMap,
  onContentMap,
  modo,
  onModo,
  onAbrir,
  onSoltar,
}: {
  /** Ya vienen ordenadas para el grid: descendente por fecha. */
  piezas: readonly Pieza[]
  pilares: readonly Pilar[]
  segmentos: readonly SegmentoPilar[]
  columnas: number
  onColumnas: (n: number) => void
  contentMap: boolean
  onContentMap: (v: boolean) => void
  modo: ModoArrastre
  onModo: (m: ModoArrastre) => void
  onAbrir: (id: string) => void
  onSoltar: (origenId: string, destinoId: string) => ResultadoSoltar
}) {
  const gridRef = useRef<HTMLDivElement>(null)
  const tiles = useRef(new Map<string, HTMLElement>())
  const [ancho, setAncho] = useState(0)
  const [activoId, setActivoId] = useState<string | null>(null)
  const [sobreId, setSobreId] = useState<string | null>(null)
  const [destelloId, setDestelloId] = useState<string | null>(null)

  const sensores = useSensors(
    useSensor(PointerSensor, ACTIVACION_PUNTERO),
    useSensor(KeyboardSensor, ACTIVACION_TECLADO),
  )

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const observador = new ResizeObserver(([entrada]) => {
      if (entrada) setAncho(entrada.contentRect.width)
    })
    observador.observe(el)
    setAncho(el.getBoundingClientRect().width)
    return () => observador.disconnect()
  }, [])

  const registrarRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tiles.current.set(id, el)
    else tiles.current.delete(id)
  }, [])

  const ids = useMemo(() => piezas.map((p) => p.id), [piezas])
  const porPilar = useMemo(() => new Map(pilares.map((p) => [p.id, p] as const)), [pilares])
  const indiceDe = useCallback((id: string | null) => (id ? ids.indexOf(id) : -1), [ids])

  const lado = ancho > 0 ? (ancho - GAP * (columnas - 1)) / columnas : 0
  const filas = Math.ceil(piezas.length / columnas)
  const alto = filas > 0 ? filas * lado + GAP * (filas - 1) : 0
  const altoEntrada = lado / columnas

  /** Y del centro de la entrada `i` del riel, y también de su línea. */
  const yDe = useCallback(
    (i: number) => {
      const fila = Math.floor(i / columnas)
      const col = i % columnas
      return fila * (lado + GAP) + (lado * (col + 0.5)) / columnas
    },
    [columnas, lado],
  )

  function alEmpezar(e: DragStartEvent) {
    setActivoId(String(e.active.id))
  }

  function alPasarEncima(e: DragOverEvent) {
    setSobreId(e.over ? String(e.over.id) : null)
  }

  function alTerminar(e: DragEndEvent) {
    const origen = String(e.active.id)
    const destino = e.over ? String(e.over.id) : null
    setActivoId(null)
    setSobreId(null)
    if (!destino || destino === origen) return

    const { movido, bloqueadaId } = onSoltar(origen, destino)

    if (bloqueadaId) {
      // El tile tiembla donde está la mirada; el toast explica por qué.
      sacudir(tiles.current.get(bloqueadaId))
      return
    }

    if (movido) {
      // La fecha destella una vez: lo que cambió es la FECHA, no la imagen.
      setDestelloId(destino)
      window.setTimeout(() => setDestelloId(null), 700)
    }
  }

  const activa = activoId ? piezas.find((p) => p.id === activoId) : undefined
  const iActivo = indiceDe(activoId)
  const iSobre = indiceDe(sobreId)
  const arrastrando = iActivo >= 0 && iSobre >= 0 && iActivo !== iSobre

  const controles = (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <SegmentedControl
        etiqueta="Columnas del grid"
        valor={String(columnas)}
        onCambio={(v) => onColumnas(Number(v))}
        opciones={[
          { id: '3', label: '3 col' },
          { id: '5', label: '5 col' },
        ]}
      />
      <SegmentedControl
        etiqueta="Qué pasa al soltar una pieza sobre otra"
        valor={modo}
        onCambio={(v) => onModo(v as ModoArrastre)}
        opciones={[
          { id: 'intercambiar', label: 'Intercambiar' },
          { id: 'insertar', label: 'Insertar y correr' },
        ]}
      />
      <Interruptor activo={contentMap} onCambio={onContentMap}>
        Content map
      </Interruptor>
      <Mono className="text-fg-muted ml-auto">
        {modo === 'intercambiar'
          ? 'Suelta sobre otra pieza y se intercambian las fechas'
          : 'Suelta sobre otra pieza y todo lo de abajo se recorre un slot'}
      </Mono>
    </div>
  )

  if (piezas.length === 0) {
    return (
      <>
        {controles}
        <EmptyState
          title="El mes está en blanco"
          body="Todavía no hay piezas de feed en este mes. Pídele el plan de volumen al Estratega en la sección Volumen, o captura la primera pieza a mano."
        />
      </>
    )
  }

  return (
    <>
      <BarraPilares segmentos={segmentos} />
      {controles}

      <DndContext
        sensors={sensores}
        collisionDetection={closestCenter}
        onDragStart={alEmpezar}
        onDragOver={alPasarEncima}
        onDragEnd={alTerminar}
        onDragCancel={() => {
          setActivoId(null)
          setSobreId(null)
        }}
      >
        <SortableContext items={ids} strategy={SIN_PREVISUALIZACION}>
          <div className="flex items-stretch">
            <div
              ref={gridRef}
              className="grid min-w-0 flex-1"
              style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`, gap: GAP }}
            >
              {piezas.map((pieza) => {
                const pilar = pieza.pillarId ? porPilar.get(pieza.pillarId) : undefined
                const partes = partesDeFecha(pieza.publishAt)
                return (
                  <TilePieza
                    key={pieza.id}
                    pieza={pieza}
                    colorPilar={pilar?.color ?? null}
                    nombrePilar={pilar?.name ?? 'Sin pilar'}
                    contentMap={contentMap}
                    fechaCorta={partes?.corta ?? SIN_FECHA}
                    registrarRef={registrarRef}
                    onAbrir={onAbrir}
                    esDestino={sobreId === pieza.id && activoId !== pieza.id}
                    columnas={columnas}
                  />
                )
              })}
            </div>

            {/* Canaleta: aquí viven las líneas que atan cada tile con su fecha. */}
            <div
              aria-hidden
              className="relative shrink-0"
              style={{ width: RIEL_ANCHO, opacity: lado > 0 ? 1 : 0 }}
            >
              <svg
                width={RIEL_ANCHO}
                height={alto}
                viewBox={`0 0 ${RIEL_ANCHO} ${alto}`}
                className="absolute top-0 left-0 overflow-visible"
              >
                {piezas.map((pieza, i) => {
                  const esActiva = arrastrando && i === iActivo
                  // La pieza que recibe también se pinta, pero solo en modo
                  // intercambiar: en "insertar y correr" no cambia de lugar con
                  // la que traes, se recorre.
                  const esEspejo = arrastrando && modo === 'intercambiar' && i === iSobre
                  const destino = esActiva ? iSobre : esEspejo ? iActivo : i
                  const vivo = esActiva || esEspejo

                  return (
                    <line
                      key={pieza.id}
                      x1={0}
                      y1={yDe(i)}
                      x2={RIEL_ANCHO}
                      y2={yDe(destino)}
                      stroke={vivo ? 'var(--color-accent-hot)' : 'var(--color-line)'}
                      strokeWidth={vivo ? 1.5 : 1}
                    />
                  )
                })}
              </svg>
            </div>

            <div className="relative shrink-0" style={{ width: 156, height: alto }}>
              {piezas.map((pieza, i) => {
                const partes = partesDeFecha(pieza.publishAt)
                const fila = Math.floor(i / columnas)
                const col = i % columnas
                const destino = arrastrando && i === iSobre
                const origen = arrastrando && i === iActivo

                return (
                  <div
                    key={pieza.id}
                    className={cn(
                      'absolute right-0 left-0 flex flex-col justify-center overflow-hidden pl-2',
                      'transition-colors duration-150 ease-out',
                      destelloId === pieza.id && 'text-accent-hot',
                    )}
                    style={{
                      top: fila * (lado + GAP) + (lado * col) / columnas,
                      height: altoEntrada,
                      opacity: lado > 0 ? 1 : 0,
                    }}
                  >
                    {columnas >= 5 ? (
                      // A cinco columnas cada entrada mide un tercio de lo que
                      // mide a tres, así que el día grande no cabe. Se degrada
                      // a dos renglones de mono en vez de perder el formato.
                      <>
                        <Mono
                          className={cn(
                            'truncate',
                            destino || origen ? 'text-accent-hot' : 'text-fg',
                          )}
                        >
                          {partes ? `${partes.dia} ${partes.diaSemana} ${partes.hora}` : SIN_FECHA}
                        </Mono>
                        <Mono className="text-fg-muted truncate">
                          {PIECE_FORMAT_LABEL[pieza.format]}
                        </Mono>
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={cn(
                              'type-display text-xl',
                              destino || origen ? 'text-accent-hot' : 'text-fg',
                            )}
                          >
                            {partes?.dia ?? '—'}
                          </span>
                          <Mono className="text-fg-muted truncate">
                            {partes ? `${partes.diaSemana} ${partes.hora}` : SIN_FECHA}
                          </Mono>
                        </div>
                        <Mono className="text-fg-muted truncate">
                          {PIECE_FORMAT_LABEL[pieza.format]}
                        </Mono>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activa ? (
            <div style={{ width: lado || undefined }}>
              <TileFantasma
                pieza={activa}
                colorPilar={(activa.pillarId ? porPilar.get(activa.pillarId)?.color : null) ?? null}
                nombrePilar={
                  (activa.pillarId ? porPilar.get(activa.pillarId)?.name : null) ?? 'Sin pilar'
                }
                contentMap={contentMap}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </>
  )
}
