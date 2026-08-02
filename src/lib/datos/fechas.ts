import 'server-only'

import { fechaLocal } from '@/domain/calendario'
import type { PieceFormat, PieceStatus } from '@/domain/labels'
import { type KeyDateKind, rangoDeMeses } from '@/domain/tendencias'
import { createClient } from '@/lib/supabase/server'
import type { MonthKey } from '@/lib/time'

/**
 * Fechas clave y promociones del cliente, con lo que ya cuelga de cada una.
 *
 * Las piezas y el presupuesto no se guardan en `key_dates`: se derivan al leer.
 * Una columna `tiene_contenido` se desincronizaría en cuanto alguien mueva una
 * pieza de día, y el punto lleno de la tarjeta estaría mintiendo sin que nada
 * truene.
 */

export interface PiezaDeFecha {
  id: string
  titulo: string
  formato: PieceFormat
  estado: PieceStatus
}

export interface CampanaDeFecha {
  id: string
  nombre: string
  presupuestoCents: number
  ejercidoCents: number
}

export interface FechaClave {
  id: string
  /** `AAAA-MM-DD`. */
  fecha: string
  titulo: string
  tipo: KeyDateKind
  notas: string | null
  ideaCampana: string | null
  /** Lo declara la persona al capturar la fecha: "esta lleva pauta". */
  llevaPresupuesto: boolean
  piezas: PiezaDeFecha[]
  /** Las campañas de pauta cuyo periodo cubre la fecha. */
  campanas: CampanaDeFecha[]
}

/** Cuántos meses muestra el timeline. Seis caben en pantalla con scroll corto. */
export const MESES_DEL_TIMELINE = 6

export async function listarFechasClave(
  clientId: string,
  mesInicial: MonthKey,
  cantidadMeses: number = MESES_DEL_TIMELINE,
): Promise<FechaClave[]> {
  const supabase = await createClient()
  const { desde, hasta } = rangoDeMeses(mesInicial, cantidadMeses)

  const [fechasRes, piezasRes, campanasRes] = await Promise.all([
    supabase
      .from('key_dates')
      .select('id, date, title, kind, notes, campaign_idea, has_budget')
      .eq('client_id', clientId)
      .gte('date', desde)
      .lte('date', hasta)
      .order('date'),
    supabase
      .from('pieces')
      .select('id, format, status, hook, idea, publish_at')
      .eq('client_id', clientId)
      .not('publish_at', 'is', null)
      // El rango va con un día de holgura de cada lado: `publish_at` es
      // timestamptz y una pieza de las 8 de la noche del 31 se guarda como el
      // 1 en UTC. El día exacto se resuelve abajo, en la zona del estudio.
      .gte('publish_at', `${desde}T00:00:00-08:00`)
      .lte('publish_at', `${hasta}T23:59:59-07:00`),
    supabase
      .from('campaigns')
      .select('id, name, budget_cents, spent_cents, start_date, end_date')
      .eq('client_id', clientId)
      .lte('start_date', hasta)
      .gte('end_date', desde),
  ])

  const primerError = fechasRes.error ?? piezasRes.error ?? campanasRes.error
  if (primerError) {
    throw new Error(`No se pudieron leer las fechas clave: ${primerError.message}`)
  }

  const piezasPorDia = new Map<string, PiezaDeFecha[]>()
  for (const p of piezasRes.data ?? []) {
    if (!p.publish_at) continue
    const dia = fechaLocal(new Date(p.publish_at))
    const lista = piezasPorDia.get(dia) ?? []
    lista.push({
      id: p.id,
      titulo: p.hook ?? p.idea ?? 'Sin hook todavía',
      formato: p.format,
      estado: p.status,
    })
    piezasPorDia.set(dia, lista)
  }

  const campanas = campanasRes.data ?? []

  return (fechasRes.data ?? []).map((f) => ({
    id: f.id,
    fecha: f.date,
    titulo: f.title,
    tipo: f.kind,
    notas: f.notes,
    ideaCampana: f.campaign_idea,
    llevaPresupuesto: f.has_budget,
    piezas: piezasPorDia.get(f.date) ?? [],
    campanas: campanas
      .filter((c) => c.start_date <= f.date && c.end_date >= f.date)
      .map((c) => ({
        id: c.id,
        nombre: c.name,
        presupuestoCents: c.budget_cents,
        ejercidoCents: c.spent_cents,
      })),
  }))
}
