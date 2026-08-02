import type { Metadata } from 'next'
import { verificarTokenPortal } from '@/domain/portal-token'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock, type MonthKey } from '@/lib/time'
import { PuertaPortal } from './puerta'
import { VistaPortal } from './vista'

export const metadata: Metadata = {
  title: 'Aprobar el mes',
  robots: { index: false, follow: false },
}

/**
 * Portal de cliente.
 *
 * Vive FUERA del grupo `(estudio)` a propósito: no hereda el sidebar, ni el
 * switch de tema del estudio, ni el contador de la bandeja. Si algún día
 * alguien lo mete en ese grupo "para reusar el layout", se le filtra la
 * maquinaria completa al cliente.
 *
 * Lo que el cliente NUNCA ve, y está garantizado por RLS y no por esta página:
 * agentes, chips de procedencia, costos, notas privadas, reglas de marca,
 * Context Card, propuestas de pauta, ni una pieza que no haya llegado a
 * `con_cliente`.
 */
export default async function AprobarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const env = serverEnv()

  if (!env.CLIENT_PORTAL_TOKEN_SECRET) {
    return (
      <Mensaje
        titulo="El portal no está disponible"
        cuerpo="Avísale a tu contacto en el estudio. No es algo que puedas resolver desde aquí."
      />
    )
  }

  const verificado = verificarTokenPortal(token, env.CLIENT_PORTAL_TOKEN_SECRET, systemClock.now())

  if (!verificado.ok) {
    return (
      <Mensaje
        titulo={verificado.motivo === 'expirado' ? 'Esta liga ya venció' : 'Esta liga no es válida'}
        cuerpo="Pídele una nueva a tu contacto en el estudio."
      />
    )
  }

  const { clientId, month } = verificado.payload

  // ¿Ya trae sesión? `getUser()` y no `getSession()`: la sesión sale de una
  // cookie y la cookie la manda el cliente.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <PuertaPortal token={token} />
  }

  /**
   * Aquí no se verifica a mano que este usuario pertenezca a este cliente.
   *
   * No hace falta y sería peor: la consulta corre como él, y la política
   * `clients: el portal ve solo su cliente` decide. Si el correo del JWT no
   * está en `client_users` de este cliente, esto devuelve null aunque el token
   * esté perfectamente firmado. Duplicar el chequeo en TypeScript crearía una
   * segunda fuente de verdad que algún día se desincroniza de la primera.
   */
  const { data: cliente } = await supabase
    .from('clients')
    .select('id, name, brand_color')
    .eq('id', clientId)
    .maybeSingle()

  if (!cliente) {
    return (
      <Mensaje
        titulo="Esta liga no es para tu cuenta"
        cuerpo="Entraste con un correo que no tiene acceso a este cliente. Revisa que sea el mismo al que te llegó la liga."
      />
    )
  }

  return (
    <VistaPortal
      clientId={cliente.id}
      nombre={cliente.name}
      brandColor={cliente.brand_color}
      mes={month as MonthKey}
    />
  )
}

function Mensaje({ titulo, cuerpo }: { titulo: string; cuerpo: string }) {
  return (
    <div
      data-tema="claro"
      className="bg-bg text-fg flex min-h-dvh items-center justify-center px-6"
    >
      <div className="max-w-sm">
        <h1 className="type-display text-2xl">{titulo}</h1>
        <p className="text-fg-muted mt-3 text-[14px]">{cuerpo}</p>
      </div>
    </div>
  )
}
