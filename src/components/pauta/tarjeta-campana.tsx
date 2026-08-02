import { DetalleCampana } from '@/components/pauta/detalle-campana'
import { Chip, Display, Mono, ProgressBar } from '@/components/ui/primitives'
import {
  CAMPANA_ESTADO_LABEL,
  CHIP_PLATAFORMA,
  diasRestantes,
  formatearEntero,
  formatearMetrica,
  formatearPesos,
  formatearRango,
  pctPresupuestoGastado,
  type CampanaPauta,
} from '@/domain/pauta'
import { cn } from '@/lib/cn'

/**
 * Tarjeta de campaña activa, con el detalle plegado adentro.
 *
 * Es un `<details>` nativo y no un `useState`: la tarjeta no tiene nada más
 * interactivo, así el detalle se abre sin un byte de JavaScript de cliente,
 * funciona con el teclado sin escribir un solo handler y se imprime abierto
 * cuando alguien manda la página a PDF. El costo —no poder animar la apertura—
 * es exactamente lo que el brief no quería de todas formas.
 */
export function TarjetaCampana({ campana, hoy }: { campana: CampanaPauta; hoy: string }) {
  const restantes = diasRestantes(hoy, campana.fin)
  // Dos días es el punto en que ya no da tiempo de aprender nada nuevo: lo que
  // se decida hoy es lo último que va a alcanzar a mover el resultado.
  const urge = restantes <= 2
  const pct = pctPresupuestoGastado(campana.gastadoCents, campana.presupuestoCents)
  const nombreResultado = campana.metricaResultado ?? 'resultados'

  return (
    <details className="border-line bg-surface group rounded-xs border">
      <summary
        className={cn(
          'cursor-pointer list-none p-5',
          'hover:bg-surface-2 transition-colors duration-150 ease-out',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Display className="text-base">{campana.nombre}</Display>
              <Chip tone="neutral">{CHIP_PLATAFORMA[campana.plataforma]}</Chip>
              {campana.estado !== 'activa' && (
                <Chip tone="high">{CAMPANA_ESTADO_LABEL[campana.estado]}</Chip>
              )}
            </div>

            <Mono className="text-fg-muted">
              {campana.objetivo} · {formatearRango(campana.inicio, campana.fin)}
            </Mono>

            <div className="flex max-w-md flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <Mono className="text-fg tabular-nums">
                  {formatearPesos(campana.gastadoCents)} de{' '}
                  {formatearPesos(campana.presupuestoCents)}
                </Mono>
                <Mono className="text-fg-muted tabular-nums">{pct}%</Mono>
              </div>
              <ProgressBar value={campana.gastadoCents} max={campana.presupuestoCents} />
            </div>

            <Mono className={urge ? 'text-accent-hot' : 'text-fg-muted'}>
              {etiquetaDias(restantes)}
            </Mono>
          </div>

          <div className="flex flex-col items-end gap-1">
            <Display className="text-4xl tabular-nums">
              {formatearEntero(campana.totales.resultados)}
            </Display>
            <Mono className="text-fg-muted">{nombreResultado}</Mono>
            <Mono className="text-fg tabular-nums">
              {formatearMetrica('costoPorResultado', campana.totales.costoPorResultadoCents)} por
              resultado
            </Mono>

            <Mono className="text-fg-muted group-hover:text-accent-hot mt-3">
              <span className="group-open:hidden">Ver detalle →</span>
              <span className="hidden group-open:inline">Ocultar detalle ↑</span>
            </Mono>
          </div>
        </div>
      </summary>

      <div className="border-line border-t p-5">
        <DetalleCampana campana={campana} />
      </div>
    </details>
  )
}

/** "Último día" dice más que "0 días restantes", que se lee como un error. */
function etiquetaDias(restantes: number): string {
  if (restantes === 0) return 'Último día'
  if (restantes === 1) return 'Queda 1 día'
  return `Quedan ${restantes} días`
}
