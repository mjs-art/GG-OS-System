import 'server-only'

import { createClient } from '@/lib/supabase/server'

export interface PilarNuevo {
  name: string
  color: string
  targetPct: number
}

export interface DatosDeMarcaAlCrear {
  queEs: string | null
  posicionamiento: string | null
  diferenciadores: string[]
  audiencia: string | null
  tono: string[]
  palabrasProhibidas: string[]
  cadencia: string | null
}

export interface NuevoCliente {
  orgId: string
  slug: string
  name: string
  handle: string | null
  tier: string | null
  brandColor: string | null
  timezone: string
  pilares: PilarNuevo[]
  datosDeMarca?: DatosDeMarcaAlCrear | null
}

export type ResultadoAlta =
  | { ok: true; slug: string }
  // `clienteCreado` distingue "no se creó nada" de "se creó el cliente pero no
  // sus pilares": en el segundo caso el cliente ya está en la lista.
  | { ok: false; mensaje: string; clienteCreado?: boolean; slug?: string }

/** Código de Postgres para violación de UNIQUE, tal como lo pasa supabase-js. */
const UNIQUE_VIOLATION = '23505'

/**
 * Da de alta un cliente y sus pilares.
 *
 * Las ocho `agent_policies` NO se escriben aquí: las siembra el trigger
 * `clients_seed_agent_policies` al insertar el cliente (migración 0012). Es a
 * propósito — insertarlas desde la sesión fallaría para un staff, porque RLS
 * solo deja configurar agentes al owner.
 *
 * No hay transacción: la API REST de Supabase no cruza una sobre dos peticiones.
 * Se consigue atomicidad como en el importador: si los pilares fallan después
 * de crear el cliente, se borra el cliente (y por cascade sus policies recién
 * sembradas), de modo que un alta a medias no queda en la base.
 */
export async function crearCliente(entrada: NuevoCliente): Promise<ResultadoAlta> {
  const supabase = await createClient()

  const { data: cliente, error } = await supabase
    .from('clients')
    .insert({
      org_id: entrada.orgId,
      slug: entrada.slug,
      name: entrada.name,
      handle: entrada.handle,
      tier: entrada.tier,
      brand_color: entrada.brandColor,
      timezone: entrada.timezone,
    })
    .select('id, slug')
    .single()

  if (error || !cliente) {
    if (error?.code === UNIQUE_VIOLATION) {
      return {
        ok: false,
        mensaje: `Ya tienes un cliente con el identificador "${entrada.slug}". Cambia el nombre o edita el slug a mano.`,
      }
    }
    return {
      ok: false,
      mensaje: `No se pudo dar de alta el cliente${error ? `: ${error.message}` : '.'}`,
    }
  }

  if (entrada.pilares.length > 0) {
    const { error: errorPilares } = await supabase.from('pillars').insert(
      entrada.pilares.map((p, i) => ({
        org_id: entrada.orgId,
        client_id: cliente.id,
        name: p.name,
        color: p.color,
        target_pct: p.targetPct,
        position: i,
      })),
    )

    if (errorPilares) {
      const duplicado = errorPilares.code === UNIQUE_VIOLATION
      return {
        ok: false,
        clienteCreado: true,
        slug: cliente.slug,
        mensaje: duplicado
          ? `Se creó "${entrada.name}", pero dos de sus pilares tienen el mismo nombre y no se guardaron. Ábrelo desde la lista y agrégalos.`
          : `Se creó "${entrada.name}", pero sus pilares no se guardaron (${errorPilares.message}). Ábrelo desde la lista y agrégalos.`,
      }
    }
  }

  if (entrada.datosDeMarca) {
    const d = entrada.datosDeMarca
    await supabase.from('context_card_versions').insert({
      org_id: entrada.orgId,
      client_id: cliente.id,
      version: 1,
      what_it_is: d.queEs,
      positioning: d.posicionamiento,
      differentiators: d.diferenciadores,
      audience: d.audiencia,
      tone: d.tono,
      banned_words: d.palabrasProhibidas,
      cadence: d.cadencia,
    })
    // Si falla, el Context Card queda sin crear. No es crítico: se puede
    // llenar a mano en § Marca. Pero no bloqueamos el alta del cliente.
  }

  return { ok: true, slug: cliente.slug }
}
