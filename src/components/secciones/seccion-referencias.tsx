import { Display, Mono } from '@/components/ui/primitives'
import { PLATFORM_LABEL } from '@/domain/labels'
import { diasSinPublicar, DIAS_SIN_PUBLICAR_AMBAR } from '@/domain/redes'
import type { CuentaDeReferencia } from '@/lib/datos/referencias'
import { relativeDays } from '@/lib/time'
import { PanelReferencias, type TarjetaReferencia } from './panel-referencias'

/**
 * § Referencias — la competencia y la inspiración.
 *
 * Maquinaria del estudio: `data-print="hide"` la saca del PDF del "modo
 * cliente". Que el cliente no vea contra quién lo comparamos no es una decisión
 * de interfaz — la base lo niega con RLS (`rls_referencias_test`) —, pero el
 * entregable impreso también tiene que respetarlo.
 *
 * Como en § Redes, los textos "hace N días" y la brecha contra el cliente se
 * calculan aquí, en el servidor, con `ahora` recibido por prop para que el
 * render sea determinista.
 */
export function SeccionReferencias({
  clientId,
  orgId,
  slug,
  cuentas,
  seguidoresCliente,
  ahora,
}: {
  clientId: string
  orgId: string
  slug: string
  cuentas: CuentaDeReferencia[]
  /** Seguidores de Instagram del propio cliente, para la brecha. `null` si no hay. */
  seguidoresCliente: number | null
  ahora: Date
}) {
  const tarjetas: TarjetaReferencia[] = cuentas.map((c) => {
    const dias = diasSinPublicar(c.lastPostAt, ahora)

    return {
      id: c.id,
      plataforma: PLATFORM_LABEL[c.platform],
      handle: c.handle,
      url: c.url,
      label: c.label,
      kind: c.kind,
      seguidores: c.followers,
      brechaConCliente:
        c.kind === 'competencia' && seguidoresCliente !== null
          ? c.followers - seguidoresCliente
          : null,
      porSemana: c.postsPerWeek,
      textoUltima: c.lastPostAt ? relativeDays(ahora, new Date(c.lastPostAt)) : 'sin datos aún',
      ultimaEnAlerta: dias === null || dias > DIAS_SIN_PUBLICAR_AMBAR,
      topPosts: c.topPosts.map((p) => ({
        caption: p.caption,
        likes: p.likes,
        comments: p.comments,
        url: p.url,
      })),
      textoRevision: c.checkedAt
        ? `Actualizada ${relativeDays(ahora, new Date(c.checkedAt))}`
        : null,
    }
  })

  return (
    <div data-print="hide">
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Referencias
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            La competencia y las cuentas que inspiran, para comparar y sacar ideas. El cliente no ve
            esta sección.
          </p>
        </div>
        <Mono className="text-fg-muted">
          {tarjetas.length} {tarjetas.length === 1 ? 'cuenta' : 'cuentas'}
        </Mono>
      </header>

      <PanelReferencias clientId={clientId} orgId={orgId} slug={slug} tarjetas={tarjetas} />
    </div>
  )
}
