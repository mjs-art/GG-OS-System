import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HeaderCliente } from '@/components/cliente/header-cliente'
import { NavSecciones } from '@/components/cliente/nav-secciones'
import { SeccionCalendario } from '@/components/cliente/seccion-calendario'
import { SeccionResumen } from '@/components/cliente/seccion-resumen'
import { Display, EmptyState } from '@/components/ui/primitives'
import { fechaLocal } from '@/domain/calendario'
import { SECCIONES } from '@/domain/secciones'
import { entradasDelMes } from '@/lib/datos/calendario'
import { listarPiezas, listarStories, mesActual, obtenerCliente } from '@/lib/datos/clientes'
import { isMonthKey, systemClock, type MonthKey } from '@/lib/time'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ mes?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const cliente = await obtenerCliente(slug)
  return { title: cliente?.name ?? 'Cliente' }
}

/** Las secciones que todavía no se construyen se anuncian, no se esconden. */
const CONSTRUIDAS = new Set(['resumen', 'calendario'])

export default async function ClientePage({ params, searchParams }: Props) {
  const { slug } = await params
  const { mes: mesParam } = await searchParams
  const mes: MonthKey = mesParam && isMonthKey(mesParam) ? mesParam : mesActual(systemClock.now())

  const cliente = await obtenerCliente(slug)
  if (!cliente) notFound()

  const [piezas, stories, entradasCalendario] = await Promise.all([
    listarPiezas(cliente.id, mes),
    listarStories(cliente.id, mes),
    entradasDelMes({ mes, clientId: cliente.id }),
  ])
  const hoy = fechaLocal(systemClock.now())

  return (
    <>
      <HeaderCliente cliente={cliente} mes={mes} redes={[]} />

      <div className="flex min-w-0 flex-1 gap-8 px-6 py-8">
        <NavSecciones />

        <main className="flex min-w-0 flex-1 flex-col gap-16">
          {SECCIONES.map(({ id, label }) => (
            <section key={id} id={id} className="scroll-mt-28">
              {id === 'resumen' ? (
                <SeccionResumen cliente={cliente} mes={mes} piezas={piezas} stories={stories} />
              ) : id === 'calendario' ? (
                <SeccionCalendario
                  cliente={cliente}
                  mes={mes}
                  entradas={entradasCalendario}
                  hoy={hoy}
                />
              ) : (
                <>
                  <header className="border-line mb-6 border-b pb-3">
                    <Display as="h2" className="text-xl">
                      {label}
                    </Display>
                  </header>
                  {!CONSTRUIDAS.has(id) && (
                    <EmptyState
                      title="En construcción"
                      body={`La sección ${label} se construye en el siguiente paso del plan. Mientras tanto, el planner y el resumen ya funcionan.`}
                    />
                  )}
                </>
              )}
            </section>
          ))}
        </main>
      </div>
    </>
  )
}
