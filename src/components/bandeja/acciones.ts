'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Resolver un escalamiento es la única escritura de toda la Bandeja.
 *
 * `agent_runs` no se toca desde aquí ni desde ningún lado del navegador: la
 * bitácora la escribe el runner con service_role. Lo que sí es una acción
 * humana es contestarle al agente, y eso deja nombre y hora en la misma tabla.
 */

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string }

const resolverSchema = z
  .object({
    escalamientoId: z.uuid('El escalamiento no se identificó bien. Recarga la bandeja.'),
    /** La etiqueta del botón que se apretó. `null` si solo se escribió texto. */
    opcion: z.string().trim().min(1).max(200).nullish(),
    respuesta: z.string().trim().max(2000).nullish(),
  })
  .refine((valor) => Boolean(valor.opcion) || Boolean(valor.respuesta), {
    // Un escalamiento resuelto sin decir qué se decidió no le sirve a nadie
    // dentro de tres semanas, que es cuando se pregunta por qué se hizo así.
    message: 'Elige una opción o escríbele al agente qué hacer.',
  })

export async function resolverEscalamiento(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = resolverSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que mandaste.' }
  }

  const { escalamientoId, opcion, respuesta } = parsed.data
  const resolucion = [opcion, respuesta].filter(Boolean).join(' — ')

  const supabase = await createClient()

  // getUser() y no getSession(): la sesión sale de la cookie y la cookie la
  // manda el cliente. Aquí se está firmando quién decidió.
  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y sigue donde ibas.' }
  }

  const { data, error } = await supabase
    .from('escalations')
    .update({
      resolved_at: systemClock.now().toISOString(),
      resolved_by: user.id,
      resolution: resolucion,
    })
    .eq('id', escalamientoId)
    // Un escalamiento ya resuelto no se vuelve a resolver: dos pestañas
    // abiertas no deben pisarse la respuesta.
    .is('resolved_at', null)
    .select('id')

  if (error) {
    return { ok: false, mensaje: `No se pudo guardar tu respuesta: ${error.message}` }
  }

  // Un UPDATE que RLS filtró no truena: afecta cero renglones y regresa en
  // silencio. Sin revisar el conteo, la tarjeta desaparecería de la pantalla
  // sin que nada se hubiera guardado.
  if (!data || data.length === 0) {
    return {
      ok: false,
      mensaje: 'Ese escalamiento ya lo resolvió alguien más, o ya no tienes acceso al cliente.',
    }
  }

  // La bandeja vive en la raíz y el contador de pendientes vive en el layout,
  // así que se invalida el layout completo y no solo la página.
  revalidatePath('/', 'layout')

  return { ok: true }
}

const loteSchema = z
  .object({
    ids: z
      .array(z.uuid())
      .min(1, 'No hay escalamientos que resolver.')
      // El tope evita que un bug de selección mande un UPDATE gigante; ningún
      // lote real de una sola pregunta llega a esto.
      .max(200, 'Son demasiados de una vez. Resuélvelos en dos tandas.'),
    opcion: z.string().trim().min(1).max(200).nullish(),
    respuesta: z.string().trim().max(2000).nullish(),
  })
  .refine((valor) => Boolean(valor.opcion) || Boolean(valor.respuesta), {
    message: 'Elige una opción o escríbele al agente qué hacer.',
  })

export type ResultadoLote = { ok: true; resueltos: number } | { ok: false; mensaje: string }

/**
 * Resolver de un golpe todos los escalamientos que hacen la misma pregunta.
 *
 * La decisión es una, pero **el rastro no se colapsa**: cada renglón guarda su
 * propio `resolved_by`, su `resolved_at` y su `resolution`. Que Ana lo haya
 * decidido en un clic no borra que fueron veinte piezas las que se movieron —
 * eso sigue estando pieza por pieza en la bitácora, que es lo que se audita.
 *
 * El `.is('resolved_at', null)` cubre la carrera de dos pestañas: lo que otra
 * ya cerró no se vuelve a tocar, y el conteo devuelto dice cuántos de verdad se
 * movieron, no cuántos se pidieron.
 */
export async function resolverEscalamientosEnLote(entrada: unknown): Promise<ResultadoLote> {
  const parsed = loteSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que mandaste.' }
  }

  const { ids, opcion, respuesta } = parsed.data
  const resolucion = [opcion, respuesta].filter(Boolean).join(' — ')

  const supabase = await createClient()

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser()

  if (errorUsuario || !user) {
    return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y sigue donde ibas.' }
  }

  const { data, error } = await supabase
    .from('escalations')
    .update({
      resolved_at: systemClock.now().toISOString(),
      resolved_by: user.id,
      resolution: resolucion,
    })
    .in('id', ids)
    .is('resolved_at', null)
    .select('id')

  if (error) {
    return { ok: false, mensaje: `No se pudo guardar la respuesta: ${error.message}` }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      mensaje: 'Esos escalamientos ya los resolvió alguien más, o ya no tienes acceso al cliente.',
    }
  }

  revalidatePath('/', 'layout')

  return { ok: true, resueltos: data.length }
}
