'use client'

import { useSortable } from '@dnd-kit/sortable'
import { Images, Lock, Play, Square } from 'lucide-react'
import Image from 'next/image'
import { Mono } from '@/components/ui/primitives'
import { imagenDePieza } from '@/components/planner/imagenes'
import type { Pieza } from '@/components/planner/tipos'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import { esDelPipeline } from '@/domain/planner'
import { cn } from '@/lib/cn'

const ICONO_FORMATO = { post: Square, carrusel: Images, reel: Play } as const

export function TilePieza({
  pieza,
  colorPilar,
  nombrePilar,
  contentMap,
  fechaCorta,
  registrarRef,
  onAbrir,
  esDestino,
  columnas,
}: {
  pieza: Pieza
  colorPilar: string | null
  nombrePilar: string
  contentMap: boolean
  /** Ya formateada por el padre: los componentes no crean fechas. */
  fechaCorta: string
  registrarRef: (id: string, el: HTMLElement | null) => void
  onAbrir: (id: string) => void
  /** El tile sobre el que se está soltando, para marcarlo antes del drop. */
  esDestino: boolean
  columnas: number
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: pieza.id })
  const Icono = ICONO_FORMATO[pieza.format]
  const delPipeline = esDelPipeline(pieza)
  const hook = pieza.hook ?? pieza.idea ?? 'Sin hook todavía'

  return (
    <button
      type="button"
      ref={(el) => {
        setNodeRef(el)
        registrarRef(pieza.id, el)
      }}
      {...attributes}
      {...listeners}
      onClick={() => onAbrir(pieza.id)}
      aria-label={`${PIECE_FORMAT_LABEL[pieza.format]} del ${fechaCorta}: ${hook}`}
      className={cn(
        'group bg-surface relative block aspect-square w-full cursor-grab overflow-hidden rounded-none text-left',
        'transition-opacity duration-150 ease-out',
        // El original se atenúa mientras el DragOverlay lleva la copia: sin
        // esto parece que hay dos piezas iguales.
        isDragging && 'opacity-25',
        esDestino && 'outline-accent-hot outline-2 -outline-offset-2',
      )}
    >
      {contentMap ? (
        <div
          className="flex h-full w-full items-center justify-center p-2"
          style={{ backgroundColor: colorPilar ?? 'var(--color-surface-2)' }}
        >
          <Mono className="text-on-accent text-center leading-tight text-balance">
            {nombrePilar}
          </Mono>
        </div>
      ) : (
        <Image
          src={pieza.imageUrl ?? imagenDePieza(pieza.id)}
          alt=""
          fill
          sizes={columnas === 5 ? '18vw' : '30vw'}
          className="object-cover"
        />
      )}

      {/* Candado: la pieza está amarrada a su fecha y el grid se niega a moverla. */}
      {pieza.dateLocked && (
        <span className="bg-bg/70 absolute top-1 left-1 flex size-5 items-center justify-center">
          <Lock aria-hidden className="text-fg size-3" />
          <span className="sr-only">Fecha fija</span>
        </span>
      )}

      <span className="bg-bg/70 absolute top-1 right-1 flex size-5 items-center justify-center">
        <Icono aria-hidden className="text-fg size-3" />
      </span>

      {/* Punto de procedencia: lleno = la pieza llegó hasta aquí sola. */}
      <span
        className={cn(
          'absolute bottom-2.5 left-1.5 size-2 rounded-full border',
          delPipeline ? 'bg-accent-hot border-accent-hot' : 'border-fg bg-transparent',
        )}
        title={delPipeline ? 'Escrita por el pipeline' : 'Editada por ti'}
      />

      {/* Hover: la fecha y el hook, nada más. Dos líneas máximo. */}
      <span
        className={cn(
          'bg-bg/85 absolute inset-0 flex flex-col justify-end gap-1 p-2 opacity-0',
          'transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-visible:opacity-100',
        )}
      >
        <Mono className="text-accent-hot">{fechaCorta}</Mono>
        <span className="text-fg line-clamp-2 text-[12px] leading-tight">{hook}</span>
      </span>

      {/* Franja del pilar. Es lo último que se dibuja para que nada la tape. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[3px]"
        style={{ backgroundColor: colorPilar ?? 'var(--color-line)' }}
      />
    </button>
  )
}

/** La copia que sigue al cursor. Sin interacción: solo tiene que verse igual. */
export function TileFantasma({
  pieza,
  colorPilar,
  nombrePilar,
  contentMap,
}: {
  pieza: Pieza
  colorPilar: string | null
  nombrePilar: string
  contentMap: boolean
}) {
  const Icono = ICONO_FORMATO[pieza.format]

  return (
    <div className="border-accent-hot bg-surface relative aspect-square w-full overflow-hidden border-2">
      {contentMap ? (
        <div
          className="flex h-full w-full items-center justify-center p-2"
          style={{ backgroundColor: colorPilar ?? 'var(--color-surface-2)' }}
        >
          <Mono className="text-on-accent text-center leading-tight">{nombrePilar}</Mono>
        </div>
      ) : (
        <Image
          src={pieza.imageUrl ?? imagenDePieza(pieza.id)}
          alt=""
          fill
          sizes="30vw"
          className="object-cover"
          priority
        />
      )}
      <span className="bg-bg/70 absolute top-1 right-1 flex size-5 items-center justify-center">
        <Icono aria-hidden className="text-fg size-3" />
      </span>
    </div>
  )
}
