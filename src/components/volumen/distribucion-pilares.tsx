import { Display, Mono } from '@/components/ui/primitives'
import { DESVIACION_MAXIMA_PILAR, type DistribucionPilar } from '@/domain/metricas'

/**
 * La barra segmentada por pilar y su desglose.
 *
 * El pilar que se desvía más de diez puntos de su objetivo **pulsa suave**. Es
 * el único movimiento de la sección y por eso funciona: si todo se moviera, el
 * pulso no diría nada. `motion-safe:` lo apaga para quien pidió menos
 * movimiento — y ahí queda el ícono de advertencia, que no depende de la
 * animación ni del color.
 *
 * Los colores entran por `style` y no por clase porque son un DATO del cliente,
 * no una decisión de diseño: cada cliente define sus pilares y sus colores.
 */
export function DistribucionPilares({ pilares }: { pilares: readonly DistribucionPilar[] }) {
  const hayPiezas = pilares.some((p) => p.piezas > 0)

  return (
    <section className="py-6">
      <Display as="h3" className="mb-4 text-base">
        Distribución por pilar
      </Display>

      {!hayPiezas ? (
        <p className="text-fg-muted max-w-prose text-[13px]">
          Todavía no hay piezas con pilar asignado este mes. En cuanto el planner tenga contenido,
          esta barra compara la mezcla real contra el objetivo.
        </p>
      ) : (
        <>
          <div
            className="border-line flex h-6 w-full overflow-hidden rounded-xs border"
            role="img"
            aria-label={pilares
              .map((p) => `${p.nombre} ${Math.round(p.pct)} por ciento`)
              .join(', ')}
          >
            {pilares
              .filter((p) => p.pct > 0)
              .map((p) => (
                <div
                  key={p.id}
                  className={p.fueraDeRango ? 'motion-safe:animate-pulse' : undefined}
                  style={{ width: `${p.pct}%`, backgroundColor: p.color }}
                />
              ))}
          </div>

          <ul className="mt-4 flex flex-col">
            {pilares.map((p) => (
              <li
                key={p.id}
                className="border-line flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-2.5 last:border-b-0"
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.nombre}</span>

                <Mono className="w-14 text-right">{Math.round(p.pct)}%</Mono>
                <Mono className="text-fg-muted w-28 text-right">
                  objetivo {Math.round(p.objetivoPct)}%
                </Mono>

                <Mono
                  className={p.fueraDeRango ? 'text-accent-hot w-44' : 'text-ok w-44'}
                  title={
                    p.fueraDeRango
                      ? `Se desvía ${Math.abs(Math.round(p.desviacion))} puntos del objetivo.`
                      : undefined
                  }
                >
                  {p.fueraDeRango
                    ? `⚠ ${p.desviacion > 0 ? '+' : '−'}${Math.abs(Math.round(p.desviacion))} puntos`
                    : '✓ en objetivo'}
                </Mono>
              </li>
            ))}
          </ul>

          <Mono as="p" className="text-fg-muted mt-3">
            Se marca a partir de {DESVIACION_MAXIMA_PILAR} puntos de diferencia
          </Mono>
        </>
      )}
    </section>
  )
}
