import { NextResponse } from 'next/server'
import { z } from 'zod'
import { correrInvestigador } from '@/agents/investigador'
import { orgsDelUsuario } from '@/lib/datos/orgs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Dispara el Investigador sobre un link de YouTube.
 *
 * Mismo patrón que `api/jobs/redactor`: la AUTORIZACIÓN va primero y con el
 * cliente de SESIÓN (si hay `clientId`, RLS decide si el usuario es del
 * estudio de ese cliente; si no, se usa la org del usuario). Solo entonces se
 * usa el cliente admin para correr el agente y registrar la corrida —
 * `agent_runs`/`video_summaries` no las puede escribir `authenticated`.
 */
const entrada = z.object({
  youtubeUrl: z.url(),
  clientId: z.uuid().nullable(),
})

export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Falta el link de YouTube.' }, { status: 400 })
  }
  const { youtubeUrl, clientId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  let orgId: string
  if (clientId) {
    const { data: cliente } = await supabase
      .from('clients')
      .select('org_id')
      .eq('id', clientId)
      .maybeSingle()
    if (!cliente) {
      return NextResponse.json(
        { ok: false, message: 'No tienes acceso a ese cliente.' },
        { status: 403 },
      )
    }
    orgId = cliente.org_id
  } else {
    // Investigación general: no hay cliente contra el que probar acceso, así
    // que se usa la org del usuario con sesión.
    const [org] = await orgsDelUsuario()
    if (!org) {
      return NextResponse.json(
        { ok: false, message: 'No perteneces a ninguna organización.' },
        { status: 403 },
      )
    }
    orgId = org.id
  }

  const admin = createAdminClient()
  const resultado = await correrInvestigador(admin, {
    orgId,
    clientId,
    youtubeUrl,
    userId: user.id,
  })

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
