import { Mono } from '@/components/ui/primitives'
import {
  formatearDia,
  formatearPesos,
  seriesCostoPorResultado,
  type AdSetPauta,
} from '@/domain/pauta'

/**
 * Costo por resultado por día, una línea por ad set. SVG a mano.
 *
 * Sin librería de charts: son dos polilíneas y cuatro reglas. Meter Recharts
 * por esto costaría ~90 KB de JavaScript en el bundle de una sección que se
 * mira y no se toca, y encima traería su propia paleta que habría que pelear
 * para que respete los tokens.
 *
 * `vectorEffect="non-scaling-stroke"` es lo que mantiene el hairline en 1px
 * real: el viewBox se estira al ancho del contenedor y sin eso el trazo
 * engordaría con él.
 */

const ANCHO = 760
const ALTO = 240
const PAD = { arriba: 16, derecha: 16, abajo: 30, izquierda: 68 }

/**
 * Colores de serie por token, no por hex.
 *
 * El primero es accent-hot porque casi siempre hay dos ad sets y el que
 * interesa mirar es el primero; el resto baja de contraste a propósito.
 */
const COLORES_SERIE = [
  'var(--color-accent-hot)',
  'var(--color-fg-muted)',
  'var(--color-high)',
  'var(--color-ok)',
  'var(--color-medium)',
] as const

export function GraficaCostoPorResultado({ adSets }: { adSets: AdSetPauta[] }) {
  const { fechas, series, maximoCents } = seriesCostoPorResultado(
    adSets.map((a) => ({ id: a.id, nombre: a.nombre, diarias: a.diarias })),
  )

  if (fechas.length === 0 || maximoCents === 0) {
    return (
      <p className="text-fg-muted text-[13px]">
        La gráfica aparece en cuanto haya al menos un día con resultados capturados. Importa el CSV
        del ads manager o captura los números a mano abajo.
      </p>
    )
  }

  const techo = techoDelEje(maximoCents)
  const anchoUtil = ANCHO - PAD.izquierda - PAD.derecha
  const altoUtil = ALTO - PAD.arriba - PAD.abajo

  // Con un solo día no hay pendiente que dibujar: el punto va al centro en vez
  // de pegarse al borde izquierdo, que se lee como un error de render.
  const x = (i: number) =>
    fechas.length === 1
      ? PAD.izquierda + anchoUtil / 2
      : PAD.izquierda + (i * anchoUtil) / (fechas.length - 1)
  const y = (cents: number) => PAD.arriba + altoUtil - (cents / techo) * altoUtil

  const marcas = [0, techo / 2, techo]

  return (
    <div className="flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Costo por resultado por día, del ${formatearDia(fechas[0] ?? '')} al ${formatearDia(fechas.at(-1) ?? '')}.`}
      >
        {/* Reglas horizontales. Tres bastan: una rejilla completa compite con
            los datos y esta gráfica se lee por forma, no por valor exacto. */}
        {marcas.map((cents) => (
          <g key={cents}>
            <line
              x1={PAD.izquierda}
              x2={ANCHO - PAD.derecha}
              y1={y(cents)}
              y2={y(cents)}
              stroke="var(--color-line)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={PAD.izquierda - 10}
              y={y(cents) + 4}
              textAnchor="end"
              fill="var(--color-fg-muted)"
              className="type-mono"
            >
              {formatearPesos(Math.round(cents))}
            </text>
          </g>
        ))}

        {fechas.map((fecha, i) => (
          <text
            key={fecha}
            x={x(i)}
            y={ALTO - 8}
            textAnchor="middle"
            fill="var(--color-fg-muted)"
            className="type-mono"
          >
            {formatearDia(fecha)}
          </text>
        ))}

        {series.map((serie, s) => {
          const color = COLORES_SERIE[s % COLORES_SERIE.length] ?? COLORES_SERIE[0]
          return (
            <g key={serie.adSetId}>
              {/* Los huecos parten la línea en tramos en vez de unirse por
                  encima: dibujar una recta sobre un día sin resultados
                  inventaría un dato que nadie capturó. */}
              {tramos(serie.puntos).map((tramo, t) => (
                <polyline
                  key={t}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  points={tramo.map(({ i, valor }) => `${x(i)},${y(valor)}`).join(' ')}
                />
              ))}
              {serie.puntos.map((valor, i) =>
                valor === null ? null : (
                  <circle key={i} cx={x(i)} cy={y(valor)} r={2.5} fill={color} />
                ),
              )}
            </g>
          )
        })}
      </svg>

      <ul className="flex flex-wrap items-center gap-4">
        {series.map((serie, s) => (
          <li key={serie.adSetId} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-0.5 w-4 shrink-0"
              style={{ backgroundColor: COLORES_SERIE[s % COLORES_SERIE.length] }}
            />
            <Mono className="text-fg-muted">{serie.nombre}</Mono>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Punto {
  i: number
  valor: number
}

/** Parte una serie con huecos en tramos continuos de dos puntos o más. */
function tramos(puntos: ReadonlyArray<number | null>): Punto[][] {
  const salida: Punto[][] = []
  let actual: Punto[] = []

  puntos.forEach((valor, i) => {
    if (valor === null) {
      if (actual.length > 1) salida.push(actual)
      actual = []
      return
    }
    actual.push({ i, valor })
  })

  if (actual.length > 1) salida.push(actual)
  return salida
}

/**
 * Techo del eje Y, redondeado hacia arriba a una cifra legible.
 *
 * Sin esto el máximo del eje sería el dato más alto y la curva tocaría el borde
 * de arriba, que se ve como si estuviera cortada.
 */
function techoDelEje(maximoCents: number): number {
  const conAire = maximoCents * 1.15
  const magnitud = 10 ** Math.floor(Math.log10(conAire))
  return Math.ceil(conAire / (magnitud / 2)) * (magnitud / 2)
}
