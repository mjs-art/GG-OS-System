import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HeaderCliente } from '@/components/cliente/header-cliente'
import { NavSecciones } from '@/components/cliente/nav-secciones'
import { SeccionCalendario } from '@/components/cliente/seccion-calendario'
import { SeccionResumen } from '@/components/cliente/seccion-resumen'
import { SeccionFechas } from '@/components/fechas/seccion-fechas'
import { SeccionGuiones } from '@/components/guiones/seccion-guiones'
import { SeccionPauta } from '@/components/pauta/seccion-pauta'
import { SeccionPlanner } from '@/components/planner/seccion-planner'
import { SeccionResultados } from '@/components/resultados/seccion-resultados'
import {
  SeccionArchivos,
  SeccionMarca,
  SeccionPendientes,
  SeccionPrivado,
  SeccionRedes,
} from '@/components/secciones'
import { SeccionVolumen } from '@/components/volumen/seccion-volumen'
import { fechaLocal } from '@/domain/calendario'
import { SECCIONES } from '@/domain/secciones'
import { entradasDelMes } from '@/lib/datos/calendario'
import { listarPiezas, listarStories, mesActual, obtenerCliente } from '@/lib/datos/clientes'
import { listarFechasClave } from '@/lib/datos/fechas'
import { listarGuiones, listarTendencias } from '@/lib/datos/guiones'
import { datosPauta } from '@/lib/datos/pauta'
import {
  aprendizajeDeMarca,
  historialDeMarca,
  listarArchivos,
  listarEventosPendientes,
  listarNotasPrivadas,
  listarRedes,
  listarReglasDuras,
  listarTareas,
  obtenerContextCard,
} from '@/lib/datos/secciones'
import { isMonthKey, systemClock, type MonthKey } from '@/lib/time'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mes?: string; mesResultados?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cliente = await obtenerCliente(slug)
  return { title: cliente?.name ?? 'Cliente' }
}

/**
 * El dashboard de cliente: una página larga que se recorre, no tabs que
 * esconden.
 *
 * Todas las secciones se cargan en paralelo con un solo `Promise.all`. Con
 * doce secciones, encadenarlas convertiría la página en una fila de esperas y
 * el tiempo total sería la suma en vez del máximo.
 *
 * `ahora` y `hoy` se calculan UNA vez aquí y bajan por prop. Si cada sección
 * leyera el reloj, dos de ellas podrían caer en días distintos a la
 * medianoche, y el render dejaría de ser determinista para las pruebas.
 */
export default async function ClientePage({ params, searchParams }: Props) {
  const { slug } = await params
  const { mes: mesParam, mesResultados: mrParam } = await searchParams
  const mes: MonthKey = mesParam && isMonthKey(mesParam) ? mesParam : mesActual(systemClock.now())
  const mesResultados = mrParam && isMonthKey(mrParam) ? mrParam : undefined

  const cliente = await obtenerCliente(slug)
  if (!cliente) notFound()

  const ahora = systemClock.now()
  const hoy = fechaLocal(ahora)

  const [
    piezas,
    stories,
    entradasCalendario,
    redes,
    guiones,
    tendencias,
    fechas,
    pauta,
    contextCard,
    versiones,
    reglas,
    aprendizaje,
    archivos,
    tareas,
    eventos,
    notas,
  ] = await Promise.all([
    listarPiezas(cliente.id, mes),
    listarStories(cliente.id, mes),
    entradasDelMes({ mes, clientId: cliente.id }),
    listarRedes(cliente.id),
    listarGuiones(cliente.id),
    listarTendencias(),
    listarFechasClave(cliente.id, mes),
    datosPauta(cliente.id),
    obtenerContextCard(cliente.id),
    historialDeMarca(cliente.id),
    listarReglasDuras(cliente.id),
    aprendizajeDeMarca(cliente.id),
    listarArchivos(cliente.id),
    listarTareas(cliente.id),
    listarEventosPendientes(cliente.id, hoy),
    listarNotasPrivadas(cliente.id),
  ])

  const semaforos = redes.map((r) => ({
    platform: r.platform,
    estado: 'ok' as const,
  }))

  return (
    <>
      <HeaderCliente cliente={cliente} mes={mes} redes={semaforos} />

      <div className="flex min-w-0 flex-1 gap-8 px-6 py-8">
        <NavSecciones />

        <main className="flex min-w-0 flex-1 flex-col gap-16">
          {SECCIONES.map(({ id }) => (
            <section key={id} id={id} className="scroll-mt-28">
              {id === 'resumen' && (
                <SeccionResumen cliente={cliente} mes={mes} piezas={piezas} stories={stories} />
              )}
              {id === 'redes' && (
                <SeccionRedes
                  clientId={cliente.id}
                  slug={cliente.slug}
                  cuentas={redes}
                  ahora={ahora}
                />
              )}
              {id === 'volumen' && <SeccionVolumen cliente={cliente} mes={mes} />}
              {id === 'planner' && (
                <SeccionPlanner
                  cliente={cliente}
                  mes={mes}
                  piezas={piezas}
                  stories={stories}
                  hoy={hoy}
                />
              )}
              {id === 'calendario' && (
                <SeccionCalendario
                  cliente={cliente}
                  mes={mes}
                  entradas={entradasCalendario}
                  hoy={hoy}
                />
              )}
              {id === 'guiones' && (
                <SeccionGuiones
                  cliente={cliente}
                  guiones={guiones}
                  tendencias={tendencias}
                  hoy={hoy}
                />
              )}
              {id === 'fechas' && (
                <SeccionFechas cliente={cliente} mes={mes} fechas={fechas} hoy={hoy} />
              )}
              {id === 'pauta' && <SeccionPauta datos={pauta} slug={cliente.slug} hoy={hoy} />}
              {id === 'resultados' && (
                <SeccionResultados
                  cliente={cliente}
                  mes={mes}
                  {...(mesResultados ? { mesResultados } : {})}
                />
              )}
              {id === 'marca' && (
                <SeccionMarca
                  cliente={cliente}
                  contextCard={contextCard}
                  versiones={versiones}
                  reglas={reglas}
                  aprendizaje={aprendizaje}
                />
              )}
              {id === 'archivos' && <SeccionArchivos archivos={archivos} />}
              {id === 'pendientes' && (
                <SeccionPendientes tareas={tareas} eventos={eventos} hoy={hoy} />
              )}
              {id === 'privado' && (
                <SeccionPrivado
                  clientId={cliente.id}
                  orgId={cliente.orgId}
                  slug={cliente.slug}
                  notas={notas}
                  ahora={ahora}
                />
              )}
            </section>
          ))}
        </main>
      </div>
    </>
  )
}
