import { describe, expect, it, vi } from 'vitest'
import { createAgentStore } from '@/agents/store'
import type { Database } from '@/lib/supabase/database.types'

/**
 * `store.ts` sin Postgres: un doble del query builder de Supabase que solo
 * necesita encadenar métodos y resolver al final. Lo que importa probar no es
 * que Supabase funcione — es que `loadPolicy`/`spendThisMonthCents` filtran
 * con `.is('client_id', null)` cuando no hay cliente, y con `.eq()` cuando sí
 * lo hay. Un `.eq('client_id', null)` compila en TypeScript pero PostgREST lo
 * traduce a `= null`, que nunca es verdadero — el bug sería silencioso.
 */

interface Llamada {
  metodo: string
  args: unknown[]
}

type AdminDouble = Parameters<typeof createAgentStore>[0]

function crearAdminFake(resultado: { data: unknown; error: { message: string } | null }) {
  const llamadas: Llamada[] = []

  const builder = {
    from: vi.fn(() => builder),
    select: vi.fn(() => builder),
    eq: vi.fn((...args: unknown[]) => {
      llamadas.push({ metodo: 'eq', args })
      return builder
    }),
    is: vi.fn((...args: unknown[]) => {
      llamadas.push({ metodo: 'is', args })
      return builder
    }),
    gte: vi.fn((...args: unknown[]) => {
      llamadas.push({ metodo: 'gte', args })
      return builder
    }),
    maybeSingle: vi.fn(() => Promise.resolve(resultado)),
    // `spendThisMonthCents` hace `await query` directo, sin `.maybeSingle()`:
    // el builder mismo tiene que ser "thenable".
    then: (resolve: (value: typeof resultado) => void) => resolve(resultado),
  }

  return { admin: builder as unknown as AdminDouble, llamadas }
}

describe('createAgentStore — clientId nulo vs. con id', () => {
  describe('loadPolicy', () => {
    it('filtra con .is cuando no hay cliente', async () => {
      const { admin, llamadas } = crearAdminFake({
        data: { enabled: true, monthly_cap_cents: 1000, model: null },
        error: null,
      })
      const store = createAgentStore(admin)

      const policy = await store.loadPolicy(null, 'redactor')

      expect(policy).toEqual({ enabled: true, monthlyCapCents: 1000, model: null })
      expect(llamadas).toContainEqual({ metodo: 'is', args: ['client_id', null] })
      expect(llamadas.some((l) => l.metodo === 'eq' && l.args[0] === 'client_id')).toBe(false)
    })

    it('filtra con .eq cuando hay cliente', async () => {
      const { admin, llamadas } = crearAdminFake({
        data: { enabled: false, monthly_cap_cents: 500, model: null },
        error: null,
      })
      const store = createAgentStore(admin)

      await store.loadPolicy('cliente-1', 'redactor')

      expect(llamadas).toContainEqual({ metodo: 'eq', args: ['client_id', 'cliente-1'] })
      expect(llamadas.some((l) => l.metodo === 'is')).toBe(false)
    })

    it('devuelve null si no hay política', async () => {
      const { admin } = crearAdminFake({ data: null, error: null })
      const store = createAgentStore(admin)

      await expect(store.loadPolicy(null, 'redactor')).resolves.toBeNull()
    })
  })

  describe('spendThisMonthCents', () => {
    it('filtra con .is cuando no hay cliente', async () => {
      const { admin, llamadas } = crearAdminFake({
        data: [{ cost_cents: 10 }, { cost_cents: 5 }],
        error: null,
      })
      const store = createAgentStore(admin)

      const gasto = await store.spendThisMonthCents(null, 'redactor')

      expect(gasto).toBe(15)
      expect(llamadas).toContainEqual({ metodo: 'is', args: ['client_id', null] })
    })

    it('filtra con .eq cuando hay cliente', async () => {
      const { admin, llamadas } = crearAdminFake({ data: [{ cost_cents: 7 }], error: null })
      const store = createAgentStore(admin)

      const gasto = await store.spendThisMonthCents('cliente-1', 'redactor')

      expect(gasto).toBe(7)
      expect(llamadas).toContainEqual({ metodo: 'eq', args: ['client_id', 'cliente-1'] })
    })
  })

  describe('recordRun', () => {
    it('inserta client_id null tal cual, sin tronar', async () => {
      const llamadas: Llamada[] = []
      const insertBuilder = {
        select: vi.fn(() => insertBuilder),
        single: vi.fn(() => Promise.resolve({ data: { id: 'run-1' }, error: null })),
      }
      const admin = {
        from: vi.fn(() => ({
          insert: vi.fn((payload: unknown) => {
            llamadas.push({ metodo: 'insert', args: [payload] })
            return insertBuilder
          }),
        })),
      }
      const store = createAgentStore(admin as unknown as AdminDouble)

      const runId = await store.recordRun({
        orgId: 'org-1',
        clientId: null,
        agent: 'redactor',
        status: 'ok',
        trigger: 'manual',
        triggeredBy: null,
        contextVersion: null,
        model: null,
        input: {},
        output: {},
        error: null,
        inputTokens: null,
        outputTokens: null,
        costCents: 0,
        durationMs: 1,
        startedAt: new Date('2026-08-10T00:00:00Z'),
        finishedAt: new Date('2026-08-10T00:00:01Z'),
      })

      expect(runId).toBe('run-1')
      const insertPayload = llamadas[0]
        ?.args[0] as Database['public']['Tables']['agent_runs']['Insert']
      expect(insertPayload.client_id).toBeNull()
    })
  })
})
