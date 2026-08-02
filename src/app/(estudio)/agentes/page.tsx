import type { Metadata } from 'next'
import { TableroAgentes } from '@/components/agentes/tablero-agentes'
import { panelAgentes } from '@/lib/datos/agentes'
import { systemClock } from '@/lib/time'

export const metadata: Metadata = { title: 'Agentes' }

/**
 * El cliente se elige por slug en la URL y no por uuid: la liga se comparte y
 * un uuid no le dice nada a nadie.
 */
export default async function AgentesPage({
  searchParams,
}: {
  searchParams: Promise<{ cliente?: string }>
}) {
  const { cliente } = await searchParams
  const panel = await panelAgentes(systemClock.now(), cliente)

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <TableroAgentes panel={panel} />
    </main>
  )
}
