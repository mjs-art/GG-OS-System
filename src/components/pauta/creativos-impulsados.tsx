import { Chip, Mono } from '@/components/ui/primitives'
import {
  CREATIVO_ESTADO_LABEL,
  formatearMetrica,
  type AdSetPauta,
  type CreativoPauta,
} from '@/domain/pauta'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import { formatDate } from '@/lib/time'

/**
 * Las piezas del planner que se están impulsando.
 *
 * La "miniatura" es un bloque de color con el formato, no una imagen: el
 * sistema no guarda archivos de las piezas —`pieces.asset_status` solo dice
 * pendiente o recibido— y una caja gris que finge ser una foto es peor que un
 * bloque que dice honestamente qué es. El color viene del pilar, igual que en
 * el planner y el calendario, para que la pieza se reconozca de un vistazo.
 *
 * Las métricas que se muestran son las del AD SET, no las del creativo:
 * `ad_metrics` se captura por ad set y por día. Dice "del ad set" en la
 * etiqueta para que nadie lea el número como rendimiento de esa pieza.
 */
export function CreativosImpulsados({
  creativos,
  adSets,
}: {
  creativos: CreativoPauta[]
  adSets: AdSetPauta[]
}) {
  if (creativos.length === 0) {
    return (
      <p className="text-fg-muted text-[13px]">
        Ninguna pieza del planner está colgada a esta campaña. Marca las piezas que se impulsan para
        poder leer qué creativo trajo los resultados.
      </p>
    )
  }

  const porAdSet = new Map(adSets.map((a) => [a.id, a] as const))

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {creativos.map((c) => {
        const adSet = porAdSet.get(c.adSetId)
        return (
          <li key={c.id} className="border-line bg-surface flex gap-3 rounded-xs border p-3">
            {/* El color del pilar es dato de la base, no diseño: entra por
                `style` y por eso la prueba de tokens no lo cuenta. */}
            <div
              aria-hidden
              className="border-line flex size-14 shrink-0 items-center justify-center rounded-xs border"
              style={{ backgroundColor: c.color ?? 'var(--color-surface-2)' }}
            >
              <Mono className="text-on-accent">{PIECE_FORMAT_LABEL[c.formato].slice(0, 3)}</Mono>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="truncate text-[13px]" title={c.titulo}>
                {c.titulo}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip tone="neutral">{c.adSetNombre}</Chip>
                <Chip tone={c.estado === 'activo' ? 'ok' : 'neutral'}>
                  {CREATIVO_ESTADO_LABEL[c.estado]}
                </Chip>
              </div>
              <Mono className="text-fg-muted tabular-nums">
                {c.publicarEl ? formatDate(new Date(c.publicarEl)) : 'Sin fecha'}
                {adSet && (
                  <>
                    {' · '}
                    {formatearMetrica('resultados', adSet.totales.resultados)} res. a{' '}
                    {formatearMetrica('costoPorResultado', adSet.totales.costoPorResultadoCents)}{' '}
                    del ad set
                  </>
                )}
              </Mono>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
