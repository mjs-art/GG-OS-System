import { NextResponse } from 'next/server'
import { correrAnalista, correrAuditor } from '@/agents/correr'
import { serverEnv } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'
import { addMonths, systemClock, type MonthKey } from '@/lib/time'

/**
 * El disparador programado de los agentes que corren solos.
 *
 * No trae su propio scheduler: es una ruta que un cron externo (Vercel Cron,
 * GitHub Action, n8n, lo que sea) golpea con el secreto compartido. La cadencia
 * vive en ESE scheduler; aquí solo se ejecuta el job nombrado en `?job=`.
 *
 *   · `?job=analista-cierre`  → el día 3, el Analista lee el mes que cerró.
 *   · `?job=auditor-semanal`  → cada semana, el Auditor pasa el semáforo.
 *
 * Autoriza con un secreto en `x-cron-secret`, igual que el webhook de WhatsApp:
 * 503 si el secreto no está configurado (no corre nada a ciegas), 401 si no
 * coincide. Corre por cada cliente que tenga el agente ENCENDIDO; el runner de
 * todos modos frena a los apagados y a los que ya tocaron su tope, pero
 * prefiltrar evita leer datos de quien no va a correr. Sigue todo en el
 * proveedor configurado (mock por default): esta ruta no enciende nada.
 */

const JOBS = ['analista-cierre', 'auditor-semanal'] as const
type CronJob = (typeof JOBS)[number]

function esJob(valor: string | null): valor is CronJob {
  return valor !== null && (JOBS as readonly string[]).includes(valor)
}

type FilaResultado =
  | { readonly clientId: string; readonly ok: true; readonly tipo: string }
  | { readonly clientId: string; readonly ok: false; readonly code: string }

async function manejar(request: Request): Promise<Response> {
  const secret = serverEnv().CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: 'El cron no está configurado (falta CRON_SECRET).' },
      { status: 503 },
    )
  }
  if (request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ ok: false, message: 'Secreto de cron inválido.' }, { status: 401 })
  }

  const job = new URL(request.url).searchParams.get('job')
  if (!esJob(job)) {
    return NextResponse.json(
      { ok: false, message: `Job desconocido. Usa uno de: ${JOBS.join(', ')}.` },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const agente = job === 'analista-cierre' ? 'analista' : 'auditor'

  const { data: policies, error } = await admin
    .from('agent_policies')
    .select('client_id')
    .eq('agent', agente)
    .eq('enabled', true)

  if (error) {
    return NextResponse.json(
      { ok: false, message: `No se pudieron leer las políticas: ${error.message}` },
      { status: 500 },
    )
  }

  // `analista` y `auditor` siempre corren por cliente — el `client_id` nulo es
  // el caso de un agente sin cliente (hoy solo el investigador), que no tiene
  // job de cron. Se filtra defensivamente en vez de asumirlo.
  const clientIds = [
    ...new Set((policies ?? []).map((p) => p.client_id).filter((id): id is string => id !== null)),
  ]

  // El mes que acaba de cerrar: el Analista de cierre corre el día 3 sobre el mes
  // anterior completo. En UTC, sin crear un Date fuera de @/lib/time.
  const ahora = systemClock.now()
  const mesActual =
    `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}` as MonthKey
  const mesCierre = addMonths(mesActual, -1)

  // En serie a propósito: son pocos clientes y cada corrida cuesta. Un for await
  // no satura al proveedor ni dispara el tope de todos a la vez.
  const resultados: FilaResultado[] = []
  for (const clientId of clientIds) {
    const r =
      job === 'analista-cierre'
        ? await correrAnalista(admin, clientId, mesCierre, 'cierre', null, { trigger: 'cron' })
        : await correrAuditor(admin, clientId, null, { trigger: 'cron' })
    resultados.push(
      r.ok ? { clientId, ok: true, tipo: r.tipo } : { clientId, ok: false, code: r.code },
    )
  }

  const corridas = resultados.filter((x) => x.ok).length
  return NextResponse.json({ ok: true, job, clientes: clientIds.length, corridas, resultados })
}

export function GET(request: Request): Promise<Response> {
  return manejar(request)
}

export function POST(request: Request): Promise<Response> {
  return manejar(request)
}
