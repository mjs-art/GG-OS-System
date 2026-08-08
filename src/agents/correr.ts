import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextCard, PreguntaFrecuente } from '@/lib/datos/secciones'
import { renderContextCard } from '@/agents/context-card'
import { createAnthropicProvider } from '@/agents/providers/anthropic'
import { createMockProvider } from '@/agents/providers/mock'
import type { AgentInput } from '@/agents/registry'
import { runAgent, type AgentProvider, type RunTrigger } from '@/agents/runner'
import { createAgentStore } from '@/agents/store'
import {
  construirNoPublicadas,
  construirPiecePerformance,
  totalesDeMes,
  type PiezaMedida,
  type PiezaPendiente,
} from '@/domain/analista-entrada'
import { construirCuentasAuditor } from '@/domain/auditor-entrada'
import {
  rendimientoPorFormato,
  rendimientoPorPilar,
  type MedicionDePieza,
} from '@/domain/estratega-entrada'
import type { PieceFormat, StoryKind } from '@/domain/labels'
import { serverEnv } from '@/lib/env'
import type { Database, Json } from '@/lib/supabase/database.types'
import { addMonths, systemClock, type MonthKey } from '@/lib/time'

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

export function proveedorDeEnv(): AgentProvider | { error: string } {
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
  opciones: { omitirInterruptor?: boolean } = {},
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
    ...(opciones.omitirInterruptor ? { omitirInterruptor: true } : {}),
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

/* ==========================================================================
   ESTRATEGA — el plan de volumen del mes
   ========================================================================== */

export type ResultadoEstratega =
  | { readonly ok: true; readonly tipo: 'plan'; readonly total: number; readonly runId: string }
  | {
      readonly ok: true
      readonly tipo: 'escalado'
      readonly pregunta: string
      readonly runId: string
    }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly runId?: string }

/**
 * El enum de la base y el del contrato del Estratega no son el mismo conjunto:
 * la base tiene `festividad` y `aniversario`, el contrato tiene `efemeride`.
 * Este mapa los reconcilia en vez de mandar un valor que el schema rechaza —
 * cosa que abortaría la corrida en la puerta de validación de entrada.
 */
const KIND_FECHA_A_CONTRATO: Record<string, 'temporada' | 'promocion' | 'evento' | 'efemeride'> = {
  temporada: 'temporada',
  promocion: 'promocion',
  evento: 'evento',
  festividad: 'efemeride',
  aniversario: 'evento',
}

/**
 * El compositor del Estratega: arma su entrada desde los resultados de los
 * últimos ~90 días, la capacidad que Ana declaró y las fechas clave, corre el
 * agente y escribe el plan a `volume_plans`.
 *
 * Igual que el Redactor: lee con el cliente admin porque la ruta ya autorizó
 * antes con el de sesión. Escribe un borrador de plan; la aprobación es aparte.
 *
 * No inventa capacidad: si Ana no la ha declarado (en Recalcular volumen), no
 * corre y lo dice. Un plan sin tope es justo el plan precioso e imposible que la
 * columna `capacity_declared` existe para evitar.
 */
export async function correrEstratega(
  admin: SupabaseClient<Database>,
  clientId: string,
  month: MonthKey,
  userId: string,
  opciones: { omitirInterruptor?: boolean } = {},
): Promise<ResultadoEstratega> {
  const { data: cliente, error: errorCliente } = await admin
    .from('clients')
    .select('id, org_id, tier, pillars ( id, name, target_pct )')
    .eq('id', clientId)
    .maybeSingle()

  if (errorCliente)
    return {
      ok: false,
      code: 'lectura',
      message: `No se pudo leer el cliente: ${errorCliente.message}`,
    }
  if (!cliente) return { ok: false, code: 'no_encontrado', message: 'No se encontró el cliente.' }

  const pilares = cliente.pillars ?? []
  if (pilares.length === 0) {
    return {
      ok: false,
      code: 'sin_pilares',
      message:
        'Este cliente no tiene pilares. El Estratega reparte el mes entre pilares; defínelos en Marca antes de correrlo.',
    }
  }

  const { data: plan } = await admin
    .from('volume_plans')
    .select('capacity_declared, pillar_mix')
    .eq('client_id', clientId)
    .eq('month', month)
    .maybeSingle()

  if (!plan || plan.capacity_declared === null) {
    return {
      ok: false,
      code: 'sin_capacidad',
      message:
        'Falta declarar la capacidad del mes. Ábrela en Recalcular volumen y guarda cuántas piezas puedes producir; el Estratega corre contra ese tope.',
    }
  }

  const { data: card } = await admin
    .from('context_card_versions')
    .select(
      'id, version, what_it_is, positioning, differentiators, faqs, audience, tone, banned_words, approved_examples, cadence, created_at',
    )
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!card) {
    return {
      ok: false,
      code: 'sin_context_card',
      message:
        'Este cliente no tiene Context Card. El Estratega necesita la memoria de la marca para justificar el plan. Créala en Marca.',
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

  /* --- Rendimiento de los últimos ~90 días -------------------------------- */
  const mesAnterior = addMonths(month, -1)
  const ventana = [month, mesAnterior, addMonths(month, -2)]

  const { data: piezasVentana } = await admin
    .from('pieces')
    .select('id, month, format, pillar_id')
    .eq('client_id', clientId)
    .in('month', ventana)

  const ids = (piezasVentana ?? []).map((p) => p.id)
  const { data: mediciones } = ids.length
    ? await admin
        .from('results_piece')
        .select('piece_id, reach, saves, interactions')
        .eq('client_id', clientId)
        .in('piece_id', ids)
        .order('measured_at', { ascending: false })
    : { data: [] as { piece_id: string; reach: number; saves: number; interactions: number }[] }

  // Una pieza se mide varias veces; vale la última. La consulta viene ordenada
  // por `measured_at` desc, así que la primera que se ve gana.
  const ultima = new Map<string, { reach: number; saves: number; interactions: number }>()
  for (const m of mediciones ?? []) {
    if (!ultima.has(m.piece_id)) ultima.set(m.piece_id, m)
  }

  const medidas: MedicionDePieza[] = []
  for (const pieza of piezasVentana ?? []) {
    const m = ultima.get(pieza.id)
    if (!m) continue
    medidas.push({
      format: pieza.format,
      pillarId: pieza.pillar_id,
      reach: m.reach,
      saves: m.saves,
      interactions: m.interactions,
    })
  }

  const objetivos = (plan.pillar_mix ?? {}) as Record<string, number>
  const pilaresConObjetivo = pilares.map((p) => {
    const objetivo = objetivos[p.id]
    return {
      id: p.id,
      name: p.name,
      targetPct: typeof objetivo === 'number' ? objetivo : p.target_pct,
    }
  })

  /* --- Conteos del mes anterior, tal como fueron -------------------------- */
  const feedPrev: Record<PieceFormat, number> = { post: 0, carrusel: 0, reel: 0 }
  for (const pieza of piezasVentana ?? []) {
    if (pieza.month === mesAnterior) feedPrev[pieza.format] += 1
  }

  const { data: storiesPrev } = await admin
    .from('stories')
    .select('kind')
    .eq('client_id', clientId)
    .eq('month', mesAnterior)

  const storyPrev: Record<StoryKind, number> = { diaria: 0, campana: 0, interactiva: 0 }
  for (const s of storiesPrev ?? []) storyPrev[s.kind] += 1

  /* --- Fechas clave de aquí en adelante ----------------------------------- */
  const primeroDelMes = `${month}-01`
  const { data: fechas } = await admin
    .from('key_dates')
    .select('date, title, kind, notes')
    .eq('client_id', clientId)
    .gte('date', primeroDelMes)
    .order('date')

  const key_dates = (fechas ?? []).map((f) => ({
    month: f.date.slice(0, 7) as MonthKey,
    title: f.title,
    kind: KIND_FECHA_A_CONTRATO[f.kind] ?? 'evento',
    starts_on: f.date,
    ends_on: null,
    notes: f.notes,
  }))

  const input: AgentInput<'estratega'> = {
    client_id: clientId,
    month,
    context_version: contextCard.version,
    tier: cliente.tier ?? 'sin tier',
    capacity_declared: plan.capacity_declared,
    format_performance: rendimientoPorFormato(medidas),
    pillar_performance: rendimientoPorPilar(medidas, pilaresConObjetivo),
    previous_counts: { feed: feedPrev, stories: storyPrev },
    key_dates,
    planned_ad_budget_cents: 0,
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('estratega', input, {
    orgId: cliente.org_id,
    clientId,
    contextCard: renderContextCard(contextCard),
    contextVersion: contextCard.version,
    trigger: 'manual',
    triggeredBy: userId,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: serverEnv().AGENTS_PROVIDER,
    ...(opciones.omitirInterruptor ? { omitirInterruptor: true } : {}),
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

  /* --- Escribir el plan a volume_plans ------------------------------------ */
  const data = result.output.data

  const feedCounts: Record<string, number> = {}
  for (const [formato, row] of Object.entries(data.feed)) feedCounts[formato] = row.count
  const storyCounts: Record<string, number> = {}
  for (const [tipo, row] of Object.entries(data.stories)) storyCounts[tipo] = row.count

  // El plan escribe la mezcla por PILAR usando su id, no su nombre: la barra de
  // distribución cruza contra los pilares del cliente por id.
  const idPorNombre = new Map(pilares.map((p) => [p.name, p.id] as const))
  const pillarMix: Record<string, number> = {}
  for (const fila of data.pillar_mix) {
    const id = idPorNombre.get(fila.pillar)
    if (id) pillarMix[id] = fila.pct
  }

  // `rationale` se guarda como objeto {cambio: porque}: la columna exige un
  // objeto jsonb (no un arreglo) y el lector acepta esa forma. La evidencia
  // completa con su número vive en la corrida (`agent_runs`), que es de donde el
  // bloque "Por qué esta mezcla" saca los bullets ricos.
  const rationale: Record<string, string> = {}
  for (const r of data.rationale) rationale[r.change] = r.because

  const { error: errorEscritura } = await admin
    .from('volume_plans')
    .update({
      feed_counts: feedCounts,
      story_counts: storyCounts,
      pillar_mix: pillarMix,
      rationale,
      updated_at: systemClock.now().toISOString(),
    })
    .eq('client_id', clientId)
    .eq('month', month)

  if (errorEscritura) {
    return {
      ok: false,
      code: 'escritura',
      message: `El Estratega corrió, pero no se pudo escribir el plan: ${errorEscritura.message}`,
      runId: result.runId,
    }
  }

  return { ok: true, tipo: 'plan', total: data.total_pieces, runId: result.runId }
}

/* ==========================================================================
   AUDITOR — el semáforo por red
   ========================================================================== */

export type ResultadoAuditor =
  | {
      readonly ok: true
      readonly tipo: 'auditoria'
      readonly cuentas: number
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

/**
 * El compositor del Auditor: arma su entrada desde `social_accounts`, corre el
 * agente y escribe una fila de `account_audits` por red — con su corrida detrás.
 *
 * Escribir aquí, con el cliente admin, es a propósito: `account_audits` es
 * append-only y `authenticated` solo la lee. Una auditoría sin corrida que la
 * respalde no se puede rastrear, así que la produce el runner, no un botón. La
 * ruta ya verificó ANTES, con el cliente de sesión, que quien dispara es del
 * estudio del cliente.
 *
 * No inventa datos: si el cliente no tiene redes conectadas, no corre y lo dice.
 */
export async function correrAuditor(
  admin: SupabaseClient<Database>,
  clientId: string,
  userId: string | null,
  opciones: { omitirInterruptor?: boolean; trigger?: RunTrigger } = {},
): Promise<ResultadoAuditor> {
  const { data: cliente, error: errorCliente } = await admin
    .from('clients')
    .select('id, org_id')
    .eq('id', clientId)
    .maybeSingle()

  if (errorCliente)
    return {
      ok: false,
      code: 'lectura',
      message: `No se pudo leer el cliente: ${errorCliente.message}`,
    }
  if (!cliente) return { ok: false, code: 'no_encontrado', message: 'No se encontró el cliente.' }

  const { data: cuentas, error: errorCuentas } = await admin
    .from('social_accounts')
    .select(
      'platform, handle, url, followers, followers_delta, last_post_at, posts_per_week, target_per_week, profile_checklist, unanswered_dms, unanswered_comments',
    )
    .eq('client_id', clientId)

  if (errorCuentas)
    return {
      ok: false,
      code: 'lectura',
      message: `No se pudieron leer las redes: ${errorCuentas.message}`,
    }
  if (!cuentas || cuentas.length === 0) {
    return {
      ok: false,
      code: 'sin_cuentas',
      message:
        'Este cliente no tiene redes conectadas. Conecta al menos una cuenta antes de correr el Auditor.',
    }
  }

  const { data: card } = await admin
    .from('context_card_versions')
    .select(
      'id, version, what_it_is, positioning, differentiators, faqs, audience, tone, banned_words, approved_examples, cadence, created_at',
    )
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!card) {
    return {
      ok: false,
      code: 'sin_context_card',
      message:
        'Este cliente no tiene Context Card. Toda corrida se registra con la versión con la que corrió; créala en Marca antes de auditar.',
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

  // El mes solo etiqueta la corrida (una auditoría no es mensual). Se arma en UTC
  // sin crear un Date fuera de @/lib/time, igual que el chequeo de gasto.
  const ahora = systemClock.now()
  const month =
    `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}` as MonthKey

  const input: AgentInput<'auditor'> = {
    client_id: clientId,
    month,
    context_version: contextCard.version,
    accounts: construirCuentasAuditor(cuentas),
    checked_at: ahora.toISOString(),
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('auditor', input, {
    orgId: cliente.org_id,
    clientId,
    contextCard: renderContextCard(contextCard),
    contextVersion: contextCard.version,
    trigger: opciones.trigger ?? 'manual',
    triggeredBy: userId,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: serverEnv().AGENTS_PROVIDER,
    ...(opciones.omitirInterruptor ? { omitirInterruptor: true } : {}),
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

  // Una fila por red. `findings` guarda el semáforo, el titular y los hallazgos;
  // la columna `score` es el número que ordena las tarjetas de Redes.
  const data = result.output.data
  const filas = data.accounts.map((cuenta) => ({
    org_id: cliente.org_id,
    client_id: clientId,
    platform: cuenta.platform,
    score: cuenta.score,
    findings: {
      light: cuenta.light,
      headline: data.headline,
      findings: cuenta.findings,
    } as Json,
  }))

  const { error: errorEscritura } = await admin.from('account_audits').insert(filas)
  if (errorEscritura) {
    return {
      ok: false,
      code: 'escritura',
      message: `El Auditor corrió, pero no se pudo guardar la auditoría: ${errorEscritura.message}`,
      runId: result.runId,
    }
  }

  return {
    ok: true,
    tipo: 'auditoria',
    cuentas: filas.length,
    runId: result.runId,
    costCents: result.costCents,
  }
}

/* ==========================================================================
   ANALISTA — la lectura del mes
   ========================================================================== */

export type ModoAnalista = 'cierre' | 'mitad_de_mes'

export type ResultadoAnalista =
  | {
      readonly ok: true
      readonly tipo: 'analisis'
      readonly quitar: number
      readonly meterMas: number
      readonly mejorar: number
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

/**
 * El compositor del Analista: arma la lectura del mes desde los resultados por
 * pieza, los totales del mes y lo que todavía no sale, corre el agente y —como el
 * Analista `writes: []`— deja su propuesta en la bitácora (y en la Bandeja si
 * escala). No escribe de vuelta al Context Card: los `learnings` son una
 * propuesta, y aplicarlos es una acción humana aparte (regla #1).
 *
 * Una pieza publicada sin métricas capturadas se omite del análisis: no se puede
 * leer lo que no se midió, y meterla en cero la haría ver como la peor del mes.
 */
export async function correrAnalista(
  admin: SupabaseClient<Database>,
  clientId: string,
  month: MonthKey,
  mode: ModoAnalista,
  userId: string | null,
  opciones: { omitirInterruptor?: boolean; trigger?: RunTrigger } = {},
): Promise<ResultadoAnalista> {
  const { data: cliente, error: errorCliente } = await admin
    .from('clients')
    .select('id, org_id')
    .eq('id', clientId)
    .maybeSingle()

  if (errorCliente)
    return {
      ok: false,
      code: 'lectura',
      message: `No se pudo leer el cliente: ${errorCliente.message}`,
    }
  if (!cliente) return { ok: false, code: 'no_encontrado', message: 'No se encontró el cliente.' }

  const { data: card } = await admin
    .from('context_card_versions')
    .select(
      'id, version, what_it_is, positioning, differentiators, faqs, audience, tone, banned_words, approved_examples, cadence, created_at',
    )
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!card) {
    return {
      ok: false,
      code: 'sin_context_card',
      message:
        'Este cliente no tiene Context Card. Toda corrida se registra con la versión con la que corrió; créala en Marca antes de analizar.',
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

  const { data: piezas } = await admin
    .from('pieces')
    .select('id, format, pillar_id, hook, status, publish_at')
    .eq('client_id', clientId)
    .eq('month', month)

  const { data: pilares } = await admin.from('pillars').select('id, name').eq('client_id', clientId)
  const nombrePilar = new Map((pilares ?? []).map((p) => [p.id, p.name] as const))
  const pilarDe = (id: string | null): string =>
    id ? (nombrePilar.get(id) ?? 'Sin pilar') : 'Sin pilar'

  const publicadas = (piezas ?? []).filter((p) => p.status === 'publicado' && p.publish_at)
  const pendientesRaw = (piezas ?? []).filter((p) => p.status !== 'publicado' && p.publish_at)

  // La última medición por pieza publicada. Igual que el Estratega: se ordena
  // por `measured_at` desc y la primera que aparece por pieza gana.
  const idsPublicadas = publicadas.map((p) => p.id)
  const { data: mediciones } = idsPublicadas.length
    ? await admin
        .from('results_piece')
        .select('piece_id, reach, interactions, saves, shares, measured_at')
        .eq('client_id', clientId)
        .in('piece_id', idsPublicadas)
        .order('measured_at', { ascending: false })
    : {
        data: [] as {
          piece_id: string
          reach: number
          interactions: number
          saves: number
          shares: number
          measured_at: string
        }[],
      }

  const ultima = new Map<
    string,
    { reach: number; interactions: number; saves: number; shares: number }
  >()
  for (const m of mediciones ?? []) {
    if (!ultima.has(m.piece_id)) ultima.set(m.piece_id, m)
  }

  const medidas: PiezaMedida[] = []
  for (const p of publicadas) {
    const publishAt = p.publish_at
    const m = ultima.get(p.id)
    if (!publishAt || !m) continue
    medidas.push({
      piece_id: p.id,
      format: p.format,
      pillar: pilarDe(p.pillar_id),
      published_at: publishAt,
      hook: p.hook,
      reach: m.reach,
      interactions: m.interactions,
      saves: m.saves,
      shares: m.shares,
    })
  }

  const pendientes: PiezaPendiente[] = []
  for (const p of pendientesRaw) {
    const publishAt = p.publish_at
    if (!publishAt) continue
    pendientes.push({
      piece_id: p.id,
      publish_at: publishAt,
      format: p.format,
      pillar: pilarDe(p.pillar_id),
      hook: p.hook,
      status: p.status,
    })
  }

  const { data: mensual } = await admin
    .from('results_monthly')
    .select(
      'reach, impressions, saves, shares, profile_visits, link_clicks, new_followers, updated_at',
    )
    .eq('client_id', clientId)
    .eq('month', month)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // El objetivo del mes no tiene columna propia; se toma de la campaña más
  // reciente del cliente (su `objective` es un objetivo declarado). Sin campaña,
  // un default neutro: el objetivo solo matiza qué CTA propone el agente.
  const { data: campanas } = await admin
    .from('campaigns')
    .select('objective, start_date')
    .eq('client_id', clientId)
    .order('start_date', { ascending: false })
    .limit(1)
  const monthGoal =
    campanas?.[0]?.objective?.trim() || 'Crecer y mantener la cuenta activa este mes.'

  const input: AgentInput<'analista'> = {
    client_id: clientId,
    month,
    context_version: contextCard.version,
    mode,
    piece_performance: construirPiecePerformance(medidas),
    monthly_totals: totalesDeMes(mensual ?? null),
    unpublished_pieces: construirNoPublicadas(pendientes),
    month_goal: monthGoal,
  }

  const proveedor = proveedorDeEnv()
  if ('error' in proveedor) return { ok: false, code: 'config', message: proveedor.error }

  const result = await runAgent('analista', input, {
    orgId: cliente.org_id,
    clientId,
    contextCard: renderContextCard(contextCard),
    contextVersion: contextCard.version,
    trigger: opciones.trigger ?? 'manual',
    triggeredBy: userId,
    provider: proveedor,
    store: createAgentStore(admin),
    clock: systemClock,
    configuredProvider: serverEnv().AGENTS_PROVIDER,
    ...(opciones.omitirInterruptor ? { omitirInterruptor: true } : {}),
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
  return {
    ok: true,
    tipo: 'analisis',
    quitar: data.quitar.length,
    meterMas: data.meter_mas.length,
    mejorar: data.mejorar.length,
    runId: result.runId,
    costCents: result.costCents,
  }
}
