import type { Metadata } from 'next'
import { Display, EmptyState } from '@/components/ui/primitives'

export const metadata: Metadata = { title: 'Ajustes' }

export default function AjustesPage() {
  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-8">
      <Display as="h1" className="text-3xl">
        Ajustes
      </Display>
      <EmptyState
        title="Nada que configurar todavía"
        body="El equipo, los topes de gasto de los agentes y las integraciones viven aquí cuando existan."
      />
    </main>
  )
}
