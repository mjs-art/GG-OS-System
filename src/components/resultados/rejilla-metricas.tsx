import { Mono, Stat } from '@/components/ui/primitives'
import { calcularVariacion, formatearCompacto, formatearPorcentaje } from '@/domain/metricas'
import type { MetricasMes } from '@/lib/datos/resultados'

/**
 * Las ocho métricas del mes con su variación.
 *
 * Las ocho son "mayor es mejor", pero la dirección se declara métrica por
 * métrica de todos modos: el día que entre costo por resultado o costo por mil
 * a esta rejilla, el default silencioso pintaría de verde justo lo contrario.
 */
const METRICAS = [
  { clave: 'alcance', label: 'Alcance' },
  { clave: 'impresiones', label: 'Impresiones' },
  { clave: 'guardados', label: 'Guardados' },
  { clave: 'compartidos', label: 'Compartidos' },
  { clave: 'interacciones', label: 'Interacciones' },
  { clave: 'seguidoresNuevos', label: 'Seguidores nuevos' },
  { clave: 'visitasPerfil', label: 'Visitas al perfil' },
  { clave: 'clicsLink', label: 'Clics al link' },
] as const satisfies ReadonlyArray<{ clave: keyof MetricasMes; label: string }>

export function RejillaMetricas({
  actual,
  anterior,
}: {
  actual: MetricasMes
  anterior: MetricasMes | null
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {METRICAS.map(({ clave, label }) => {
        const valor = actual[clave]
        const base = anterior?.[clave] ?? null
        const v = calcularVariacion(
          typeof valor === 'number' ? valor : 0,
          typeof base === 'number' ? base : null,
          'mayor_es_mejor',
        )

        return (
          <Stat
            key={clave}
            value={formatearCompacto(typeof valor === 'number' ? valor : 0)}
            label={label}
            // El porcentaje cuando existe; el salto absoluto cuando no hay base
            // contra la cual sacarlo. Nunca un "+100%" inventado.
            delta={v.pct === null ? v.etiqueta : formatearPorcentaje(Math.abs(v.pct))}
            trend={v.tendencia}
            isGood={v.esBueno}
          />
        )
      })}
    </div>
  )
}

/** La procedencia del dato. Cuando entre la API, esto es lo que dirá qué revisar. */
export function OrigenDeLosNumeros({ origen }: { origen: MetricasMes['origen'] }) {
  const texto =
    origen === 'csv'
      ? 'Importado de un CSV'
      : origen === 'api'
        ? 'Leído por API'
        : 'Capturado a mano'

  return <Mono className="text-fg-muted">{texto}</Mono>
}
