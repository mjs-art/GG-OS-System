import { Bookmark, Heart, Images, MessageCircle, Music, Play, Send } from 'lucide-react'
import Image from 'next/image'
import { Mono } from '@/components/ui/primitives'
import { imagenDePieza } from '@/components/planner/imagenes'
import { PIECE_FORMAT_LABEL, type PieceFormat } from '@/domain/labels'
import { cn } from '@/lib/cn'

/**
 * Una pieza vista como se va a publicar en Instagram.
 *
 * Presentacional puro: recibe props ya resueltas y no lee de Supabase ni crea
 * fechas. Por eso lo usan por igual el drawer del estudio (Client Component) y
 * el portal del cliente (Server Component). Se apoya solo en tokens de rol, así
 * que se ve bien en el tema oscuro del estudio y en el claro fijo del portal
 * sin una sola condición de tema.
 *
 * Lo que NO hace, a propósito: inventar métricas. La captura de referencia
 * mostraba "100 me gusta", pero un número de likes fabricado en la vista del
 * cliente se lee como una promesa, no como un mockup. El chrome de Instagram
 * —los íconos de corazón, comentario, compartir y guardar— ya comunica "así se
 * va a ver"; los likes reales llegan por la sección de Resultados, con su CSV
 * atrás. Los reels muestran "Audio original", que es la etiqueta real por
 * defecto de Instagram, no un título de canción inventado.
 */

const ICONO_FORMATO = { post: null, carrusel: Images, reel: Play } as const

export interface PostInstagramProps {
  handle: string | null
  avatarUrl: string | null
  bio: string | null
  /** El acento de la cuenta: fondo del monograma cuando no hay avatar. */
  brandColor: string | null
  /** URL firmada de la imagen, o null → cae al placeholder por semilla. */
  imageUrl: string | null
  /** La semilla del placeholder cuando no hay imagen real (el id de la pieza). */
  fallbackSeed: string
  format: PieceFormat
  /** El caption ya armado con `componerCaption`. */
  caption: string
  /** Fecha ya formateada por quien llama; los componentes no crean Date. */
  fecha?: string | null
  /** El marco propio (borde + radio + ancho). Falso cuando va embebido en otra tarjeta. */
  frame?: boolean
  className?: string
}

export function PostInstagram({
  handle,
  avatarUrl,
  bio,
  brandColor,
  imageUrl,
  fallbackSeed,
  format,
  caption,
  fecha,
  frame = true,
  className,
}: PostInstagramProps) {
  const usuario = handle ?? 'tu_cuenta'
  const IconoFormato = ICONO_FORMATO[format]
  const src = imageUrl ?? imagenDePieza(fallbackSeed)

  return (
    <div
      className={cn(
        'bg-surface w-full',
        frame && 'border-line mx-auto max-w-sm overflow-hidden rounded-xs border',
        className,
      )}
    >
      {/* Header: avatar + handle + bio corta */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar avatarUrl={avatarUrl} handle={usuario} brandColor={brandColor} />
        <div className="min-w-0">
          <Mono as="div" className="text-fg truncate tracking-normal normal-case">
            {usuario}
          </Mono>
          {bio && <p className="text-fg-muted truncate text-[11px] leading-tight">{bio}</p>}
        </div>
      </div>

      {/* Imagen cuadrada con la seña del formato */}
      <div className="bg-surface-2 relative aspect-square w-full">
        <Image
          src={src}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 384px"
          className="object-cover"
        />

        {/* Reel: badge de play. Carrusel: pila de imágenes. Post: nada. */}
        {IconoFormato && (
          <span className="bg-bg/70 absolute top-2 right-2 flex size-6 items-center justify-center rounded-xs">
            <IconoFormato aria-hidden className="text-fg size-3.5" />
            <span className="sr-only">{PIECE_FORMAT_LABEL[format]}</span>
          </span>
        )}
      </div>

      {/* Reel: la tira de audio, con la etiqueta real por defecto de Instagram. */}
      {format === 'reel' && (
        <div className="border-line flex items-center gap-2 border-t px-3 py-2">
          <Music aria-hidden className="text-fg-muted size-3" />
          <Mono className="text-fg-muted tracking-normal normal-case">
            Audio original · {usuario}
          </Mono>
        </div>
      )}

      {/* Chrome de acciones. Decorativo: es un preview, nada da like ni publica. */}
      <div className="flex items-center gap-4 px-3 pt-3">
        <Heart aria-hidden className="text-fg size-5" />
        <MessageCircle aria-hidden className="text-fg size-5" />
        <Send aria-hidden className="text-fg size-5" />
        <Bookmark aria-hidden className="text-fg ml-auto size-5" />
      </div>

      {/* Caption: el handle en negritas seguido del texto armado. */}
      <div className="flex flex-col gap-2 px-3 pt-2 pb-3">
        {caption && (
          <p className="text-fg text-[13px] leading-relaxed whitespace-pre-wrap">
            <span className="font-bold">{usuario}</span> {caption}
          </p>
        )}
        {fecha && <Mono className="text-fg-muted">{fecha}</Mono>}
      </div>
    </div>
  )
}

function Avatar({
  avatarUrl,
  handle,
  brandColor,
}: {
  avatarUrl: string | null
  handle: string
  brandColor: string | null
}) {
  if (avatarUrl) {
    return (
      <span className="relative size-9 shrink-0 overflow-hidden rounded-full">
        <Image src={avatarUrl} alt="" fill sizes="36px" className="object-cover" />
      </span>
    )
  }

  // Sin foto: monograma con la inicial sobre el color de marca. El color entra
  // por style porque es dato del cliente, no diseño.
  const inicial = handle.replace(/^@/, '').charAt(0).toUpperCase() || '·'
  return (
    <span
      aria-hidden
      className="text-on-accent flex size-9 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: brandColor ?? 'var(--color-accent)' }}
    >
      <Mono className="text-on-accent">{inicial}</Mono>
    </span>
  )
}
