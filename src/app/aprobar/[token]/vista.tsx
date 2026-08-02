import { PostInstagram } from '@/components/post/post-instagram'
import { componerCaption } from '@/domain/post-preview'
import type { AssetSource } from '@/lib/datos/clientes'
import { urlsDeAssets } from '@/lib/datos/planner'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatMonthKey, type MonthKey } from '@/lib/time'
import { AccionesPieza } from './acciones-pieza'

/**
 * Lo que el cliente ve del mes.
 *
 * Reemplaza la presentación mensual, así que tiene que verse mejor que un
 * PowerPoint. Paleta invertida (tema claro fijo, sin importar la cookie del
 * estudio) y el acento es el color de marca DEL CLIENTE, no el rojo del
 * estudio.
 *
 * Todas las consultas de aquí corren como el usuario del portal, así que RLS
 * ya recortó lo que puede ver: solo piezas en `con_cliente`, `aprobado` o
 * `publicado`, y solo de su cliente. No hay un solo filtro de seguridad
 * escrito en este archivo, y es a propósito.
 */
export async function VistaPortal({
  clientId,
  nombre,
  handle,
  brandColor,
  avatarUrl,
  bio,
  mes,
}: {
  clientId: string
  nombre: string
  handle: string | null
  brandColor: string | null
  avatarUrl: string | null
  bio: string | null
  mes: MonthKey
}) {
  const supabase = await createClient()

  const [{ data: piezas }, { data: aprobaciones }] = await Promise.all([
    supabase
      .from('pieces')
      .select(
        'id, format, publish_at, hook, copy_in, copy_out, cta, hashtags, status, asset_url, asset_source',
      )
      .eq('client_id', clientId)
      .eq('month', mes)
      .order('publish_at', { nullsFirst: false }),
    supabase.from('approvals').select('piece_id, decision').eq('client_id', clientId),
  ])

  const lista = piezas ?? []
  // Firma en lote las imágenes de las piezas que ya tienen asset (los enlaces
  // externos pasan tal cual). RLS ya recortó la lista a lo client-visible, así
  // que aquí no se firma jamás un borrador. Misma función que el planner.
  const urls = await urlsDeAssets(
    lista.map((p) => ({
      id: p.id,
      assetUrl: p.asset_url,
      assetSource: p.asset_source as AssetSource | null,
    })),
  )
  const decidida = new Set((aprobaciones ?? []).map((a) => a.piece_id))
  const aprobadas = (aprobaciones ?? []).filter((a) => a.decision === 'aprobado').length

  const acento = brandColor ?? 'var(--color-accent)'

  return (
    <div data-tema="claro" className="bg-bg text-fg min-h-dvh pb-24">
      {/* Portada */}
      <header className="mx-auto max-w-3xl px-6 pt-16 pb-10">
        <p className="type-mono text-fg-muted">{nombre}</p>
        <h1 className="type-display mt-2 text-5xl" style={{ color: acento }}>
          {formatMonthKey(mes)}
        </h1>
        <p className="text-fg-muted mt-4 max-w-prose text-[15px]">
          {lista.length} piezas para tu revisión. Aprueba las que te gusten y pide cambios en las
          que no. Lo que apruebes se programa tal cual.
        </p>
      </header>

      {lista.length === 0 ? (
        <div className="mx-auto max-w-3xl px-6">
          <div className="border-line rounded-xs border border-dashed p-8">
            <p className="type-display text-lg">Todavía no hay nada que revisar</p>
            <p className="text-fg-muted mt-2 text-[13px]">
              En cuanto el estudio te mande el mes, lo vas a ver aquí.
            </p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-sm flex-col gap-12 px-6">
          {lista.map((p) => {
            const caption = componerCaption({
              hook: p.hook,
              copyIn: p.copy_in,
              copyOut: p.copy_out,
              cta: p.cta,
              hashtags: p.hashtags ?? [],
            })
            return (
              <article key={p.id} className="border-line overflow-hidden rounded-xs border">
                <PostInstagram
                  frame={false}
                  handle={handle}
                  avatarUrl={avatarUrl}
                  bio={bio}
                  brandColor={brandColor}
                  imageUrl={urls[p.id] ?? null}
                  format={p.format}
                  caption={caption}
                  fecha={p.publish_at ? formatDate(new Date(p.publish_at)) : null}
                />

                <AccionesPieza
                  clientId={clientId}
                  pieceId={p.id}
                  yaDecidida={decidida.has(p.id)}
                  acento={acento}
                />
              </article>
            )
          })}
        </div>
      )}

      {/* Contador fijo. Que se sienta el avance. */}
      {lista.length > 0 && (
        <div
          data-print="hide"
          className="border-line bg-bg fixed inset-x-0 bottom-0 border-t px-6 py-3"
        >
          <p className="type-mono mx-auto max-w-3xl">
            {aprobadas} de {lista.length} aprobadas
          </p>
        </div>
      )}
    </div>
  )
}
