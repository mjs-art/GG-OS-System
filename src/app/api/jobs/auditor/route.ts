import { NextResponse } from 'next/server'
import { z } from 'zod'
import { correrAuditor } from '@/agents/correr'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Dispara el Auditor sobre un cliente: pasa el semáforo por red y escribe una
 * auditoría por cuenta.
 *
 * Mismo contrato de seguridad que el resto de `api/jobs`: la AUTORIZACIÓN va
 * primero y con el cliente de SESIÓN. Si RLS deja leer el cliente, quien pide es
 * de su estudio. Solo entonces se usa admin para correr, registrar la corrida y
 * escribir `account_audits` (append-only, service_role).
 */
const entrada = z.object({ clientId: z.uuid() })

export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Falta el cliente, o viene mal.' },
      { status: 400 },
    )
  }
  const { clientId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  const { data: cliente } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle()
  if (!cliente) {
    return NextResponse.json(
      { ok: false, message: 'No tienes acceso a este cliente.' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  const resultado = await correrAuditor(admin, clientId, user.id)

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
