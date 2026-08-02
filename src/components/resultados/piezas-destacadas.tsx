import { Display, Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL } from '@/domain/labels'
import { formatearNumero } from '@/domain/metricas'
import type { PiezaConMetricas } from '@/lib/datos/resultados'
import { formatDate } from '@/lib/time'

/**
 * Top 5 y Últimas 3.
 *
 * La "miniatura de 48px" es un bloque del color del pilar con la inicial del
 * formato, no una imagen: el sistema **no guarda assets** —eso vive fuera de la
 * app, es scope declarado— así que no hay archivo que enseñar. Un cuadro de
 * color con la letra distingue las piezas de un vistazo igual de bien y no
 * finge un thumbnail que no existe.
 */
export function PiezasDestacadas({
  top,
  ultimas,
}: {
  top: readonly PiezaConMetricas[]
  ultimas: readonly PiezaConMetricas[]
}) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <ListaDePiezas
        titulo="Top 5 piezas"
        vacio="Sin piezas medidas todavía este mes."
        piezas={top}
      />
      <ListaDePiezas
        titulo="Últimas 3"
        vacio="Todavía no se publica ninguna pieza con métricas."
        piezas={ultimas}
      />
    </div>
  )
}

function ListaDePiezas({
  titulo,
  vacio,
  piezas,
}: {
  titulo: string
  vacio: string
  piezas: readonly PiezaConMetricas[]
}) {
  return (
    <section>
      <Display as="h3" className="mb-4 text-base">
        {titulo}
      </Display>

      {piezas.length === 0 ? (
        <p className="text-fg-muted text-[13px]">{vacio}</p>
      ) : (
        <ul className="flex flex-col">
          {piezas.map((pieza) => (
            <li
              key={pieza.id}
              className="border-line flex items-center gap-4 border-b py-3 last:border-b-0"
            >
              <span
                aria-hidden
                className="type-display grid size-12 shrink-0 place-items-center rounded-xs text-base"
                style={{ backgroundColor: pieza.color, color: 'var(--color-on-accent)' }}
              >
                {PIECE_FORMAT_LABEL[pieza.formato].charAt(0)}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px]">{pieza.hook}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3">
                  <Mono className="text-fg-muted">
                    {pieza.publicadaEn ? formatDate(new Date(pieza.publicadaEn)) : 'sin fecha'}
                  </Mono>
                  <Mono className="text-fg-muted">{PIECE_FORMAT_LABEL[pieza.formato]}</Mono>
                  <Mono className="text-fg-muted truncate">{pieza.pilar}</Mono>
                </div>
              </div>

              <div className="shrink-0 text-right">
                <Mono>{formatearNumero(pieza.alcance)} alcance</Mono>
                <Mono as="div" className="text-fg-muted mt-1">
                  {formatearNumero(pieza.guardados)} guardados ·{' '}
                  {formatearNumero(pieza.compartidos)} compartidos
                </Mono>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
