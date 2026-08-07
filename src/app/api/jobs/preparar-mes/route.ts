import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prepararMes } from '@/agents/preparar-mes'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Corre el Redactor sobre todo lo escribible de un cliente y un mes.
 *
 * Mismo contrato de seguridad que el resto de `api/jobs`: la AUTORIZACIÓN va
 * primero y con el cliente de SESIÓN. Aquí se verifica leyendo el cliente con
 * RLS — si la base lo devuelve, quien pide es de su estudio. Solo entonces se
 * usa admin para correr y registrar. Un `if` de permisos no decide nada; lo
 * decide la política de la base.
 */
const entrada = z.object({
  clientId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Se espera un mes AAAA-MM.'),
})

export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: 'Falta el cliente o el mes, o vienen mal.' },
      { status: 400 },
    )
  }
  const { clientId, month } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  // Puerta de autorización: RLS solo devuelve el cliente si el usuario es de su
  // estudio. El `client_id` que se usará para leer y escribir sale de aquí, no
  // de una confianza en el cuerpo de la petición.
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
  const resumen = await prepararMes(admin, { clientId, month, userId: user.id })

  return NextResponse.json({ ok: true, resumen }, { status: 200 })
}
