import 'server-only'

import { type CodeRule, normalizarParamsDeRegla } from '@/domain/brand-rules'
import { createClient } from '@/lib/supabase/server'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Lo que el Planner necesita además de las piezas y las stories.
 *
 * Igual que el resto de `lib/datos`, aquí no se filtra por cliente a mano: lo
 * hace RLS. El `client_id` que sí se manda es para acotar la consulta, no para
 * autorizar — si fuera lo único que separa a un cliente de otro, sobraría la
 * base de datos.
 */

export interface FechaClavePlanner {
  id: string
  /** `2026-09-15`. */
  date: string
  title: string
  kind: string
}

export interface DatosPlanner {
  /** Solo las reglas que se verifican por código. Las de modelo las corre el agente. */
  reglas: CodeRule[]
  fechasClave: FechaClavePlanner[]
}

export async function datosDelPlanner(clientId: string, mes: MonthKey): Promise<DatosPlanner> {
  const supabase = await createClient()

  // El mes viene como 'AAAA-MM' y key_dates guarda fechas, así que el rango se
  // arma con el primer día de este mes y el del siguiente.
  const desde = `${mes}-01`
  const hasta = `${addMonths(mes, 1)}-01`

  const [reglasRes, fechasRes] = await Promise.all([
    supabase
      .from('brand_rules')
      .select('id, rule, severity, check_by, params, active, kind')
      .eq('client_id', clientId)
      .eq('active', true),
    supabase
      .from('key_dates')
      .select('id, date, title, kind')
      .eq('client_id', clientId)
      .gte('date', desde)
      .lt('date', hasta)
      .order('date'),
  ])

  const error = reglasRes.error ?? fechasRes.error
  if (error) throw new Error(`No se pudo leer la configuración del planner: ${error.message}`)

  const reglas = (reglasRes.data ?? [])
    .filter((r) => r.check_by === 'codigo')
    .flatMap((r) => {
      const params = normalizarParamsDeRegla(r.kind, r.params)
      return params ? [{ id: r.id, rule: r.rule, severity: r.severity, params }] : []
    })

  return {
    reglas,
    fechasClave: (fechasRes.data ?? []).map((f) => ({
      id: f.id,
      date: f.date,
      title: f.title,
      kind: f.kind,
    })),
  }
}
