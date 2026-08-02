import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextCard, PreguntaFrecuente } from '@/lib/datos/secciones'
import { renderContextCard } from '@/agents/context-card'
import { createAnthropicProvider } from '@/agents/providers/anthropic'
import { createMockProvider } from '@/agents/providers/mock'
import type { AgentInput } from '@/agents/registry'
import { runAgent, type AgentProvider } from '@/agents/runner'
import { createAgentStore } from '@/agents/store'
import { serverEnv } from '@/lib/env'
import type { Database, Json } from '@/lib/supabase/database.types'
import { systemClock } from '@/lib/time'

/**
 * El compositor de la corrida del Redactor sobre una pieza.
 *
 * Lee todo con el cliente admin (salta RLS): la ruta ya verificó ANTES, con el
 * cliente de sesión, que quien dispara es del estudio del cliente. Arma la
 * entrada del contrato desde la pieza + la memoria del cliente, corre el agente
 * y escribe el borrador de vuelta con su procedencia (`authored_by`). Un
 * borrador; la persona lo revisa y aprueba.
 */
export type ResultadoCorrida =
  | {
      readonly ok: true
      readonly tipo: 'escrito'
      readonly campos: readonly string[]
      readonly runId: string
      readonly costCents: number
    }
  | {
      readonly ok: true
      readonly tipo: 'escalado'
      readonly pregunta: string
      readonly runId: string
    }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly runId?: string }

/** Lee `params` de una regla de marca sin confiar en su forma. */
function leerParams(params: Json): { kind: string | undefined; count: number | undefined } {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const o = params as Record<string, unknown>
    return {
      kind: typeof o['kind'] === 'string' ? o['kind'] : undefined,
      count: typeof o['count'] === 'number' ? o['count'] : undefined,
    }
  }
  return { kind: undefined, count: undefined }
}

function leerFaqs(valor: Json): PreguntaFrecuente[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>
      if (typeof o['pregunta'] === 'string' && typeof o['respuesta'] === 'string') {
        return [{ pregunta: o['pregunta'], respuesta: o['respuesta'] }]
      }
    }
    return []
  })
}

function proveedorDeEnv(): AgentProvider | { error: string } {
  const env = serverEnv()
  if (env.AGENTS_PROVIDER === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY)
      return { error: 'AGENTS_PROVIDER=anthropic pero falta ANTHROPIC_API_KEY.' }
    return createAnthropicProvider(env.ANTHROPIC_API_KEY)
  }
  return createMockProvider(systemClock)
}

export async function correrRedactor(
  admin: SupabaseClient<Database>,
  pieceId: string,
  userId: string,
): Promise<ResultadoCorrida> {
  const { data: pieza, error } = await admin
    .from('pieces')
    .select('id, org_id, client_id, month, format, platforms, pillar_id, idea, authored_by')
    .eq('id', pieceId)
    .maybeSingle()

  if (error)
    return { ok: false, code: 'lectura', message: `No se pudo leer la pieza: ${error.message}` }
  if (!pieza) return { ok: false, code: 'no_encontrada', message: 'No se encontró la pieza.' }

  if (!pieza.idea || pieza.idea.trim() === '') {
    return {
      ok: false,
      code: 'sin_idea',
      message:
        'La pieza no tiene idea. Escribe una línea de qué trata antes de correr el Redactor.',
    }
  }
  if (pieza.platforms.length === 0) {
    return {
      ok: false,
      code: 'sin_plataforma',
      message: 'La pieza no tiene plataformas. Elige al menos una.',
    }
  }
  if (!pieza.pillar_id) {
    return {
      ok: false,
      code: 'sin_pilar',
      message: 'La pieza no tiene pilar. Asígnale uno antes de correr el Redactor.',
    }
  }

  const { data: pilar } = await admin
    .from('pillars')
    .select('name')
    .eq('id', pieza.pillar_id)
    .maybeSingle()
  if (!pilar) return { ok: false, code: 'sin_pilar', message: 'El pilar de la pieza ya no existe.' }

  const { data: card } = await admin
    .from('context_card_versions')
    .select(
      'id, version, what_it_is, positioning, differentiators, faqs, audience, tone, banned_words, approved_examples, cadence, created_at',
    )
    .eq('client_id', pieza.client_id)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!card) {
    return {
      ok: false,
      code: 'sin_context_card',
      message:
        'Este cliente no tiene Context Card. El Redactor necesita la memoria de la marca para escribir con criterio. Créala en la sección Marca.',
    }
  }

  const contextCard: ContextCard = {
    id: card.id,
    version: card.version,
    whatItIs: card.what_it_is,
    positioning: card.positioning,
    differentiators: card.differentiators ?? [],
    faqs: leerFaqs(card.faqs),
    audience: card.audience,
    tone: card.tone ?? [],
    bannedWords: card.banned_words ?? [],
    approvedExamples: card.approved_examples ?? [],
    cadence: card.cadence,
    createdAt: card.created_at,
  }

  const { data: reglas } = await admin
    .from('brand_rules')
    .select('params')
    .eq('client_id', pieza.client_id)
    .eq('active', true)

  const params = (reglas ?? []).map((r) => leerParams(r.params))
  const hashtagExact = params.find((p) => p.kind === 'hashtags_exact')?.count ?? null

  const input: AgentInput<'redactor'> = {
    client_id: pieza.client_id,
    month: pieza.month as AgentInput<'redactor'>['month'],
    context_version: contextCard.version,
    piece_id: pieza.id,
    format: pieza.format,
    platforms: pieza.platforms as AgentInput<'redactor'>['platforms'],
    pillar: pilar.name,
    idea: pieza.idea,
    caption_rules: {
      lowercase_only: params.some((p) => p.kind === 'lowercase'),
      hashtag_count: hashtagExact,
      max_length: null,
      banned_words: contextCard.bannedWords,
      emojis_allowed: true,
    },
    tone: contextCard.tone,
    approved_examples: contextCard.approvedExamples,
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('redactor', input, {
    orgId: pieza.org_id,
    clientId: pieza.client_id,
    contextCard: renderContextCard(contextCard),
    contextVersion: contextCard.version,
    trigger: 'manual',
    triggeredBy: userId,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: serverEnv().AGENTS_PROVIDER,
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

  // Rama resultado: escribe el borrador de vuelta a la pieza, con procedencia.
  const data = result.output.data
  const authoredBy: Record<string, string> = {
    ...((pieza.authored_by as Record<string, string> | null) ?? {}),
    hook: 'redactor',
    copy_in: 'redactor',
    copy_out: 'redactor',
    cta: 'redactor',
    hashtags: 'redactor',
  }

  const { error: errorEscritura } = await admin
    .from('pieces')
    .update({
      hook: data.hook,
      copy_in: data.copy_in,
      copy_out: data.copy_out,
      cta: data.cta,
      hashtags: data.hashtags,
      authored_by: authoredBy,
    })
    .eq('id', pieza.id)

  if (errorEscritura) {
    // La corrida quedó registrada; solo falló pegar el resultado en la pieza.
    return {
      ok: false,
      code: 'escritura',
      message: `El Redactor corrió, pero no se pudo escribir el borrador en la pieza: ${errorEscritura.message}`,
      runId: result.runId,
    }
  }

  return {
    ok: true,
    tipo: 'escrito',
    campos: ['hook', 'copy_in', 'copy_out', 'cta', 'hashtags'],
    runId: result.runId,
    costCents: result.costCents,
  }
}
