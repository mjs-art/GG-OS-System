import { TimelineFechas } from '@/components/fechas/timeline-fechas'
import { Display } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import { MESES_DEL_TIMELINE, type FechaClave } from '@/lib/datos/fechas'
import { addMonths, formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Fechas y promociones.
 *
 * Seis meses hacia adelante y no un calendario del mes: estas fechas se planean
 * con anticipación o no se planean. Un Día de Muertos que aparece el 28 de
 * octubre ya no es una campaña, es una publicación apurada.
 */
export function SeccionFechas({
  cliente,
  mes,
  fechas,
  hoy,
  meses = MESES_DEL_TIMELINE,
}: {
  cliente: Cliente
  /** Primer mes del timeline. */
  mes: MonthKey
  fechas: FechaClave[]
  /** `AAAA-MM-DD` en la zona del estudio. Entra por prop para que el render sea determinista. */
  hoy: string
  meses?: number
}) {
  const conPauta = fechas.filter((f) => f.llevaPresupuesto).length
  const sinContenido = fechas.filter((f) => f.piezas.length === 0).length
  const ultimo = addMonths(mes, Math.max(1, meses) - 1)

  return (
    <>
      <header className="border-line mb-6 border-b pb-3">
        <Display as="h2" className="text-xl">
          Fechas y promociones
        </Display>
        <p className="text-fg-muted mt-1 text-[13px]">
          {fechas.length === 0
            ? `Nada agendado de ${formatMonthKey(mes)} a ${formatMonthKey(ultimo)}. Usa Proponer campañas en el mes que quieras llenar.`
            : `${fechas.length} fechas de ${formatMonthKey(mes)} a ${formatMonthKey(ultimo)}. ${conPauta} con pauta y ${sinContenido} todavía sin contenido asignado.`}
        </p>
      </header>

      <TimelineFechas
        clientId={cliente.id}
        slug={cliente.slug}
        mesInicial={mes}
        meses={meses}
        fechas={fechas}
        hoy={hoy}
      />
    </>
  )
}
