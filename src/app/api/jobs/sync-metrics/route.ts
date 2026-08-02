import { NextResponse } from 'next/server'
import { z } from 'zod'
import { crearClienteInstagram } from '@/lib/apis/instagram'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'

const entrada = z.object({ clientId: z.uuid() })

/**
 * Sincroniza las métricas por pieza desde Instagram Graph API.
 *
 * El endpoint jala las métricas de los últimos 20 posts, las cruza con
 * las piezas publicadas del cliente (por fecha), y escribe los resultados
 * en `results_piece`.
 *
 * Las piezas que no tienen un post de Instagram correspondiente se ignoran:
 * si se publicó en TikTok o LinkedIn, esa métrica viene por otro lado.
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

  const cliente = crearClienteInstagram({
    token,
    businessAccountId: 'me',
  })

  const metricas = await cliente.metricasPosts(20)
  if (!metricas.length) {
    return NextResponse.json({ ok: true, message: 'No se encontraron métricas para este período.' })
  }

  let insertadas = 0
  let ignoradas = 0
  const errores: string[] = []

  const { data: clienteData } = await supabase
    .from('clients')
    .select('org_id')
    .eq('id', clientId)
    .maybeSingle()

  const orgId = clienteData?.org_id
  if (!orgId) {
    return NextResponse.json({ ok: false, message: 'Cliente no encontrado.' }, { status: 404 })
  }

  const { data: piezas, error: errorPiezas } = await supabase
    .from('pieces')
    .select('id, publish_at')
    .eq('client_id', clientId)
    .eq('status', 'publicado')
    .not('publish_at', 'is', null)
    .order('publish_at', { ascending: false })
    .limit(30)

  if (errorPiezas) {
    return NextResponse.json(
      { ok: false, message: `No se pudieron leer las piezas: ${errorPiezas.message}` },
      { status: 500 },
    )
  }

  const piezasPorFecha = new Map<string, string>()
  for (const p of piezas ?? []) {
    if (p.publish_at) {
      const fecha = p.publish_at.slice(0, 10)
      if (!piezasPorFecha.has(fecha)) {
        piezasPorFecha.set(fecha, p.id)
      }
    }
  }

  for (const metrica of metricas) {
    const fechaPost = metrica.measuredAt.slice(0, 10)
    const pieceId = piezasPorFecha.get(fechaPost)

    if (!pieceId) {
      ignoradas++
      continue
    }

    const { error } = await supabase.from('results_piece').upsert(
      {
        org_id: orgId,
        client_id: clientId,
        piece_id: pieceId,
        reach: metrica.reach,
        impressions: metrica.impressions,
        saves: metrica.saves,
        shares: metrica.shares,
        interactions: metrica.interactions,
        measured_at: metrica.measuredAt,
      },
      { onConflict: 'piece_id, measured_at' },
    )

    if (error) {
      errores.push(error.message)
    } else {
      insertadas++
    }
  }

  return NextResponse.json({
    ok: true,
    insertadas,
    ignoradas,
    errores: errores.length,
    message:
      errores.length > 0
        ? `${insertadas} métricas guardadas, ${ignoradas} posts sin pieza correspondiente, ${errores.length} errores.`
        : `${insertadas} métricas guardadas, ${ignoradas} posts sin pieza correspondiente.`,
  })
}
