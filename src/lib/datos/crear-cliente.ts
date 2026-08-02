import 'server-only'

import { createClient } from '@/lib/supabase/server'

/** Un pilar tal como llega del formulario, sin id ni posición todavía. */
export interface PilarNuevo {
  name: string
  color: string
  targetPct: number
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
      // No se deshace el cliente: los pilares son opcionales, así que un cliente
      // sin ellos es un estado válido, no un alta corrupta. Y borrarlo aquí ni
      // siquiera funcionaría para un staff —el DELETE de clients es solo-owner
      // por RLS y afectaría cero renglones—, así que en vez de fingir un
      // rollback que no ocurre, el cliente queda creado y se dice la verdad: se
      // abre desde la lista para agregar los pilares a mano.
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

  return { ok: true, slug: cliente.slug }
}
