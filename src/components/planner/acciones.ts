'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Las mutaciones del Planner.
 *
 * Todo lo que escribe pasa por aquí y nada por el navegador. Tres cosas que no
 * son negociables en este archivo:
 *
 *   · Zod en el límite. Un tipo de TypeScript no valida nada en runtime, y lo
 *     que llega a un Server Action es lo que el navegador quiso mandar.
 *   · Nunca lanza. Devuelve `{ ok: false, mensaje }` para que la interfaz
 *     pueda REVERTIR el cambio optimista y decir qué pasó. Una excepción sin
 *     atrapar deja el grid mostrando un estado que la base nunca aceptó, y ese
 *     es el peor resultado posible: se ve bien y está mal.
 *   · Los movimientos van por funciones de Postgres, no por varios UPDATE
 *     sueltos. Ver `supabase/migrations/20260803000010_swap_slots.sql`.
 *
 * Nota sobre el archivo: un módulo con `'use server'` solo puede exportar
 * funciones asíncronas. Los tipos que la interfaz necesita viven en `tipos.ts`,
 * que no lleva directiva — la misma razón por la que `domain/secciones.ts`
 * existe aparte del componente de navegación.
 */

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string }

const uuid = z.uuid()
const slug = z.string().min(1).max(120)

/** Lo que la base contesta cuando algo sale mal, ya escrito para una persona. */
function fallo(error: { message?: string } | null, respaldo: string): ResultadoAccion {
  const mensaje = error?.message?.trim()
  return { ok: false, mensaje: mensaje && mensaje.length > 0 ? mensaje : respaldo }
}

/** Un error de forma es un bug nuestro, no del usuario. Se dice sin culparlo. */
const DATOS_INVALIDOS =
  'El cambio no se pudo mandar completo. Recarga el planner e inténtalo otra vez.'

function refrescar(cliente: string) {
  revalidatePath(`/cliente/${cliente}`)
}

/* --- Mover piezas ---------------------------------------------------------- */

const entradaIntercambio = z.object({ slug, aId: uuid, bId: uuid })

/**
 * Modo "intercambiar": A y B cambian de fecha y nadie más se mueve.
 *
 * Las dos actualizaciones van en una transacción de Postgres. Con dos UPDATE
 * desde aquí, un fallo entre uno y otro dejaría dos piezas el mismo día.
 */
export async function intercambiarFechas(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaIntercambio.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const supabase = await createClient()
  const { error } = await supabase.rpc('swap_piece_slots', {
    a: parsed.data.aId,
    b: parsed.data.bId,
  })

  if (error) return fallo(error, 'No se pudo intercambiar la fecha de las dos piezas.')

  refrescar(parsed.data.slug)
  return { ok: true }
}

const entradaReacomodo = z.object({
  slug,
  clientId: uuid,
  cambios: z
    .array(
      z.object({
        id: uuid,
        publishAt: z.string().nullable(),
        slotIndex: z.number().int(),
      }),
    )
    .min(1)
    // Un reacomodo que toca el mes entero es señal de un cálculo mal hecho, no
    // de un arrastre. El tope evita convertir un bug en un UPDATE masivo.
    .max(400),
})

/** Modo "insertar y correr": aplica de un jalón los slots que calculó el dominio. */
export async function reacomodarSlots(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaReacomodo.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const supabase = await createClient()
  const { error } = await supabase.rpc('shift_piece_slots', {
    target_client: parsed.data.clientId,
    moves: parsed.data.cambios.map((c) => ({
      id: c.id,
      publish_at: c.publishAt,
      slot_index: c.slotIndex,
    })),
  })

  if (error) return fallo(error, 'No se pudo recorrer el calendario del mes.')

  refrescar(parsed.data.slug)
  return { ok: true }
}

/* --- Editar una pieza ------------------------------------------------------ */

const CAMPOS_DE_TEXTO = ['idea', 'hook', 'script', 'copy_in', 'copy_out', 'cta'] as const

const entradaEdicion = z.object({
  slug,
  pieceId: uuid,
  cambio: z.discriminatedUnion('campo', [
    // Los campos de copy pasan por la función de Postgres: el cambio, la
    // limpieza de la procedencia y el renglón de human_edits viajan juntos.
    z.object({
      campo: z.enum(CAMPOS_DE_TEXTO),
      valor: z.string().max(20_000).nullable(),
    }),
    z.object({
      campo: z.literal('hashtags'),
      valor: z.array(z.string().min(1).max(80)).max(30),
    }),
    // Lo demás no es texto de agente: es estado de trabajo, y se escribe
    // directo con RLS de por medio.
    z.object({
      campo: z.literal('status'),
      valor: z.enum(['idea', 'escrito', 'revisado', 'con_cliente', 'aprobado', 'publicado']),
    }),
    z.object({ campo: z.literal('format'), valor: z.enum(['post', 'carrusel', 'reel']) }),
    z.object({ campo: z.literal('pillar_id'), valor: uuid.nullable() }),
    z.object({
      campo: z.literal('platforms'),
      valor: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'linkedin'])).max(4),
    }),
    z.object({
      campo: z.literal('fecha'),
      valor: z.string().datetime({ offset: true }).nullable(),
      dateLocked: z.boolean(),
    }),
    z.object({ campo: z.literal('asset_status'), valor: z.enum(['pendiente', 'recibido']) }),
    z.object({ campo: z.literal('boosted'), valor: z.boolean() }),
  ]),
})

export async function editarPieza(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaEdicion.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { pieceId, cambio } = parsed.data
  const supabase = await createClient()

  // Los argumentos van con cadena y arreglo vacíos en vez de null: el generador
  // de tipos de Supabase no sabe que los parámetros de la función aceptan null,
  // y la función ya trata '' como "sin valor" (`nullif`). Mandar '' evita un
  // cast a mano en cada llamada, que es donde se cuela el error.
  if (cambio.campo === 'hashtags') {
    const { error } = await supabase.rpc('edit_piece_field', {
      p_piece: pieceId,
      p_field: 'hashtags',
      p_value: '',
      p_tags: cambio.valor,
    })
    if (error) return fallo(error, 'No se pudieron guardar los hashtags.')
    refrescar(parsed.data.slug)
    return { ok: true }
  }

  if ((CAMPOS_DE_TEXTO as readonly string[]).includes(cambio.campo)) {
    const { error } = await supabase.rpc('edit_piece_field', {
      p_piece: pieceId,
      p_field: cambio.campo,
      p_value: (cambio.valor as string | null) ?? '',
      p_tags: [],
    })
    if (error) return fallo(error, 'No se pudo guardar el cambio.')
    refrescar(parsed.data.slug)
    return { ok: true }
  }

  const parche =
    cambio.campo === 'fecha'
      ? { publish_at: cambio.valor, date_locked: cambio.dateLocked }
      : { [cambio.campo]: cambio.valor }

  const { error, count } = await supabase
    .from('pieces')
    .update(parche, { count: 'exact' })
    .eq('id', pieceId)

  if (error) return fallo(error, 'No se pudo guardar el cambio.')

  // Un UPDATE que RLS filtra no lanza error: afecta cero renglones y regresa en
  // silencio. Sin este conteo, la interfaz diría "guardado" sin haber guardado.
  if (count === 0) {
    return {
      ok: false,
      mensaje: 'Esta pieza ya no está en tu cuenta o alguien la borró. Recarga el planner.',
    }
  }

  refrescar(parsed.data.slug)
  return { ok: true }
}
