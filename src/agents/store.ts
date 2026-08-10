import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentKey } from '@/agents/contracts'
import type {
  AgentPolicy,
  AgentRunRecord,
  AgentStore,
  BudgetAlertRecord,
  EscalationRecord,
} from '@/agents/runner'
import type { Database, Json } from '@/lib/supabase/database.types'
import { systemClock } from '@/lib/time'

/**
 * La implementación de `AgentStore` contra Supabase.
 *
 * Recibe el cliente por parámetro —no lo importa— para que el `createAdminClient`
 * (service_role) viva en la ruta `api/jobs`, que es el único lugar donde ESLint
 * lo permite. `agent_runs` es append-only y `authenticated` no puede escribirla:
 * por eso esto corre con service_role, saltándose RLS a propósito. La
 * autorización de quién puede disparar la corrida la hace la ruta ANTES, con el
 * cliente de sesión.
 */
export function createAgentStore(admin: SupabaseClient<Database>): AgentStore {
  return {
    async loadPolicy(clientId: string | null, agent: AgentKey): Promise<AgentPolicy | null> {
      let query = admin
        .from('agent_policies')
        .select('enabled, monthly_cap_cents, model')
        .eq('agent', agent)
      // `.eq('client_id', null)` no compila a `is null` en PostgREST — hay que
      // separar la rama, igual que en `spendThisMonthCents`.
      query = clientId === null ? query.is('client_id', null) : query.eq('client_id', clientId)
      const { data, error } = await query.maybeSingle()

      if (error) throw new Error(`No se pudo leer la política del agente: ${error.message}`)
      if (!data) return null
      return { enabled: data.enabled, monthlyCapCents: data.monthly_cap_cents, model: data.model }
    },

    async spendThisMonthCents(clientId: string | null, agent: AgentKey): Promise<number> {
      // `app.agent_spend_cents_this_month` vive en el esquema `app`, que PostgREST
      // no expone, así que no se puede llamar por `.rpc()`. Se suma aquí lo mismo
      // que suma esa función: el gasto del mes en curso. El inicio de mes se
      // arma como texto (sin crear un Date fuera de @/lib/time) en UTC, igual que
      // `date_trunc('month', now())`.
      const ahora = systemClock.now()
      const y = ahora.getUTCFullYear()
      const mm = String(ahora.getUTCMonth() + 1).padStart(2, '0')
      const inicioMes = `${y}-${mm}-01T00:00:00.000Z`

      let query = admin
        .from('agent_runs')
        .select('cost_cents')
        .eq('agent', agent)
        .gte('started_at', inicioMes)
      query = clientId === null ? query.is('client_id', null) : query.eq('client_id', clientId)
      const { data, error } = await query

      if (error) throw new Error(`No se pudo leer el gasto del agente: ${error.message}`)
      return (data ?? []).reduce((suma, r) => suma + r.cost_cents, 0)
    },

    async recordRun(run: AgentRunRecord): Promise<string> {
      const { data, error } = await admin
        .from('agent_runs')
        .insert({
          org_id: run.orgId,
          client_id: run.clientId,
          agent: run.agent,
          status: run.status,
          trigger: run.trigger,
          triggered_by: run.triggeredBy,
          context_version: run.contextVersion,
          model: run.model,
          input: run.input as Json,
          output: run.output as Json,
          error: run.error,
          input_tokens: run.inputTokens,
          output_tokens: run.outputTokens,
          cost_cents: run.costCents,
          duration_ms: run.durationMs,
          started_at: run.startedAt.toISOString(),
          finished_at: run.finishedAt.toISOString(),
        })
        .select('id')
        .single()

      if (error || !data) {
        throw new Error(`No se pudo registrar la corrida: ${error?.message ?? 'sin id'}`)
      }
      return data.id
    },

    async recordEscalation(escalation: EscalationRecord): Promise<void> {
      const { error } = await admin.from('escalations').insert({
        org_id: escalation.orgId,
        client_id: escalation.clientId,
        agent: escalation.agent,
        run_id: escalation.runId,
        piece_id: escalation.pieceId,
        severity: escalation.severity,
        question: escalation.question,
        options: escalation.options as Json,
      })
      if (error) throw new Error(`No se pudo registrar el escalamiento: ${error.message}`)
    },

    async recordBudgetAlert(alert: BudgetAlertRecord): Promise<void> {
      const { error } = await admin.from('budget_alerts').insert({
        org_id: alert.orgId,
        client_id: alert.clientId,
        agent: alert.agent,
        run_id: alert.runId,
        spent_cents: alert.spentCents,
        cap_cents: alert.capCents,
        estado: alert.estado,
      })
      if (error) throw new Error(`No se pudo registrar el aviso de presupuesto: ${error.message}`)
    },
  }
}
