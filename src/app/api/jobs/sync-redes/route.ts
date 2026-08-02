import { NextResponse } from 'next/server'
import { z } from 'zod'
import { crearClienteInstagram } from '@/lib/apis/instagram'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

const entrada = z.object({ clientId: z.uuid() })

/**
 * Sincroniza los datos frescos de Instagram para todas las cuentas conectadas
 * de un cliente: seguidores, fecha del último post y publicaciones de la semana.
 *
 * Sin token de API configurado, la ruta devuelve ok con la bandera `apiNoDisponible`
 * en vez de un error: no es una falla, es que los trámites de verificación
 * todavía no están hechos.
 */
export async function POST(request: Request): Promise<Response> {
  const cuerpo: unknown = await request.json().catch(() => null)
  const parsed = entrada.safeParse(cuerpo)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Falta el clientId.' }, { status: 400 })
  }
  const { clientId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: 'No hay sesión.' }, { status: 401 })
  }

  const token = serverEnv().INSTAGRAM_LONG_LIVED_TOKEN
  if (!token) {
    return NextResponse.json({
      ok: true,
      apiNoDisponible: true,
      message: 'Instagram Graph API no está configurada todavía. Las métricas se capturan a mano.',
    })
  }

  const { data: cuentas } = await supabase
    .from('social_accounts')
    .select('id, platform, client_id')
    .eq('client_id', clientId)
    .eq('platform', 'instagram')

  if (!cuentas?.length) {
    return NextResponse.json({
      ok: true,
      message: 'El cliente no tiene cuentas de Instagram registradas.',
    })
  }

  const actualizadas: string[] = []
  const fallos: string[] = []

  // Un cliente puede tener una sola cuenta de Instagram Business. La API de
  // Instagram no expone un endpoint de "descubrir accounts": el `businessAccountId`
  // se obtiene una vez durante el onboarding con `obtenerInstagramBusinessId`
  // y se guarda aquí como el handle de la cuenta.
  //
  // Por ahora, si no hay businessAccountId en la cuenta, se asume que la
  // verificación de Meta está incompleta y se sigue con manual/CSV.
  const cliente = crearClienteInstagram({
    token,
    businessAccountId: 'me',
  })

  const frescos = await cliente.datosFrescos()
  if (!frescos) {
    return NextResponse.json({
      ok: false,
      message:
        'El token de Instagram no tiene acceso a la cuenta. Revisa que el token esté vigente y que la cuenta de Instagram esté conectada a la página de Facebook.',
    })
  }

  for (const cuenta of cuentas) {
    const { error } = await supabase
      .from('social_accounts')
      .update({
        followers: frescos.followers,
        last_post_at: frescos.lastPostAt ?? null,
        posts_per_week: frescos.postsThisWeek,
        checked_at: systemClock.now().toISOString(),
      })
      .eq('id', cuenta.id)

    if (error) {
      fallos.push(cuenta.id)
      console.warn(`No se pudo actualizar la cuenta ${cuenta.id}: ${error.message}`)
    } else {
      actualizadas.push(cuenta.id)
    }
  }

  return NextResponse.json({
    ok: true,
    actualizadas: actualizadas.length,
    fallos: fallos.length,
    message:
      fallos.length > 0
        ? `${actualizadas.length} cuentas actualizadas, ${fallos.length} fallaron.`
        : `${actualizadas.length} cuentas actualizadas.`,
  })
}
