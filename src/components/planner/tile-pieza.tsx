'use client'

import { useSortable } from '@dnd-kit/sortable'
import { Images, Link2, Lock, Play, Square } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { Mono } from '@/components/ui/primitives'
import type { AssetSource, Pieza } from '@/components/planner/tipos'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import { esDelPipeline, type EstadoEntrega } from '@/domain/planner'
import { cn } from '@/lib/cn'

const ICONO_FORMATO = { post: Square, carrusel: Images, reel: Play } as const

/**
 * La imagen de la pieza, o la placa del pilar.
 *
 * Un bucket privado no se puede pintar con una URL cualquiera: `url` ya viene
 * FIRMADA desde el servidor. Si no hay imagen —o si la que hay no carga— se cae
 * a la placa de color, que es lo que el grid pintaba antes de que `pieces`
 * tuviera dónde guardar el asset.
 *
 * `unoptimized` a propósito, y por dos razones distintas:
 *
 *   · una URL firmada trae una firma nueva en cada render, así que el
 *     optimizador de Next nunca acertaría su caché: cada visita al planner
 *     serían treinta descargas y treinta recodificaciones;
 *   · un enlace de Canva o de Drive vive en un dominio que no podemos poner en
 *     `remotePatterns` porque no lo conocemos de antemano.
 */
function LienzoDePieza({
  url,
  fuente,
  colorPilar,
  nombrePilar,
  sizes,
  priority = false,
}: {
  url: string | null
  fuente: AssetSource | null
  colorPilar: string | null
  nombrePilar: string
  sizes: string
  priority?: boolean
}) {
  const [rota, setRota] = useState(false)

  // Una imagen nueva merece un intento nuevo.
  //
  // Sin esto, `rota` se queda pegada: el tile no se desmonta al reemplazar la
  // imagen —la `key` es el id de la pieza, que no cambia— así que un enlace que
  // falló una vez dejaba el tile en la placa para siempre, incluso después de
  // subir un archivo bueno. Se ajusta durante el render y no en un efecto, para
  // no pintar primero la versión equivocada. Mismo patrón que la semilla de
  // `planner-cliente.tsx`.
  const [urlPintada, setUrlPintada] = useState(url)
  if (urlPintada !== url) {
    setUrlPintada(url)
    setRota(false)
  }

  if (!url || rota) {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-1 p-2"
        style={{ backgroundColor: colorPilar ?? 'var(--color-surface-2)' }}
      >
        <Mono className="text-on-accent text-center leading-tight text-balance">{nombrePilar}</Mono>
        {/* Un enlace externo se puede caer o volverse privado sin avisar. Por
            eso se distingue de "todavía no hay imagen": son dos problemas con
            arreglos distintos. */}
        {rota && fuente === 'enlace' && (
          <Mono className="text-on-accent flex items-center gap-1 opacity-70">
            <Link2 aria-hidden className="size-3" /> Enlace roto
          </Mono>
        )}
      </div>
    )
  }

  return (
    <Image
      src={url}
      alt=""
      fill
      sizes={sizes}
      unoptimized
      priority={priority}
      onError={() => setRota(true)}
      className="object-cover"
    />
  )
}

export function TilePieza({
  pieza,
  urlAsset,
  entrega,
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
  /** Ya firmada por el servidor. `null` = todavía no hay material. */
  urlAsset: string | null
  entrega: EstadoEntrega
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
  const atrasada = entrega === 'atrasada'

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
      // ⚠️ Este texto lo lee `e2e/planner-arrastre.spec.ts` para saber qué pieza
      // quedó en qué día. Si cambia el formato, se actualiza allá también.
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
        <LienzoDePieza
          url={urlAsset}
          fuente={pieza.assetSource}
          colorPilar={colorPilar}
          nombrePilar={nombrePilar}
          sizes={columnas === 5 ? '18vw' : '30vw'}
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

      {/*
        Entrega vencida y sin material: el atraso que de verdad se persigue.

        El marco va en un hijo y NO en el `outline` del botón a propósito: el
        outline ya significa "aquí vas a soltar" durante el arrastre, y dos
        cosas distintas con el mismo trazo dejan de decir cualquiera de las dos.
      */}
      {atrasada && (
        <>
          <span aria-hidden className="border-accent-hot absolute inset-0 border-2" />
          <span className="bg-bg/85 absolute right-1 bottom-2 px-1 group-hover:opacity-0">
            <Mono className="text-accent-hot">Vencida</Mono>
          </span>
        </>
      )}

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
  urlAsset,
  colorPilar,
  nombrePilar,
  contentMap,
}: {
  pieza: Pieza
  urlAsset: string | null
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
        <LienzoDePieza
          url={urlAsset}
          fuente={pieza.assetSource}
          colorPilar={colorPilar}
          nombrePilar={nombrePilar}
          sizes="30vw"
          priority
        />
      )}
      <span className="bg-bg/70 absolute top-1 right-1 flex size-5 items-center justify-center">
        <Icono aria-hidden className="text-fg size-3" />
      </span>
    </div>
  )
}
