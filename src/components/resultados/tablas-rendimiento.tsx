import { Display, Mono } from '@/components/ui/primitives'
import { PIECE_FORMAT_LABEL, type PieceFormat } from '@/domain/labels'
import {
  formatearNumero,
  formatearPorcentaje,
  indiceDelMejor,
  type RenglonRendimiento,
} from '@/domain/metricas'
import { cn } from '@/lib/cn'

/**
 * Las dos tablas que alimentan el volumen del mes siguiente.
 *
 * Tienen peso visual a propósito: de aquí sale la decisión de subir carruseles
 * o bajar posts, y esa decisión es la que el cliente ve convertida en plan. El
 * mejor renglón se resalta en acento.
 *
 * `criterio` decide qué es "el mejor" y NO tiene default. Hoy las dos tablas se
 * ordenan por alcance promedio, donde más es mejor; el día que alguien agregue
 * una columna de costo, tener que declararlo evita resaltar el renglón más caro
 * como si fuera el bueno.
 */

export interface TablaRendimientoProps {
  titulo: string
  /** Cómo se llama la primera columna: "Formato" o "Pilar". */
  columna: string
  renglones: ReadonlyArray<RenglonRendimiento & { color?: string }>
  /** Traduce la clave cruda del renglón a la etiqueta que se lee. */
  etiquetaDe?: (clave: string) => string
}

export function TablaRendimiento({
  titulo,
  columna,
  renglones,
  etiquetaDe,
}: TablaRendimientoProps) {
  // Alcance promedio y no total: una tabla ordenada por total siempre corona al
  // formato del que se hicieron más piezas, que es un dato de producción, no
  // de rendimiento.
  const mejor = indiceDelMejor(renglones, (r) => r.alcancePromedio, 'mayor_es_mejor')

  return (
    <div className="border-line rounded-xs border p-5">
      <Display as="h3" className="mb-4 text-base">
        {titulo}
      </Display>

      {renglones.length === 0 ? (
        <p className="text-fg-muted text-[13px]">
          Sin piezas medidas este mes. En cuanto importes las métricas por pieza, esta tabla dice
          qué formato rindió mejor.
        </p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="type-mono text-fg-muted pb-2 font-medium">
                {columna}
              </th>
              <th scope="col" className="type-mono text-fg-muted pb-2 text-right font-medium">
                Piezas
              </th>
              <th scope="col" className="type-mono text-fg-muted pb-2 text-right font-medium">
                Alcance prom.
              </th>
              <th scope="col" className="type-mono text-fg-muted pb-2 text-right font-medium">
                Guardados prom.
              </th>
              <th scope="col" className="type-mono text-fg-muted pb-2 text-right font-medium">
                Engagement
              </th>
            </tr>
          </thead>
          <tbody>
            {renglones.map((r, i) => (
              <tr
                key={r.clave}
                className={cn(
                  'border-line border-b last:border-b-0',
                  i === mejor && 'text-accent-hot',
                )}
              >
                <th scope="row" className="py-3 pr-3 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-2">
                    {r.color && (
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                    )}
                    <span className="truncate text-[13px]">
                      {etiquetaDe ? etiquetaDe(r.clave) : r.clave}
                    </span>
                    {i === mejor && <Mono className="shrink-0">mejor</Mono>}
                  </span>
                </th>
                <td className="py-3 text-right">
                  <Mono>{r.piezas}</Mono>
                </td>
                <td className="py-3 text-right">
                  <Mono>{formatearNumero(r.alcancePromedio)}</Mono>
                </td>
                <td className="py-3 text-right">
                  <Mono>{formatearNumero(r.guardadosPromedio)}</Mono>
                </td>
                <td className="py-3 text-right">
                  <Mono>{formatearPorcentaje(r.engagementPct)}</Mono>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** Las dos, lado a lado. Apiladas abajo de 1024px: cinco columnas no caben. */
export function TablasRendimiento({
  porFormato,
  porPilar,
}: {
  porFormato: readonly RenglonRendimiento[]
  porPilar: ReadonlyArray<RenglonRendimiento & { color: string }>
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <TablaRendimiento
        titulo="Rendimiento por formato"
        columna="Formato"
        renglones={porFormato}
        etiquetaDe={(clave) => PIECE_FORMAT_LABEL[clave as PieceFormat] ?? clave}
      />
      <TablaRendimiento titulo="Rendimiento por pilar" columna="Pilar" renglones={porPilar} />
    </div>
  )
}
