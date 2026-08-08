import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AGENT_KEYS, escalationSchema, monthKeySchema, type AgentKey } from '@/agents/contracts'
import { createMockProvider, TOWER_BAR_INPUTS } from '@/agents/providers/mock'
import { AGENTS, contractFor, isAgentKey } from '@/agents/registry'
import {
  runAgent,
  type AgentPolicy,
  type AgentRunRecord,
  type AgentStore,
  type BudgetAlertRecord,
  type EscalationRecord,
  type RunContext,
} from '@/agents/runner'
import { fixedClock } from '@/lib/time'

const clock = fixedClock('2026-09-10T18:00:00.000Z')
const provider = createMockProvider(clock)

/* -------------------------------------------------------------------------- */
/*  El registro contra el enum de la base                                      */
/* -------------------------------------------------------------------------- */

describe('registro de agentes', () => {
  /**
   * La fuente de verdad de los nombres es el enum de Postgres. Si alguien
   * agrega un noveno agente en una migración y se le olvida el contrato, esta
   * prueba truena antes de que el runner explote con un `undefined`.
   */
  it('cubre exactamente el enum app.agent_key de la migración', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260801000001_foundation.sql'),
      'utf8',
    )
    const block = /create type app\.agent_key as enum \(([\s\S]*?)\);/.exec(sql)?.[1] ?? ''
    const fromDatabase = [...block.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])

    expect(fromDatabase.length).toBe(8)
    expect(fromDatabase).toEqual([...AGENT_KEYS])
    expect(Object.keys(AGENTS).sort()).toEqual([...AGENT_KEYS].sort())
  })

  it('cada agente trae descripción, contratos y lista de campos que escribe', () => {
    for (const key of AGENT_KEYS) {
      const contract = contractFor(key)
      expect(contract.key).toBe(key)
      expect(contract.description.length).toBeGreaterThan(10)
      expect(typeof contract.input.safeParse).toBe('function')
      expect(typeof contract.output.safeParse).toBe('function')
      expect(Array.isArray(contract.writes)).toBe(true)
    }
  })

  it('solo el redactor escribe el copy y solo el guionista el guion', () => {
    expect(AGENTS.redactor.writes).toContain('hook')
    expect(AGENTS.guionista.writes).toEqual(['script'])
    // El editor dictamina; si además corrigiera, su verdicto dejaría de ser
    // una revisión independiente.
    expect(AGENTS.editor_marca.writes).toEqual([])
  })

  it('rechaza llaves de agente que no existen', () => {
    expect(isAgentKey('estratega')).toBe(true)
    expect(isAgentKey('community_manager')).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  Entradas inválidas                                                         */
/* -------------------------------------------------------------------------- */

describe('contratos de entrada', () => {
  it('ningún agente acepta una entrada vacía', () => {
    for (const key of AGENT_KEYS) {
      expect(contractFor(key).input.safeParse({}).success).toBe(false)
    }
  })

  it('rechaza un mes que no es AAAA-MM', () => {
    expect(monthKeySchema.safeParse('2026-9').success).toBe(false)
    expect(monthKeySchema.safeParse('2026-13').success).toBe(false)
    expect(monthKeySchema.safeParse('septiembre').success).toBe(false)
    expect(monthKeySchema.safeParse('2026-09').success).toBe(true)
  })

  it('rechaza client_id que no es uuid y context_version en cero', () => {
    const bad = { ...TOWER_BAR_INPUTS.auditor, client_id: 'tower-bar' }
    expect(contractFor('auditor').input.safeParse(bad).success).toBe(false)

    const zeroVersion = { ...TOWER_BAR_INPUTS.auditor, context_version: 0 }
    expect(contractFor('auditor').input.safeParse(zeroVersion).success).toBe(false)
  })

  it('el editor de marca exige al menos una regla contra la cual verificar', () => {
    const sinReglas = { ...TOWER_BAR_INPUTS.editor_marca, rules: [] }
    expect(contractFor('editor_marca').input.safeParse(sinReglas).success).toBe(false)
  })

  it('el guionista exige una tendencia: no la descubre solo', () => {
    const { trend: _trend, ...sinTendencia } = TOWER_BAR_INPUTS.guionista
    expect(contractFor('guionista').input.safeParse(sinTendencia).success).toBe(false)
  })

  it('acepta las entradas de ejemplo de Tower Bar', () => {
    for (const key of AGENT_KEYS) {
      const result = contractFor(key).input.safeParse(TOWER_BAR_INPUTS[key])
      expect(result.success, `entrada inválida para ${key}`).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  Salidas inválidas                                                          */
/* -------------------------------------------------------------------------- */

describe('contratos de salida', () => {
  it('rechaza un plan de volumen cuyo total no cuadra con sus renglones', () => {
    const row = { count: 1, previous_count: 1, reason: 'x', metric: 'y' }
    const bad = {
      kind: 'resultado',
      data: {
        month: '2026-09',
        total_pieces: 99,
        feed: { post: row, carrusel: row, reel: row },
        stories: { diaria: row, campana: row, interactiva: row },
        pillar_mix: [{ pillar: 'Coctelería', pct: 100, target_pct: 100, on_target: true }],
        rationale: [
          {
            change: 'x',
            because: 'y',
            evidence: { metric: 'm', value: 1, unit: 'conteo', benchmark: null, text: 't' },
          },
        ],
        upcoming: [],
        capacity_note: 'ok',
      },
    }
    expect(contractFor('estratega').output.safeParse(bad).success).toBe(false)
  })

  it('rechaza un guion con escenas encimadas o más largas que su duración', () => {
    const build = (scenes: unknown) => ({
      kind: 'resultado',
      data: {
        piece_id: '00000000-0000-4000-8000-000000000001',
        trend_id: '00000000-0000-4000-8000-000000000002',
        trend_base: 'barra vacía a barra llena',
        fit_score: 87,
        fit_reason: 'encaja',
        audio_url: null,
        duration_s: 10,
        scenes,
        requirements: 'tripié',
        alternative: 'plano cenital',
      },
    })

    const encimadas = [
      { from_s: 0, to_s: 6, shot: 'a', action: 'b', on_screen_text: null, vo: null },
      { from_s: 3, to_s: 9, shot: 'c', action: 'd', on_screen_text: null, vo: null },
    ]
    const seExcede = [
      { from_s: 0, to_s: 30, shot: 'a', action: 'b', on_screen_text: null, vo: null },
    ]

    expect(contractFor('guionista').output.safeParse(build(encimadas)).success).toBe(false)
    expect(contractFor('guionista').output.safeParse(build(seExcede)).success).toBe(false)
  })

  it('rechaza una revisión de marca que no bloquea con una crítica incumplida', () => {
    const bad = {
      kind: 'resultado',
      data: {
        piece_id: '00000000-0000-4000-8000-000000000001',
        verdicts: [
          {
            rule_id: '00000000-0000-4000-8000-000000000002',
            rule: 'Nunca llamarle antro al lugar.',
            severity: 'critica',
            checked_by: 'codigo',
            verdict: 'no_cumple',
            detail: 'Aparece "antro".',
            suggested_fix: null,
          },
        ],
        blocking: false,
      },
    }
    expect(contractFor('editor_marca').output.safeParse(bad).success).toBe(false)
  })

  it('rechaza hashtags mal formados', () => {
    const bad = {
      kind: 'resultado',
      data: {
        piece_id: '00000000-0000-4000-8000-000000000001',
        hook: 'a',
        copy_in: 'b',
        copy_out: 'c',
        cta: 'd',
        hashtags: ['tower bar'],
      },
    }
    expect(contractFor('redactor').output.safeParse(bad).success).toBe(false)
  })

  it('un escalamiento sin opciones no es un escalamiento', () => {
    expect(
      escalationSchema.safeParse({
        kind: 'escalamiento',
        pregunta: '¿Confirmas?',
        opciones: [],
        severidad: 'alta',
      }).success,
    ).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/*  El mock                                                                    */
/* -------------------------------------------------------------------------- */

describe('proveedor mock', () => {
  it('produce para cada agente una salida que cumple su propio contrato', async () => {
    for (const key of AGENT_KEYS) {
      const result = await provider.complete({
        agent: key,
        input: TOWER_BAR_INPUTS[key],
        contextCard: 'Tower Bar · coctelería de autor y jazz en Tijuana',
        contextVersion: 7,
        model: null,
      })
      const parsed = contractFor(key).output.safeParse(result.output)
      expect(parsed.success, `salida inválida para ${key}`).toBe(true)
      expect(result.costCents).toBeGreaterThan(0)
    }
  })

  it('es determinista: mismo input, mismo output', async () => {
    const once = await provider.complete({
      agent: 'estratega',
      input: TOWER_BAR_INPUTS.estratega,
      contextCard: 'cc',
      contextVersion: 7,
      model: null,
    })
    const twice = await provider.complete({
      agent: 'estratega',
      input: TOWER_BAR_INPUTS.estratega,
      contextCard: 'cc',
      contextVersion: 7,
      model: null,
    })
    expect(once).toEqual(twice)
  })

  it('el editor de marca escala en vez de decidir solo cuántos hashtags quitar', async () => {
    const result = await provider.complete({
      agent: 'editor_marca',
      input: TOWER_BAR_INPUTS.editor_marca,
      contextCard: 'cc',
      contextVersion: 7,
      model: null,
    })
    const parsed = contractFor('editor_marca').output.parse(result.output)
    expect(parsed.kind).toBe('escalamiento')
    if (parsed.kind === 'escalamiento') {
      expect(parsed.pregunta).toContain('6 hashtags')
      expect(parsed.opciones).toHaveLength(3)
    }
  })

  it('con los hashtags correctos entrega verdicto en vez de escalar', async () => {
    const input = TOWER_BAR_INPUTS.editor_marca
    const result = await provider.complete({
      agent: 'editor_marca',
      input: {
        ...input,
        piece: { ...input.piece, hashtags: input.piece.hashtags.slice(0, 5) },
      },
      contextCard: 'cc',
      contextVersion: 7,
      model: null,
    })
    const parsed = contractFor('editor_marca').output.parse(result.output)
    expect(parsed.kind).toBe('resultado')
  })
})

/* -------------------------------------------------------------------------- */
/*  Cuenta · la segunda tarea: responder un WhatsApp                           */
/* -------------------------------------------------------------------------- */

describe('cuenta · respuesta de WhatsApp', () => {
  const whatsappInput = {
    task: 'whatsapp_respuesta',
    client_id: '00000000-0000-4000-8000-0000000000cc',
    month: '2026-09',
    context_version: 7,
    client_name: 'Tower Bar',
    incoming: { body: '¿ya quedó el reel de la noche de jazz?', has_media: false },
    history: [
      { direction: 'outbound', body: 'te mando la propuesta mañana' },
      { direction: 'inbound', body: '¿ya quedó el reel de la noche de jazz?' },
    ],
    pending_approvals: 2,
  }

  it('el contrato distingue las dos tareas por su discriminante', () => {
    expect(contractFor('cuenta').input.safeParse(whatsappInput).success).toBe(true)
    // Sin `task`, la unión discriminada ya no sabe qué variante validar.
    const { task: _task, ...sinTask } = TOWER_BAR_INPUTS.cuenta
    expect(contractFor('cuenta').input.safeParse(sinTask).success).toBe(false)
  })

  it('el mock redacta un borrador que exige aprobación', async () => {
    const parsed = contractFor('cuenta').input.safeParse(whatsappInput)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return

    const result = await provider.complete({
      agent: 'cuenta',
      input: parsed.data,
      contextCard: 'cc',
      contextVersion: 7,
      model: null,
    })
    const salida = contractFor('cuenta').output.parse(result.output)

    expect(salida.kind).toBe('resultado')
    if (salida.kind === 'resultado' && salida.data.task === 'whatsapp_respuesta') {
      expect(salida.data.reply.length).toBeGreaterThan(0)
      // Nunca sale sin que una persona lo apruebe: es `true` literal en el schema.
      expect(salida.data.send_requires_approval).toBe(true)
    }
  })
})

/* -------------------------------------------------------------------------- */
/*  El runner                                                                  */
/* -------------------------------------------------------------------------- */

const policy: AgentPolicy = { enabled: true, monthlyCapCents: 500, model: null }

function makeStore(overrides: Partial<AgentStore> = {}) {
  const runs: AgentRunRecord[] = []
  const escalations: EscalationRecord[] = []
  const alerts: BudgetAlertRecord[] = []
  const store: AgentStore = {
    loadPolicy: async () => policy,
    spendThisMonthCents: async () => 0,
    recordRun: async (run) => {
      runs.push(run)
      return `run-${runs.length}`
    },
    recordEscalation: async (escalation) => {
      escalations.push(escalation)
    },
    recordBudgetAlert: async (alert) => {
      alerts.push(alert)
    },
    ...overrides,
  }
  return { store, runs, escalations, alerts }
}

function makeCtx(store: AgentStore): RunContext {
  return {
    orgId: '00000000-0000-4000-8000-0000000000aa',
    clientId: '00000000-0000-4000-8000-0000000000bb',
    contextCard: 'Tower Bar · coctelería de autor y jazz en Tijuana',
    contextVersion: 7,
    trigger: 'manual',
    triggeredBy: null,
    provider,
    store,
    clock,
    configuredProvider: 'mock',
  }
}

describe('runAgent', () => {
  it('corre, valida y deja la corrida en la bitácora', async () => {
    const { store, runs } = makeStore()
    const result = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, makeCtx(store))

    expect(result.ok).toBe(true)
    expect(runs).toHaveLength(1)
    expect(runs.at(0)?.status).toBe('ok')
    expect(runs.at(0)?.contextVersion).toBe(7)
    expect(runs.at(0)?.costCents).toBeGreaterThan(0)
  })

  it('no llama al proveedor si ya se gastó el tope del mes', async () => {
    const spy = vi.spyOn(provider, 'complete')
    const { store, runs } = makeStore({ spendThisMonthCents: async () => 500 })
    const result = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, makeCtx(store))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('presupuesto_agotado')
    expect(spy).not.toHaveBeenCalled()
    expect(runs).toHaveLength(0)
    spy.mockRestore()
  })

  it('no llama al proveedor con una entrada que no cumple el contrato', async () => {
    const spy = vi.spyOn(provider, 'complete')
    const { store } = makeStore()
    const bad = { ...TOWER_BAR_INPUTS.auditor, accounts: [] }
    const result = await runAgent('auditor', bad, makeCtx(store))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('entrada_invalida')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('trata una salida fuera de contrato como error, y aun así la registra', async () => {
    const { store, runs } = makeStore()
    const roto: RunContext = {
      ...makeCtx(store),
      provider: {
        name: 'mock',
        complete: async () => ({
          output: { kind: 'resultado', data: { month: 'ayer' } },
          model: 'mock-1',
          inputTokens: 10,
          outputTokens: 10,
          costCents: 3,
        }),
      },
    }
    const result = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, roto)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('salida_invalida')
    // El proveedor cobra aunque la salida venga mal: eso tiene que verse.
    expect(runs.at(0)?.status).toBe('error')
    expect(runs.at(0)?.costCents).toBe(3)
  })

  it('un escalamiento es corrida exitosa y además entra a la bandeja', async () => {
    const { store, runs, escalations } = makeStore()
    const result = await runAgent('editor_marca', TOWER_BAR_INPUTS.editor_marca, makeCtx(store))

    expect(result.ok).toBe(true)
    expect(runs.at(0)?.status).toBe('ok')
    expect(escalations).toHaveLength(1)
    expect(escalations.at(0)?.agent).toBe('editor_marca')
    expect(escalations.at(0)?.options).toHaveLength(3)
  })

  it('registra el aviso de presupuesto y escala cuando la corrida cruza el 80%', async () => {
    // 399¢ de un tope de 500¢ = 79.8%; el costo de esta corrida lo empuja al 80%.
    const { store, alerts, escalations } = makeStore({ spendThisMonthCents: async () => 399 })
    const result = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, makeCtx(store))

    expect(result.ok).toBe(true)
    // El log inmutable queda con el gasto ya cruzado y el tope contra el que se midió.
    expect(alerts).toHaveLength(1)
    expect(alerts.at(0)?.agent).toBe('estratega')
    expect(alerts.at(0)?.capCents).toBe(500)
    expect(alerts.at(0)?.spentCents).toBeGreaterThanOrEqual(400)
    // Y el cruce entra a la Bandeja como escalamiento.
    expect(escalations.some((e) => e.question.includes('tope de gasto'))).toBe(true)
  })

  it('no registra aviso de presupuesto si la corrida no cruza el 80%', async () => {
    // Gasto previo 0 y un costo chico: no se acerca al tope.
    const { store, alerts } = makeStore()
    const result = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, makeCtx(store))

    expect(result.ok).toBe(true)
    expect(alerts).toHaveLength(0)
  })

  it('se niega a usar un proveedor distinto al configurado', async () => {
    const { store } = makeStore()
    const ctx: RunContext = { ...makeCtx(store), configuredProvider: 'anthropic' }
    const result = await runAgent('auditor', TOWER_BAR_INPUTS.auditor, ctx)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('proveedor_no_permitido')
  })

  it('no corre un agente apagado para el cliente', async () => {
    const { store } = makeStore({
      loadPolicy: async () => ({ enabled: false, monthlyCapCents: 500, model: null }),
    })
    const result = await runAgent('cuenta', TOWER_BAR_INPUTS.cuenta, makeCtx(store))

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('agente_apagado')
  })

  it('con omitirInterruptor corre aunque esté apagado, pero NO se salta el tope', async () => {
    // "Preparar el mes" salta el interruptor de encendido — y solo ese.
    const apagado = makeStore({
      loadPolicy: async () => ({ enabled: false, monthlyCapCents: 500, model: null }),
    })
    const corre = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, {
      ...makeCtx(apagado.store),
      omitirInterruptor: true,
    })
    expect(corre.ok).toBe(true)

    // El mismo bypass no puede pasar por encima del presupuesto: sigue vivo.
    const sinSaldo = makeStore({
      loadPolicy: async () => ({ enabled: false, monthlyCapCents: 500, model: null }),
      spendThisMonthCents: async () => 500,
    })
    const frenado = await runAgent('estratega', TOWER_BAR_INPUTS.estratega, {
      ...makeCtx(sinSaldo.store),
      omitirInterruptor: true,
    })
    expect(frenado.ok).toBe(false)
    if (!frenado.ok) expect(frenado.error.code).toBe('presupuesto_agotado')
  })
})

/* Tipos: pedirle al agente X la salida del agente Y no debe compilar. */
function _tiposCruzados(key: AgentKey) {
  const contract = contractFor(key)
  // @ts-expect-error — el contrato del redactor no acepta la salida del pautero.
  const _mal: ReturnType<typeof AGENTS.redactor.output.parse> = AGENTS.pautero.output.parse({})
  return contract
}
