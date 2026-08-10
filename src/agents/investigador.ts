import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { proveedorDeEnv } from '@/agents/correr'
import type { AgentInput } from '@/agents/registry'
import { runAgent } from '@/agents/runner'
import { createAgentStore } from '@/agents/store'
import { bajarTranscripcion } from '@/lib/apis/n8n-investigador'
import { serverEnv } from '@/lib/env'
import type { Database, Json } from '@/lib/supabase/database.types'
import { systemClock } from '@/lib/time'

/**
 * El compositor del agente Investigador.
 *
 * A diferencia de los de `correr.ts`, no lee una pieza ni un Context Card de
 * cliente: baja la transcripción por el webhook de n8n, corre el agente sin
 * la noción de "mes" ni de marca, y si sale con resultado lo guarda en
 * `video_summaries` — append-only, igual que `agent_runs`.
 */
export type ResultadoInvestigador =
  | {
      readonly ok: true
      readonly tipo: 'resumen'
      readonly runId: string
      readonly videoSummaryId: string
      readonly resumen: string
      readonly puntosClave: readonly string[]
      readonly accionesSugeridas: readonly { tipo: string; titulo: string; detalle: string }[]
    }
  | {
      readonly ok: true
      readonly tipo: 'escalado'
      readonly pregunta: string
      readonly runId: string
    }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly runId?: string }

/** No hay Context Card de cliente para este agente: ni por marca, ni por versión. */
const CONTEXT_CARD_INVESTIGADOR =
  'Eres el investigador de la agencia. No representas la voz de ningún cliente en particular: ' +
  'tu trabajo es leer la transcripción de un video de YouTube y resumirla con objetividad, y ' +
  'proponer acciones concretas que el estudio podría tomar con esa información (profundizar la ' +
  'investigación, grabar un video propio, escribir un post, mandar un newsletter).'

export async function correrInvestigador(
  admin: SupabaseClient<Database>,
  params: { orgId: string; clientId: string | null; youtubeUrl: string; userId: string },
): Promise<ResultadoInvestigador> {
  const env = serverEnv()
  if (!env.N8N_INVESTIGADOR_WEBHOOK_URL) {
    return {
      ok: false,
      code: 'sin_webhook',
      message:
        'Falta configurar N8N_INVESTIGADOR_WEBHOOK_URL: el workflow de n8n que baja la ' +
        'transcripción todavía no está conectado.',
    }
  }

  const transcripcion = await bajarTranscripcion(
    { url: env.N8N_INVESTIGADOR_WEBHOOK_URL },
    params.youtubeUrl,
  )
  if (!transcripcion.ok) {
    return {
      ok: false,
      code: 'transcripcion',
      message: `No se pudo bajar la transcripción del video: ${transcripcion.motivo}`,
    }
  }

  const input: AgentInput<'investigador'> = {
    client_id: params.clientId,
    youtube_url: params.youtubeUrl,
    video_title: transcripcion.title,
    transcript: transcripcion.transcript,
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('investigador', input, {
    orgId: params.orgId,
    clientId: params.clientId,
    contextCard: CONTEXT_CARD_INVESTIGADOR,
    contextVersion: null,
    trigger: 'manual',
    triggeredBy: params.userId,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: env.AGENTS_PROVIDER,
  })

  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      message: result.error.message,
      ...(result.runId ? { runId: result.runId } : {}),
    }
  }

  if (result.output.kind === 'escalamiento') {
    return { ok: true, tipo: 'escalado', pregunta: result.output.pregunta, runId: result.runId }
  }

  const data = result.output.data

  const { data: fila, error: errorEscritura } = await admin
    .from('video_summaries')
    .insert({
      org_id: params.orgId,
      run_id: result.runId,
      client_id: params.clientId,
      youtube_url: params.youtubeUrl,
      video_title: transcripcion.title,
      transcript: transcripcion.transcript,
      summary: data.resumen,
      key_points: data.puntos_clave as Json,
      suggested_actions: data.acciones_sugeridas as Json,
    })
    .select('id')
    .single()

  if (errorEscritura || !fila) {
    // La corrida quedó registrada en agent_runs; solo falló guardar el
    // resultado en la tabla consultable.
    return {
      ok: false,
      code: 'escritura',
      message:
        `El Investigador corrió, pero no se pudo guardar el resultado: ` +
        `${errorEscritura?.message ?? 'sin id'}`,
      runId: result.runId,
    }
  }

  return {
    ok: true,
    tipo: 'resumen',
    runId: result.runId,
    videoSummaryId: fila.id,
    resumen: data.resumen,
    puntosClave: data.puntos_clave,
    accionesSugeridas: data.acciones_sugeridas,
  }
}
