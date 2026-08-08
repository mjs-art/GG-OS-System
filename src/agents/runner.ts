import type { z } from 'zod'
import type { AgentKey, Escalation } from '@/agents/contracts'
import { contractFor, type AgentInput, type AgentOutput } from '@/agents/registry'
import {
  avisoDeCruce,
  evaluarCorrida,
  puedeCorrer,
  type EvaluacionPresupuesto,
} from '@/domain/presupuesto'
import type { Clock } from '@/lib/time'

/**
 * El puerto por el que la app invoca a un agente.
 *
 * Este archivo NO habla con la base ni con la red. Todo lo que necesita
 * (proveedor, bitácora, presupuesto, reloj) entra por parámetro. Así la lógica
 * que decide "no llamo porque ya se pasó del tope" se prueba sin Supabase
 * levantado, que es justo la lógica que nadie quiere descubrir rota en
 * producción con la factura enfrente.
 *
 * Los cuatro requisitos duros que implementa `runAgent`:
 *
 *   1. Valida la ENTRADA con Zod antes de llamar al proveedor y la SALIDA
 *      después. Una salida que no cumple el schema es un error y se registra
 *      como tal. No se intenta arreglar, no se reintenta con "corrígete": un
 *      modelo que ya alucinó la estructura no es una fuente confiable para
 *      reparar su propia alucinación, y el reintento cuesta dinero real.
 *   2. Revisa el presupuesto ANTES de llamar. Si el gasto del mes ya alcanzó
 *      `agent_policies.monthly_cap_cents`, no llama y devuelve un error tipado.
 *   3. Registra SIEMPRE la corrida — éxito, escalamiento o error — con costo,
 *      tokens, duración y la versión del Context Card con la que corrió.
 *   4. Con `AGENTS_PROVIDER=mock` no se hace ni una llamada de red. El runner
 *      lo verifica contra `ctx.configuredProvider` antes de tocar nada.
 */

/* -------------------------------------------------------------------------- */
/*  Proveedor                                                                  */
/* -------------------------------------------------------------------------- */

export type ProviderName = 'mock' | 'anthropic'

export interface ProviderRequest<K extends AgentKey = AgentKey> {
  readonly agent: K
  readonly input: AgentInput<K>
  /** El Context Card ya renderizado a texto. El runner no lo arma; lo recibe. */
  readonly contextCard: string
  readonly contextVersion: number
  readonly model: string | null
  readonly signal?: AbortSignal
}

export interface ProviderResult {
  /**
   * Deliberadamente `unknown`: lo que devuelve un modelo es entrada no
   * confiable hasta que pasa por el schema. Tipar esto como la salida del
   * agente sería mentirle al compilador.
   */
  readonly output: unknown
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costCents: number
}

/**
 * La interfaz que implementan el mock y —después— Anthropic. El proveedor real
 * todavía no existe: primero se estabilizan los contratos, porque cambiar un
 * schema es barato y cambiar prompts contra un schema movedizo no lo es.
 */
export interface AgentProvider {
  readonly name: ProviderName
  complete<K extends AgentKey>(request: ProviderRequest<K>): Promise<ProviderResult>
}

/* -------------------------------------------------------------------------- */
/*  Dependencias de persistencia                                               */
/* -------------------------------------------------------------------------- */

export interface AgentPolicy {
  readonly enabled: boolean
  readonly monthlyCapCents: number
  readonly model: string | null
}

export interface AgentRunRecord {
  readonly orgId: string
  readonly clientId: string
  readonly agent: AgentKey
  readonly status: 'ok' | 'error'
  readonly trigger: RunTrigger
  readonly triggeredBy: string | null
  readonly contextVersion: number
  readonly model: string | null
  readonly input: unknown
  readonly output: unknown
  readonly error: string | null
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly costCents: number
  readonly durationMs: number
  readonly startedAt: Date
  readonly finishedAt: Date
}

export interface EscalationRecord {
  readonly orgId: string
  readonly clientId: string
  readonly agent: AgentKey
  readonly runId: string
  readonly pieceId: string | null
  readonly severity: Escalation['severidad']
  readonly question: string
  readonly options: Escalation['opciones']
}

/**
 * El renglón append-only de `budget_alerts`: el log inmutable del cruce del tope.
 * Es la contraparte del escalamiento (que es lo accionable en la Bandeja); este
 * es la auditoría de cuánto se llevaba y contra qué tope cuando se cruzó.
 */
export interface BudgetAlertRecord {
  readonly orgId: string
  readonly clientId: string
  readonly agent: AgentKey
  readonly runId: string
  readonly spentCents: number
  readonly capCents: number
  readonly estado: 'aviso' | 'agotado'
}

/**
 * Lo que el runner necesita de la base, expresado como interfaz para poder
 * inyectar un doble en pruebas.
 *
 * `spendThisMonthCents` es exactamente `app.agent_spend_cents_this_month`:
 * la suma vive en la base porque es la única que ve todas las corridas,
 * incluidas las de otro proceso corriendo al mismo tiempo.
 */
export interface AgentStore {
  loadPolicy(clientId: string, agent: AgentKey): Promise<AgentPolicy | null>
  spendThisMonthCents(clientId: string, agent: AgentKey): Promise<number>
  /** Devuelve el id de la corrida registrada. */
  recordRun(run: AgentRunRecord): Promise<string>
  recordEscalation(escalation: EscalationRecord): Promise<void>
  /** Registra el cruce del tope en el log append-only de avisos. */
  recordBudgetAlert(alert: BudgetAlertRecord): Promise<void>
}

/* -------------------------------------------------------------------------- */
/*  Contexto de corrida                                                        */
/* -------------------------------------------------------------------------- */

export type RunTrigger = 'manual' | 'cron' | 'evento'

export interface RunContext {
  readonly orgId: string
  readonly clientId: string
  readonly contextCard: string
  readonly contextVersion: number
  readonly trigger: RunTrigger
  readonly triggeredBy: string | null
  readonly provider: AgentProvider
  readonly store: AgentStore
  readonly clock: Clock
  /**
   * Lo que dice `AGENTS_PROVIDER`. Llega por parámetro y no por import de
   * `@/lib/env` para que este archivo no dependa de que haya variables de
   * entorno cargadas; quien compone la corrida lo lee de `serverEnv()`.
   */
  readonly configuredProvider: ProviderName
  /**
   * Salta la puerta del interruptor `enabled` — y SOLO esa.
   *
   * Lo usa "preparar el mes", que corre la cadena aunque el agente esté apagado
   * para el cliente. NO salta la política (de ahí sale el tope) ni el
   * presupuesto: encender de golpe no puede volverse gastar sin límite. Un
   * agente sin política sigue sin correr, y uno que ya tocó su tope tampoco.
   */
  readonly omitirInterruptor?: boolean
  readonly signal?: AbortSignal
}

/* -------------------------------------------------------------------------- */
/*  Resultado                                                                  */
/* -------------------------------------------------------------------------- */

export type AgentFailureCode =
  | 'agente_apagado'
  | 'sin_politica'
  | 'presupuesto_agotado'
  | 'proveedor_no_permitido'
  | 'entrada_invalida'
  | 'salida_invalida'
  | 'proveedor_fallo'

export interface AgentFailure {
  readonly code: AgentFailureCode
  /** Redactado en español: se muestra tal cual en la bitácora y en la Bandeja. */
  readonly message: string
  /** Detalle por campo cuando falló una validación de Zod. */
  readonly issues?: readonly string[]
  readonly spentCents?: number
  readonly capCents?: number
}

export type RunResult<K extends AgentKey> =
  | {
      readonly ok: true
      readonly runId: string
      readonly output: AgentOutput<K>
      readonly costCents: number
      readonly durationMs: number
      /**
       * El estado del tope tras esta corrida. `presupuesto.cruzoAviso` es la
       * señal de "acabas de pasar el 80%": llega una sola vez, en la corrida que
       * cruza, para que quien compone la corrida la levante (a la Bandeja, a un
       * aviso) sin re-consultar la base. La regla del tope vive en
       * `@/domain/presupuesto`, no aquí.
       */
      readonly presupuesto: EvaluacionPresupuesto
    }
  | { readonly ok: false; readonly runId: string | null; readonly error: AgentFailure }

function formatIssues(error: z.ZodError): readonly string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

/* -------------------------------------------------------------------------- */
/*  runAgent                                                                   */
/* -------------------------------------------------------------------------- */

export async function runAgent<K extends AgentKey>(
  agent: K,
  input: AgentInput<K>,
  ctx: RunContext,
): Promise<RunResult<K>> {
  const contract = contractFor(agent)
  const startedAt = ctx.clock.now()

  /* --- Puerta 1: el proveedor configurado ---------------------------------
     Se revisa antes que nada. Si la configuración dice `mock`, ni un proveedor
     inyectado por error puede abrir una conexión. */
  if (ctx.provider.name !== ctx.configuredProvider) {
    return {
      ok: false,
      runId: null,
      error: {
        code: 'proveedor_no_permitido',
        message:
          `AGENTS_PROVIDER está en "${ctx.configuredProvider}" pero se inyectó el proveedor ` +
          `"${ctx.provider.name}". No se hace la llamada.`,
      },
    }
  }

  /* --- Puerta 2: la política del cliente ---------------------------------- */
  const policy = await ctx.store.loadPolicy(ctx.clientId, agent)
  if (!policy) {
    return {
      ok: false,
      runId: null,
      error: {
        code: 'sin_politica',
        message: `El agente ${agent} no está configurado para este cliente.`,
      },
    }
  }
  if (!policy.enabled && !ctx.omitirInterruptor) {
    return {
      ok: false,
      runId: null,
      error: {
        code: 'agente_apagado',
        message: `El agente ${agent} está apagado para este cliente.`,
      },
    }
  }

  /* --- Puerta 3: el presupuesto -------------------------------------------
     Antes de llamar, no después. Un bug de reintentos no debe poder gastar mil
     dólares mientras nadie ve. */
  const spentCents = await ctx.store.spendThisMonthCents(ctx.clientId, agent)
  if (!puedeCorrer({ topeCents: policy.monthlyCapCents, gastadoCents: spentCents })) {
    return {
      ok: false,
      runId: null,
      error: {
        code: 'presupuesto_agotado',
        message:
          `El agente ${agent} ya gastó ${spentCents}¢ de su tope de ` +
          `${policy.monthlyCapCents}¢ este mes. No se hace la llamada.`,
        spentCents,
        capCents: policy.monthlyCapCents,
      },
    }
  }

  /* --- Puerta 4: la entrada ------------------------------------------------
     Mandar una entrada incompleta al modelo produce una salida plausible y
     equivocada, que es el peor de los resultados posibles. */
  const parsedInput = contract.input.safeParse(input)
  if (!parsedInput.success) {
    return {
      ok: false,
      runId: null,
      error: {
        code: 'entrada_invalida',
        message: `La entrada de ${agent} no cumple su contrato.`,
        issues: formatIssues(parsedInput.error),
      },
    }
  }

  /* --- La llamada ---------------------------------------------------------- */
  let result: ProviderResult
  try {
    result = await ctx.provider.complete({
      agent,
      input: parsedInput.data as AgentInput<K>,
      contextCard: ctx.contextCard,
      contextVersion: ctx.contextVersion,
      model: policy.model,
      ...(ctx.signal ? { signal: ctx.signal } : {}),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Error desconocido del proveedor.'
    // Una corrida que truena también se registra: si solo se guardan los
    // éxitos, la tasa de error del tablero siempre es cero.
    const runId = await recordFailure(ctx, {
      agent,
      input: parsedInput.data,
      error: `proveedor_fallo: ${message}`,
      startedAt,
      model: policy.model,
      costCents: 0,
      inputTokens: null,
      outputTokens: null,
    })
    return {
      ok: false,
      runId,
      error: { code: 'proveedor_fallo', message: `El proveedor falló: ${message}` },
    }
  }

  /* --- Puerta 5: la salida -------------------------------------------------
     Se cobra igual aunque la salida venga mal, así que el costo se registra
     tanto en el camino feliz como en este. */
  const parsedOutput = contract.output.safeParse(result.output)
  if (!parsedOutput.success) {
    const issues = formatIssues(parsedOutput.error)
    const runId = await recordFailure(ctx, {
      agent,
      input: parsedInput.data,
      error: `salida_invalida: ${issues.join(' · ')}`,
      startedAt,
      model: result.model,
      costCents: result.costCents,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      rawOutput: result.output,
    })
    return {
      ok: false,
      runId,
      error: {
        code: 'salida_invalida',
        message: `La salida de ${agent} no cumple su contrato.`,
        issues,
      },
    }
  }

  const output = parsedOutput.data as AgentOutput<K>
  const finishedAt = ctx.clock.now()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  const runId = await ctx.store.recordRun({
    orgId: ctx.orgId,
    clientId: ctx.clientId,
    agent,
    status: 'ok',
    trigger: ctx.trigger,
    triggeredBy: ctx.triggeredBy,
    contextVersion: ctx.contextVersion,
    model: result.model,
    input: parsedInput.data,
    output,
    error: null,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costCents: result.costCents,
    durationMs,
    startedAt,
    finishedAt,
  })

  // Escalar no es un error: la corrida se registra como `ok` y además entra a
  // la Bandeja para que alguien conteste.
  if (output.kind === 'escalamiento') {
    await ctx.store.recordEscalation({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      agent,
      runId,
      pieceId: output.piece_id ?? null,
      severity: output.severidad,
      question: output.pregunta,
      options: output.opciones,
    })
  }

  // El tope se evalúa con el gasto de ANTES de esta corrida (el que ya vio la
  // Puerta 3) más lo que costó. `evaluarCorrida` decide si este fue el cruce del
  // 80% — la aritmética del umbral no se repite aquí.
  const presupuesto = evaluarCorrida({
    topeCents: policy.monthlyCapCents,
    gastadoAntesCents: spentCents,
    costoCents: result.costCents,
  })

  // El cruce del 80% entra a la Bandeja como un escalamiento del agente. Es
  // best-effort: si falla el registro del aviso, la corrida sigue siendo un
  // éxito —ya está en la bitácora—, y romperla por no poder avisar sería peor.
  if (presupuesto.cruzoAviso) {
    await avisarCruce(ctx, agent, runId, policy.monthlyCapCents, presupuesto)
  }

  return { ok: true, runId, output, costCents: result.costCents, durationMs, presupuesto }
}

/**
 * Levanta el aviso de cruce del tope como un escalamiento. Nunca propaga: un
 * aviso que no se pudo guardar no debe tumbar una corrida que sí terminó bien.
 */
async function avisarCruce(
  ctx: RunContext,
  agent: AgentKey,
  runId: string,
  capCents: number,
  presupuesto: EvaluacionPresupuesto,
): Promise<void> {
  const estado = presupuesto.estadoDespues === 'agotado' ? 'agotado' : 'aviso'

  // El log inmutable (budget_alerts) y el escalamiento a la Bandeja son dos
  // cosas: uno audita, el otro pide acción. Van en try/catch separados para que
  // si falla uno, el otro igual quede — y ninguno tumbe una corrida exitosa.
  try {
    await ctx.store.recordBudgetAlert({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      agent,
      runId,
      spentCents: presupuesto.gastadoDespuesCents,
      capCents,
      estado,
    })
  } catch (cause) {
    console.error('No se pudo registrar el aviso de presupuesto en la bitácora.', cause)
  }

  try {
    const aviso = avisoDeCruce(presupuesto.gastadoDespuesCents, capCents)
    await ctx.store.recordEscalation({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      agent,
      runId,
      pieceId: null,
      severity: estado === 'agotado' ? 'alta' : 'media',
      question: aviso.pregunta,
      options: aviso.opciones,
    })
  } catch (cause) {
    console.error('No se pudo registrar el aviso de cruce de presupuesto.', cause)
  }
}

interface FailureLog {
  readonly agent: AgentKey
  readonly input: unknown
  readonly error: string
  readonly startedAt: Date
  readonly model: string | null
  readonly costCents: number
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly rawOutput?: unknown
}

/**
 * Registra la corrida fallida. Si la bitácora misma truena se devuelve `null`
 * en lugar de propagar: perder el registro es malo, pero enmascarar el error
 * original con el de la bitácora deja a quien depura sin nada que leer.
 */
async function recordFailure(ctx: RunContext, log: FailureLog): Promise<string | null> {
  const finishedAt = ctx.clock.now()
  try {
    return await ctx.store.recordRun({
      orgId: ctx.orgId,
      clientId: ctx.clientId,
      agent: log.agent,
      status: 'error',
      trigger: ctx.trigger,
      triggeredBy: ctx.triggeredBy,
      contextVersion: ctx.contextVersion,
      model: log.model,
      input: log.input,
      output: log.rawOutput ?? null,
      error: log.error,
      inputTokens: log.inputTokens,
      outputTokens: log.outputTokens,
      costCents: log.costCents,
      durationMs: finishedAt.getTime() - log.startedAt.getTime(),
      startedAt: log.startedAt,
      finishedAt,
    })
  } catch (cause) {
    console.error('No se pudo registrar la corrida fallida del agente.', cause)
    return null
  }
}
