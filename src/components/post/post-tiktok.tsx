import { Heart, MessageCircle, Share2, Bookmark, Music } from 'lucide-react'
import Image from 'next/image'
import { Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL, type PieceFormat } from '@/domain/labels'
import { cn } from '@/lib/cn'

/**
 * Una pieza vista como se va a publicar en TikTok.
 *
 * Mismo contrato que `PostInstagram`: recibe props ya resueltas y no lee de
 * Supabase ni crea fechas. El layout replica el feed de TikTok: imagen/video
 * a pantalla completa, barra lateral derecha con las interacciones, y la
 * info del sonido y caption abajo.
 *
 * La imagen usa `object-cover` en un contenedor más alto que cuadrado (3:4)
 * porque TikTok favorece el formato vertical. Para reels/carrusel el badge
 * sigue siendo visible igual que en Instagram.
 */

export interface PostTikTokProps {
  handle: string | null
  avatarUrl: string | null
  bio: string | null
  brandColor: string | null
  imageUrl: string | null
  fallbackColor?: string | null
  format: PieceFormat
  caption: string
  fecha?: string | null
  frame?: boolean
  className?: string
}

export function PostTikTok({
  handle,
  avatarUrl,
  bio: _bio,
  brandColor,
  imageUrl,
  fallbackColor,
  format,
  caption,
  fecha: _fecha,
  frame = true,
  className,
}: PostTikTokProps) {
  const usuario = handle ?? 'tu_cuenta'

  return (
    <div
      className={cn(
        'bg-surface relative w-full overflow-hidden',
        frame && 'border-line mx-auto max-w-[280px] rounded-sm border',
        className,
      )}
    >
      {/* Contenedor de imagen: más alto que cuadrado, como TikTok */}
      <div className="bg-surface-2 relative h-[420px] w-full">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes="280px" unoptimized className="object-cover" />
        ) : (
          <div
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-4"
            style={{ backgroundColor: fallbackColor ?? brandColor ?? 'var(--color-surface-2)' }}
          >
            <Mono className="text-on-accent text-center leading-tight text-balance">
              {PIECE_FORMAT_LABEL[format]}
            </Mono>
          </div>
        )}

        {/* Overlay oscuro para que el texto blanco se lea sobre cualquier imagen */}
        <div
          aria-hidden
          className="from-bg/50 absolute inset-x-0 bottom-0 h-48 bg-linear-to-t to-transparent"
        />

        {/* Barra lateral derecha: avatar + interacciones */}
        <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4">
          {/* Avatar chico con anillo de seguir */}
          <div className="flex flex-col items-center gap-1">
            <Avatar avatarUrl={avatarUrl} handle={usuario} brandColor={brandColor} size={40} />
            <span className="bg-accent-hot mt-0.5 flex size-5 items-center justify-center rounded-full">
              <span className="text-bg text-[9px] leading-none">+</span>
            </span>
          </div>

          <BotonSocial icon={Heart} label="0" />
          <BotonSocial icon={MessageCircle} label="0" />
          <BotonSocial icon={Bookmark} label="0" />
          <BotonSocial icon={Share2} label="0" />
        </div>

        {/* Info del sonido y descripción */}
        <div className="absolute right-14 bottom-6 left-3 flex flex-col gap-2">
          {/* Usuario + caption */}
          <div>
            <Mono className="text-bg font-bold">{usuario}</Mono>
            {caption && (
              <p className="text-bg mt-1 line-clamp-3 text-[13px] leading-snug opacity-90">
                {caption}
              </p>
            )}
          </div>

          {/* Sonido */}
          <div className="flex items-center gap-1.5">
            <Music aria-hidden className="text-bg size-3" />
            <Mono className="text-bg truncate text-[11px] opacity-80">
              Audio original · {usuario}
            </Mono>
          </div>
        </div>
      </div>

      {/* Barra de navegación inferior — solo decorativa, como el chrome de IG */}
      <div className="border-line bg-surface flex items-center justify-around border-t px-2 py-2">
        <span className="type-mono text-fg text-[10px]">Inicio</span>
        <span className="type-mono text-fg text-[10px]">Amigos</span>
        <span className="bg-accent-hot flex size-6 items-center justify-center rounded-xs">
          <span className="text-bg text-[14px] leading-none">+</span>
        </span>
        <span className="type-mono text-fg text-[10px]">Bandeja</span>
        <span className="type-mono text-fg text-[10px]">Perfil</span>
      </div>
    </div>
  )
}

function BotonSocial({ icon: Icon, label }: { icon: typeof Heart; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="bg-bg/10 flex size-9 items-center justify-center rounded-full">
        <Icon aria-hidden className="text-bg size-5" />
      </span>
      <Mono className="text-bg text-[10px]">{label}</Mono>
    </div>
  )
}

function Avatar({
  avatarUrl,
  handle,
  brandColor,
  size,
}: {
  avatarUrl: string | null
  handle: string
  brandColor: string | null
  size: number
}) {
  if (avatarUrl) {
    return (
      <span
        className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/30"
        style={{ width: size, height: size }}
      >
        <Image src={avatarUrl} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    )
  }

  const inicial = handle.replace(/^@/, '').charAt(0).toUpperCase() || '·'
  return (
    <span
      aria-hidden
      className="text-on-accent flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: brandColor ?? 'var(--color-accent)',
      }}
    >
      <Mono className="text-on-accent text-xs">{inicial}</Mono>
    </span>
  )
}
