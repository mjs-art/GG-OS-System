import { PlannerCliente } from '@/components/planner/planner-cliente'
import type { Cliente, Pieza, Story } from '@/components/planner/tipos'
import { listarEquipo } from '@/lib/datos/equipo'
import { datosDelPlanner, listarSprints, urlsDeAssets } from '@/lib/datos/planner'
import type { MonthKey } from '@/lib/time'

/**
 * § Planner — la sección más grande del dashboard de cliente.
 *
 * Este componente es Server Component y su único trabajo es traer lo que falta
 * y entregárselo a la parte interactiva. Las piezas y las stories llegan por
 * props porque la página ya las leyó para el Resumen: volver a pedirlas serían
 * dos viajes a la base para los mismos renglones.
 *
 * Lo que sí se pide aquí, y tiene que ser aquí:
 *
 *   · las URLs FIRMADAS de las imágenes. El bucket `piezas` es privado, así que
 *     una ruta no se puede pintar: hay que cambiarla por una URL con firma, y
 *     firmar es una operación del servidor. Si esto se hiciera en el navegador,
 *     el bucket tendría que ser público — y las piezas sin publicar son la
 *     estrategia del cliente antes de que salga.
 *   · el equipo y los sprints, que son del ORG y no del cliente.
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
  // En paralelo: son cuatro lecturas independientes y encadenarlas sumaría sus
  // esperas en vez de quedarse con la más lenta.
  const [{ reglas, fechasClave }, equipo, sprints, urls] = await Promise.all([
    datosDelPlanner(cliente.id, mes),
    listarEquipo(cliente.orgId),
    listarSprints(cliente.orgId),
    urlsDeAssets(piezas),
  ])

  return (
    <PlannerCliente
      cliente={cliente}
      mes={mes}
      piezasIniciales={piezas}
      storiesIniciales={stories}
      reglas={reglas}
      fechasClave={fechasClave}
      equipo={equipo}
      sprintsIniciales={sprints}
      urlsIniciales={urls}
      hoy={hoy}
    />
  )
}
