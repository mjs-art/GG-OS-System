import { PIECE_FORMAT_LABEL } from '@/domain/labels'
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
  brandColor,
  mes,
}: {
  clientId: string
  nombre: string
  brandColor: string | null
  mes: MonthKey
}) {
  const supabase = await createClient()

  const [{ data: piezas }, { data: pilares }, { data: aprobaciones }] = await Promise.all([
    supabase
      .from('pieces')
      .select('id, format, pillar_id, publish_at, hook, copy_in, copy_out, cta, hashtags, status')
      .eq('client_id', clientId)
      .eq('month', mes)
      .order('publish_at', { nullsFirst: false }),
    supabase.from('pillars').select('id, name, color').eq('client_id', clientId),
    supabase.from('approvals').select('piece_id, decision').eq('client_id', clientId),
  ])

  const lista = piezas ?? []
  const colorPilar = new Map((pilares ?? []).map((p) => [p.id, p] as const))
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
        <div className="mx-auto flex max-w-3xl flex-col gap-10 px-6">
          {lista.map((p) => {
            const pilar = p.pillar_id ? colorPilar.get(p.pillar_id) : undefined
            return (
              <article key={p.id} className="border-line rounded-xs border">
                <div className="border-line flex flex-wrap items-center gap-3 border-b px-5 py-3">
                  <span
                    aria-hidden
                    className="h-3 w-1 shrink-0"
                    style={{ backgroundColor: pilar?.color ?? acento }}
                  />
                  <span className="type-mono text-fg-muted">
                    {PIECE_FORMAT_LABEL[p.format]}
                    {p.publish_at ? ` · ${formatDate(new Date(p.publish_at))}` : ''}
                  </span>
                  {pilar && <span className="type-mono text-fg-muted">{pilar.name}</span>}
                  {decidida.has(p.id) && (
                    <span className="type-mono text-ok ml-auto">Ya respondiste</span>
                  )}
                </div>

                <div className="flex flex-col gap-4 px-5 py-5">
                  {p.hook && <p className="type-display text-xl">{p.hook}</p>}
                  {p.copy_in && <p className="text-[14px] whitespace-pre-wrap">{p.copy_in}</p>}
                  {p.copy_out && (
                    <p className="text-fg-muted text-[14px] whitespace-pre-wrap">{p.copy_out}</p>
                  )}
                  {p.cta && (
                    <p className="type-mono" style={{ color: acento }}>
                      {p.cta}
                    </p>
                  )}
                  {p.hashtags && p.hashtags.length > 0 && (
                    <p className="text-fg-muted text-[13px]">{p.hashtags.join(' ')}</p>
                  )}
                </div>

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
