import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { correrEstratega, correrRedactor } from '@/agents/correr'
import { clasificarPiezas } from '@/domain/preparar-mes'
import type { Database } from '@/lib/supabase/database.types'
import type { MonthKey } from '@/lib/time'

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
 * ALCANCE HOY: la cadena es Estratega → Redactor → Editor de marca. El
 * Estratega ya corre (arma el plan en `volume_plans`) y el Redactor también
 * (escribe el copy que falta). El Editor de marca dictamina y todavía no tiene
 * compositor; cuando llegue su etapa se suma aquí como un paso más del mismo
 * lote, después del Redactor.
 */

export interface ErrorDePieza {
  pieceId: string
  code: string
  message: string
}

/** Cómo le fue al Estratega, el primer paso de la cadena. */
export interface ResumenEstratega {
  estado: 'plan' | 'escalado' | 'error'
  /** Total de piezas del plan cuando salió bien; el mensaje cuando no. */
  detalle: string
}

export interface ResumenPrepararMes {
  /** El paso del Estratega: arma el plan del mes antes de que el Redactor escriba. */
  estratega: ResumenEstratega
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
  // Paso 1 de la cadena: el Estratega arma el plan del mes. Que escale o falle
  // (p. ej. sin capacidad declarada) NO detiene al Redactor — se reporta y se
  // sigue. El copy que falta se puede escribir aunque el plan no se haya armado.
  const est = await correrEstratega(
    admin,
    entrada.clientId,
    entrada.month as MonthKey,
    entrada.userId,
    {
      omitirInterruptor: true,
    },
  )
  const estratega: ResumenEstratega = est.ok
    ? est.tipo === 'plan'
      ? { estado: 'plan', detalle: `${est.total} piezas` }
      : { estado: 'escalado', detalle: est.pregunta }
    : { estado: 'error', detalle: est.message }

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
    estratega,
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
