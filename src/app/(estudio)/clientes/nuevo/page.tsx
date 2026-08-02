import type { Metadata } from 'next'
import Link from 'next/link'
import { FormularioAlta } from '@/components/clientes/formulario-alta'
import { Display, EmptyState, Mono } from '@/components/ui/primitives'
import { orgsDelUsuario } from '@/lib/datos/orgs'

export const metadata: Metadata = { title: 'Nuevo cliente' }

/**
 * Alta de un cliente dentro del estudio.
 *
 * La org NO se pide como dato libre: se resuelve de la membresía del usuario.
 * Crear la org es otra cosa —aprovisionamiento con service_role— y no cabe aquí.
 */
export default async function NuevoClientePage() {
  const orgs = await orgsDelUsuario()

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-2">
        <Mono className="text-fg-muted">
          <Link href="/clientes" className="hover:text-accent-hot">
            ← Clientes
          </Link>
        </Mono>
        <Display as="h1" className="text-3xl">
          Dar de alta cliente
        </Display>
      </header>

      {orgs.length === 0 ? (
        <EmptyState
          title="No perteneces a ninguna organización"
          body="Un cliente cuelga de una organización, y todavía no eres miembro de ninguna. El owner tiene que sumarte al equipo antes de que puedas dar de alta clientes."
        />
      ) : (
        <FormularioAlta orgs={orgs} />
      )}
    </main>
  )
}
