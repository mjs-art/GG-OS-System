import type { Metadata } from 'next'
import { SeccionEquipo } from '@/components/equipo/seccion-equipo'
import { Display, EmptyState } from '@/components/ui/primitives'
import { listarEquipo, listarInvitacionesPendientes } from '@/lib/datos/equipo'
import { orgsDelUsuario } from '@/lib/datos/orgs'

export const metadata: Metadata = { title: 'Ajustes' }

export default async function AjustesPage() {
  const orgs = await orgsDelUsuario()
  // Hoy solo existe una org (ver la nota en orgs.ts); cuando eso cambie, esta
  // página necesita un selector, igual que el alta de clientes.
  const org = orgs[0]

  return (
    <main className="flex flex-1 flex-col gap-6 px-6 py-8">
      <Display as="h1" className="text-3xl">
        Ajustes
      </Display>

      {!org ? (
        <EmptyState
          title="No perteneces a ninguna organización"
          body="Alguien con el rol de owner tiene que invitarte antes de que veas nada aquí."
        />
      ) : (
        <SeccionEquipoConDatos orgId={org.id} />
      )}
    </main>
  )
}

async function SeccionEquipoConDatos({ orgId }: { orgId: string }) {
  const [equipo, invitaciones] = await Promise.all([
    listarEquipo(orgId),
    listarInvitacionesPendientes(orgId),
  ])

  const yo = equipo.find((m) => m.esTu)
  const esOwner = yo?.role === 'owner'

  return (
    <SeccionEquipo orgId={orgId} equipo={equipo} invitaciones={invitaciones} esOwner={esOwner} />
  )
}
