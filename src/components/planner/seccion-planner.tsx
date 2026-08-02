import { PlannerCliente } from '@/components/planner/planner-cliente'
import type { Cliente, Pieza, Story } from '@/components/planner/tipos'
import { datosDelPlanner } from '@/lib/datos/planner'
import type { MonthKey } from '@/lib/time'

/**
 * § Planner — la sección más grande del dashboard de cliente.
 *
 * Este componente es Server Component y su único trabajo es traer lo que falta
 * (las reglas duras que se verifican por código y las fechas clave del mes) y
 * entregárselo a la parte interactiva. Las piezas y las stories llegan por
 * props porque la página ya las leyó para el Resumen: volver a pedirlas serían
 * dos viajes a la base para los mismos renglones.
 *
 * Uso desde `src/app/(estudio)/cliente/[slug]/page.tsx`:
 *
 *   <SeccionPlanner cliente={cliente} mes={mes} piezas={piezas}
 *                   stories={stories} hoy={hoy} />
 */
export async function SeccionPlanner({
  cliente,
  mes,
  piezas,
  stories,
  hoy,
}: {
  cliente: Cliente
  mes: MonthKey
  piezas: readonly Pieza[]
  stories: readonly Story[]
  /** `2026-09-14` en la zona del estudio, para que el render sea determinista. */
  hoy: string
}) {
  const { reglas, fechasClave } = await datosDelPlanner(cliente.id, mes)

  return (
    <PlannerCliente
      cliente={cliente}
      mes={mes}
      piezasIniciales={piezas}
      storiesIniciales={stories}
      reglas={reglas}
      fechasClave={fechasClave}
      hoy={hoy}
    />
  )
}
