import { FichaGuion } from '@/components/guiones/ficha-guion'
import { RadarTendencias } from '@/components/guiones/radar-tendencias'
import { Display, EmptyState } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import type { Guion, Tendencia } from '@/lib/datos/guiones'

/**
 * § Guiones.
 *
 * La sección está partida en dos a propósito, con un hairline en medio: arriba
 * lo que escribió el Guionista, abajo el radar que alimenta Ana. Esa división
 * es el modelo mental completo del producto — el agente no descubre nada, lo
 * traduce — y si la interfaz la mezclara, en tres meses alguien pediría "que el
 * sistema detecte tendencias solo".
 */
export function SeccionGuiones({
  cliente,
  guiones,
  tendencias,
  hoy,
}: {
  cliente: Cliente
  guiones: Guion[]
  tendencias: Tendencia[]
  /** `AAAA-MM-DD` en la zona del estudio. Entra por prop para que el render sea determinista. */
  hoy: string
}) {
  const propuestos = guiones.filter((g) => g.estado === 'propuesto').length

  return (
    <>
      <header className="border-line mb-6 border-b pb-3">
        <Display as="h2" className="text-xl">
          Guiones
        </Display>
        <p className="text-fg-muted mt-1 text-[13px]">
          {guiones.length === 0
            ? 'El Guionista escribe sobre las tendencias del radar.'
            : `${guiones.length} ${guiones.length === 1 ? 'guion' : 'guiones'}, ${propuestos} sin revisar.`}
        </p>
      </header>

      {guiones.length === 0 ? (
        <EmptyState
          title="Todavía no hay guiones"
          body="El Guionista no sale a buscar tendencias: trabaja sobre las que tú registras. Anota abajo el audio o el formato que viste corriendo y mándaselo desde el planner, en la pieza que le toca."
        />
      ) : (
        <div className="flex flex-col gap-6">
          {guiones.map((guion) => (
            <FichaGuion
              key={guion.id}
              guion={guion}
              pilares={cliente.pilares}
              slug={cliente.slug}
              hoy={hoy}
            />
          ))}
        </div>
      )}

      <div className="border-line mt-12 border-t pt-8">
        <RadarTendencias
          clientId={cliente.id}
          slug={cliente.slug}
          nombreCliente={cliente.name}
          pilares={cliente.pilares.map((p) => p.name)}
          tendencias={tendencias}
          hoy={hoy}
        />
      </div>
    </>
  )
}
