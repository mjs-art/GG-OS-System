import { Mono } from '@/components/ui/primitives'
import { formatearNumero, puntosDeLinea, type PuntoSeguidores } from '@/domain/metricas'
import { formatMonthKey } from '@/lib/time'

/**
 * Crecimiento de seguidores, seis meses.
 *
 * SVG a mano y **sin librería de gráficas** a propósito. Una librería trae su
 * propio look —ejes gruesos, tooltips con sombra, una paleta que no es la
 * nuestra— y llegar de vuelta a "línea hairline con relleno muy tenue" cuesta
 * más pelearlo que dibujar dos `path`. Aquí son treinta líneas y hereda los
 * tokens del tema sin configurar nada.
 *
 * El `viewBox` hace el trabajo de responsive: el SVG escala solo, sin medir el
 * contenedor y sin JavaScript en el navegador.
 */

const ANCHO = 600
const ALTO = 120
/** Aire arriba y abajo para que la línea no se corte contra el borde. */
const PADDING = 6

export function GraficaSeguidores({ serie }: { serie: readonly PuntoSeguidores[] }) {
  if (serie.length === 0) {
    return (
      <p className="text-fg-muted max-w-prose text-[13px]">
        La curva de seguidores necesita al menos un mes capturado. Importa el CSV o captura los
        números a mano y aparece aquí.
      </p>
    )
  }

  const valores = serie.map((p) => p.total)
  const puntos = puntosDeLinea(valores, ANCHO, ALTO, PADDING)

  const linea = puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  // El relleno cierra la línea contra la base. Es el mismo trazo más dos
  // esquinas; no hace falta un segundo cálculo.
  const relleno = `${puntos[0]?.x ?? 0},${ALTO} ${linea} ${puntos.at(-1)?.x ?? ANCHO},${ALTO}`

  const primero = serie[0]
  const ultimo = serie.at(-1)
  const ganados = (ultimo?.total ?? 0) - (primero?.total ?? 0)

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <Mono className="text-fg-muted">Crecimiento de seguidores · {serie.length} meses</Mono>
        <Mono className={ganados >= 0 ? 'text-ok' : 'text-accent-hot'}>
          {ganados >= 0 ? '↑' : '↓'} {formatearNumero(Math.abs(ganados))} en el periodo
        </Mono>
      </figcaption>

      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        className="border-line h-28 w-full border-b"
        role="img"
        aria-label={serie
          .map((p) => `${formatMonthKey(p.mes)}: ${formatearNumero(p.total)} seguidores`)
          .join('. ')}
      >
        <polygon points={relleno} fill="var(--color-accent)" opacity={0.12} />
        <polyline
          points={linea}
          fill="none"
          stroke="var(--color-accent-hot)"
          // Hairline de verdad: 1px sin importar cómo escale el viewBox.
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        {puntos.map((p, i) => (
          <circle
            key={serie[i]?.mes ?? i}
            cx={p.x}
            cy={p.y}
            r={2}
            fill="var(--color-bg)"
            stroke="var(--color-accent-hot)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between">
        {serie.map((punto) => (
          <div key={punto.mes} className="flex min-w-0 flex-col">
            <Mono className="text-fg-muted truncate">{formatMonthKey(punto.mes).slice(0, 3)}</Mono>
            <Mono className="truncate">{formatearNumero(punto.total)}</Mono>
          </div>
        ))}
      </div>
    </figure>
  )
}
