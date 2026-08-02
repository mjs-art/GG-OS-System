import { Display, Mono } from '@/components/ui/primitives'
import { formatearContraAnterior } from '@/domain/metricas'
import type { RenglonVolumen } from '@/lib/datos/volumen'

/**
 * Un bloque del plan: FEED (22) o STORIES (46), con su tabla.
 *
 * Cuatro columnas y **cero bordes verticales**. Las líneas verticales parten la
 * tabla en cajas y hacen que cada número se lea solo; sin ellas el renglón se
 * lee completo —cantidad, variación y razón— que es exactamente como hay que
 * leerlo cuando se presenta.
 */
export function TablaConteos({
  titulo,
  total,
  renglones,
}: {
  titulo: string
  total: number
  renglones: readonly RenglonVolumen[]
}) {
  return (
    <section className="py-6">
      <div className="mb-4 flex items-baseline gap-3">
        <Display as="h3" className="text-base">
          {titulo}
        </Display>
        <Mono className="text-fg-muted">{total} en total</Mono>
      </div>

      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          {titulo}: cantidad, variación contra el mes anterior y la razón de cada cambio.
        </caption>
        <thead>
          <tr className="border-line border-b">
            <th scope="col" className="type-mono text-fg-muted pb-2 font-medium">
              Formato
            </th>
            <th scope="col" className="type-mono text-fg-muted pb-2 text-right font-medium">
              Cantidad
            </th>
            <th scope="col" className="type-mono text-fg-muted pb-2 pl-4 font-medium">
              Variación
            </th>
            <th scope="col" className="type-mono text-fg-muted pb-2 pl-6 font-medium">
              Razón
            </th>
          </tr>
        </thead>
        <tbody>
          {renglones.map((r) => (
            <RenglonTabla key={r.clave} renglon={r} />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function RenglonTabla({ renglon }: { renglon: RenglonVolumen }) {
  const sube = renglon.anterior !== null && renglon.cantidad > renglon.anterior
  const baja = renglon.anterior !== null && renglon.cantidad < renglon.anterior

  return (
    <tr className="border-line border-b align-top last:border-b-0">
      <td className="py-4 pr-4 text-[13px]">{renglon.etiqueta}</td>

      <td className="py-4 text-right">
        <Display className="text-2xl">{renglon.cantidad}</Display>
      </td>

      <td className="py-4 pl-4">
        {/* La flecha la pone `formatearContraAnterior`, que es la misma función
            que arma el texto para presentación: así el renglón de la pantalla y
            el del correo dicen exactamente lo mismo.

            Subir no siempre es bueno ni bajar malo, así que el color no juzga:
            solo separa lo que se movió de lo que se quedó igual. El juicio lo
            da la razón de la derecha. */}
        <Mono className={sube || baja ? 'text-accent-hot' : 'text-fg-muted'}>
          {formatearContraAnterior(renglon.cantidad, renglon.anterior)}
        </Mono>
      </td>

      <td className="text-fg-muted max-w-prose py-4 pl-6 text-[13px]">
        {renglon.razon}
        {renglon.metrica && (
          <Mono as="div" className="text-fg mt-1.5">
            {renglon.metrica}
          </Mono>
        )}
      </td>
    </tr>
  )
}
