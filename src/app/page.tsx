import { Display, EmptyState, Mono } from '@/components/ui/primitives'

/**
 * Bandeja — la cola de todo lo que necesita criterio humano, de todos los
 * clientes. Por ahora solo el cascarón; el contenido llega en la etapa 6.
 */
export default function BandejaPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Display as="h1" className="text-5xl">
          Bandeja
        </Display>
        <Mono className="text-muted">0 escalamientos · 0 críticos</Mono>
      </header>

      <EmptyState
        title="Bandeja limpia"
        body="Cuando los agentes necesiten tu criterio, aparecerá aquí. Nada pendiente por ahora."
      />
    </main>
  )
}
