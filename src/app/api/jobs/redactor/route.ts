import { NextResponse } from 'next/server'
import { z } from 'zod'
import { correrRedactor } from '@/agents/correr'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Dispara el Redactor sobre una pieza.
 *
 * Este es el único lugar del árbol de rutas donde se permite el cliente admin
 * (service_role): la escritura de `agent_runs` no puede hacerla `authenticated`.
 * Por eso la AUTORIZACIÓN va primero y con el cliente de SESIÓN: si RLS deja
 * leer la pieza, quien pide es del estudio de ese cliente. Solo entonces se usa
 * admin para correr y registrar la corrida.
 */
const entrada = z.object({ pieceId: z.uuid() })

export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Falta el id de la pieza.' }, { status: 400 })
  }
  const { pieceId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  // Puerta de autorización: RLS solo devuelve la pieza si el usuario es del
  // estudio de su cliente. Nada de `if` de permisos aquí; lo decide la base.
  const { data: pieza } = await supabase.from('pieces').select('id').eq('id', pieceId).maybeSingle()
  if (!pieza) {
    return NextResponse.json(
      { ok: false, message: 'No tienes acceso a esta pieza.' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  const resultado = await correrRedactor(admin, pieceId, user.id)

  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
