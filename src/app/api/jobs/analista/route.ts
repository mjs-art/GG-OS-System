import { NextResponse } from 'next/server'
import { z } from 'zod'
import { correrAnalista } from '@/agents/correr'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { MonthKey } from '@/lib/time'

/**
 * Dispara el Analista sobre un cliente y un mes: la lectura de resultados.
 *
 * Mismo contrato de seguridad que el resto de `api/jobs`: la AUTORIZACIÓN va
 * primero y con el cliente de SESIÓN. Si RLS deja leer el cliente, quien pide es
 * de su estudio. Solo entonces se usa admin para correr y registrar. `cierre`
 * (el día 3, mes completo) es el default; `mitad_de_mes` corre ligero sobre lo
 * que todavía no sale.
 */
const entrada = z.object({
  clientId: z.uuid(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Se espera un mes AAAA-MM.'),
  mode: z.enum(['cierre', 'mitad_de_mes']).default('cierre'),
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
  const { clientId, month, mode } = parsed.data

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
  const resultado = await correrAnalista(admin, clientId, month as MonthKey, mode, user.id)

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
