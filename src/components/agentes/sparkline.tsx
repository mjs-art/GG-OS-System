import { cn } from '@/lib/cn'

/**
 * Sparkline hairline, SVG a mano y sin librerías.
 *
 * Una gráfica de catorce números no justifica 40 KB de JavaScript en el
 * bundle. Lo que sí necesita es respetar el sistema: una línea de 1px del color
 * que herede del contenedor y cero relleno.
 *
 * `vectorEffect="non-scaling-stroke"` es lo que la mantiene hairline: el
 * viewBox se estira al ancho de la tarjeta y sin eso el trazo se estira con él
 * y deja de ser 1px justo cuando la tarjeta es angosta.
 */

const ANCHO = 100
const ALTO = 24

export function Sparkline({
  valores,
  etiqueta,
  className,
}: {
  valores: readonly number[]
  /** Nombre accesible: una gráfica sin texto no existe para un lector de pantalla. */
  etiqueta: string
  className?: string
}) {
  if (valores.length < 2) return null

  const maximo = Math.max(...valores, 1)
  const paso = ANCHO / (valores.length - 1)

  const puntos = valores.map((valor, i) => {
    const x = i * paso
    // El 1.5 de margen deja que el punto de hoy quepa sin cortarse arriba.
    const y = ALTO - 1.5 - (valor / maximo) * (ALTO - 3)
    return { x, y, valor }
  })

  const ultimo = puntos[puntos.length - 1]
  const linea = puntos.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={etiqueta}
      className={cn('h-6 w-full', className)}
    >
      {/* La base marca el cero: sin ella, catorce días en cero se ven idénticos
          a catorce días de una corrida diaria. */}
      <line
        x1={0}
        y1={ALTO - 1.5}
        x2={ANCHO}
        y2={ALTO - 1.5}
        stroke="var(--color-line)"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={linea}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {ultimo && (
        // Hoy lleva punto. Es una línea de largo cero con punta redonda y no un
        // <circle>: con `preserveAspectRatio="none"` un círculo se estira a
        // óvalo, y el trazo no escalable no.
        <line
          x1={ultimo.x}
          y1={ultimo.y}
          x2={ultimo.x}
          y2={ultimo.y}
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
