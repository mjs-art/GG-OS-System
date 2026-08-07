import { PaletaComandos } from '@/components/nav/paleta-comandos'
import { Sidebar } from '@/components/nav/sidebar'
import { SwitchTema } from '@/components/ui/switch-tema'
import { listarClientesParaBuscar } from '@/lib/datos/clientes'
import { createClient } from '@/lib/supabase/server'

/**
 * El armazón de todo lo que exige sesión de estudio.
 *
 * El portal de cliente (`/aprobar`) queda fuera de este grupo a propósito: no
 * debe ver la navegación, ni el switch de tema del estudio, ni el contador de
 * la bandeja. Si algún día alguien lo mete aquí "para reusar el layout", se
 * filtra la maquinaria completa al cliente.
 */
async function contarPendientes(): Promise<number> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from('escalations')
    .select('id', { count: 'exact', head: true })
    .is('resolved_at', null)

  // Un contador que no se pudo leer no debe tumbar toda la app: se muestra en
  // cero y la Bandeja ya dirá qué pasó cuando entres.
  if (error) return 0
  return count ?? 0
}

/**
 * Si te invitaron al equipo mientras ya tenías sesión abierta, el callback de
 * `/auth/callback` no corre de nuevo — ahí normalmente se acepta la
 * invitación. Este es el otro lugar donde puede pasar: en cuanto recargas
 * cualquier página del estudio. Silenciosamente, porque una invitación que no
 * existe no es un error de nadie.
 */
async function aceptarInvitacionesPendientes(): Promise<void> {
  const supabase = await createClient()
  await supabase.rpc('accept_pending_invites')
}

export default async function EstudioLayout({ children }: { children: React.ReactNode }) {
  await aceptarInvitacionesPendientes()
  const [pendientes, clientes] = await Promise.all([contarPendientes(), listarClientesParaBuscar()])

  return (
    <div className="flex min-h-dvh">
      <Sidebar pendientes={pendientes} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-line flex h-14 shrink-0 items-center justify-between gap-3 border-b px-6">
          <PaletaComandos clientes={clientes} />
          <SwitchTema />
        </div>
        {children}
      </div>
    </div>
  )
}
