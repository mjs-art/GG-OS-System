import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { correrRedactor } from '@/agents/correr'
import { clasificarPiezas } from '@/domain/preparar-mes'
import type { Database } from '@/lib/supabase/database.types'

/**
 * "Preparar el mes": correr la cadena de agentes sobre un cliente y un mes de un
 * solo disparo, para que Ana llegue a revisar un mes armado en vez de dispararlo
 * pieza por pieza.
 *
 * Dos cosas que este archivo trata como sagradas:
 *
 *   1. **No pisar trabajo humano.** El Redactor solo corre sobre piezas que
 *      siguen en `idea` y todavía no tienen hook (lo decide `clasificarPiezas`
 *      en `@/domain/preparar-mes`). Una pieza ya escrita —o editada por una
 *      persona— no se vuelve a tocar.
 *   2. **El tope de gasto manda.** Corre con `omitirInterruptor` (la cadena va
 *      aunque el agente esté apagado), pero el presupuesto sigue vivo: en cuanto
 *      un agente toca su tope, el lote se detiene y lo reporta. Un botón no
 *      puede gastar sin límite.
 *
 * ALCANCE HOY: de los tres agentes de la cadena (Estratega → Redactor → Editor
 * de marca), solo el Redactor tiene compositor y tabla destino. El Estratega
 * escribe a `volume_plans` y el Editor de marca dictamina — sus secciones son
 * etapas aparte del roadmap. Cuando lleguen, se suman aquí como pasos más del
 * mismo lote. Mientras tanto, preparar el mes = escribir el copy que falta.
 */

export interface ErrorDePieza {
  pieceId: string
  code: string
  message: string
}

export interface ResumenPrepararMes {
  /** Cuántas piezas se consideraron candidatas al empezar. */
  candidatas: number
  escritas: number
  escaladas: number
  yaTrabajadas: number
  sinInsumos: number
  /** El lote se detuvo porque un agente tocó su tope de gasto. */
  presupuestoAgotado: boolean
  errores: ErrorDePieza[]
}

/**
 * Corre el Redactor sobre todo lo escribible del mes.
 *
 * El `admin` (service_role) entra por parámetro: la ruta ya verificó ANTES, con
 * el cliente de sesión, que quien dispara es del estudio del cliente. Aquí no se
 * vuelve a autorizar; se ejecuta.
 */
export async function prepararMes(
  admin: SupabaseClient<Database>,
  entrada: { clientId: string; month: string; userId: string },
): Promise<ResumenPrepararMes> {
  const { data, error } = await admin
    .from('pieces')
    .select('id, status, hook, idea, pillar_id, platforms')
    .eq('client_id', entrada.clientId)
    .eq('month', entrada.month)
    .order('slot_index', { ascending: true })

  if (error) {
    throw new Error(`No se pudieron leer las piezas del mes: ${error.message}`)
  }

  const { candidatas, yaTrabajadas, sinInsumos } = clasificarPiezas(
    (data ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      hook: p.hook,
      idea: p.idea,
      pillarId: p.pillar_id,
      platforms: p.platforms ?? [],
    })),
  )

  const resumen: ResumenPrepararMes = {
    candidatas: candidatas.length,
    escritas: 0,
    escaladas: 0,
    yaTrabajadas,
    sinInsumos: sinInsumos.length,
    presupuestoAgotado: false,
    errores: [],
  }

  for (const pieza of candidatas) {
    const r = await correrRedactor(admin, pieza.id, entrada.userId, { omitirInterruptor: true })

    if (r.ok) {
      if (r.tipo === 'escrito') resumen.escritas += 1
      else resumen.escaladas += 1
      continue
    }

    // El tope ya se alcanzó: las que faltan fallarían igual. Se corta el lote y
    // se reporta, en vez de martillar el mismo error pieza por pieza.
    if (r.code === 'presupuesto_agotado') {
      resumen.presupuestoAgotado = true
      break
    }

    resumen.errores.push({ pieceId: pieza.id, code: r.code, message: r.message })
  }

  return resumen
}
