import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAgentKey } from '@/agents/registry'
import { DetalleAgente } from '@/components/agentes/detalle-agente'
import { detalleAgente } from '@/lib/datos/agentes'
import { AGENT_LABEL } from '@/domain/labels'
import { systemClock } from '@/lib/time'

interface Props {
  params: Promise<{ key: string }>
  searchParams: Promise<{ cliente?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params
  return { title: isAgentKey(key) ? AGENT_LABEL[key] : 'Agente' }
}

export default async function AgentePage({ params, searchParams }: Props) {
  const { key } = await params
  const { cliente } = await searchParams

  // El key viene de la URL, así que se valida contra el registro antes de
  // usarlo. `isAgentKey` es el mismo guardián que usa el runner.
  if (!isAgentKey(key)) notFound()

  const detalle = await detalleAgente(key, systemClock.now(), cliente)

  return (
    <main className="flex flex-1 flex-col px-6 py-8">
      <DetalleAgente detalle={detalle} />
    </main>
  )
}
