import type { Metadata } from 'next'
import { Display, EmptyState } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Agentes' }

export default function AgentesPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-8">
      <Display as="h1" className="text-3xl">
        Agentes
      </Display>
      <EmptyState
        title="Los ocho agentes corren en modo mock"
        body="Todavía no hay ni una llamada de red a un modelo. Esta pantalla se construye en la etapa 10 del plan."
      />
    </main>
  )
}
