'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  calcularFitDeMarca,
  diasEntre,
  PLATAFORMAS,
  TREND_KINDS,
  type Fit,
} from '@/domain/tendencias'
import { fechaLocal } from '@/domain/calendario'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Mutaciones de la sección Guiones.
 *
 * Todo entra por Zod: lo que manda el navegador es entrada no confiable aunque
 * el componente de al lado lo haya construido. Y ninguna de estas funciones
 * filtra por org ni por cliente a mano — de eso se encarga RLS. Lo que sí se
 * revisa es el CONTEO de renglones afectados: un UPDATE que RLS bloquea no
 * lanza error, afecta cero renglones y regresa en silencio.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }

const uuid = z.uuid('Identificador inválido.')

const nuevaTendenciaSchema = z.object({
  clientId: uuid,
  slug: z.string().trim().min(1),
  plataforma: z.enum(PLATAFORMAS),
  tipo: z.enum(TREND_KINDS),
  titulo: z
    .string()
    .trim()
    .min(1, 'La tendencia necesita un título para poder buscarla después.')
    .max(200, 'El título se pasa de 200 caracteres.'),
  // El CHECK de la base exige `^https?://` o nulo. Una cadena vacía la
  // rechazaría con un error de Postgres que no le dice nada a nadie.
  link: z.union([z.url('Ese link no se ve bien. Pega la URL completa.'), z.literal('')]).nullish(),
  momentum: z.enum(['subiendo', 'pico', 'bajando']),
  vistaEl: z.iso.date().nullish(),
  notas: z.string().trim().max(2000).nullish(),
})

export async function agregarTendencia(entrada: unknown): Promise<Resultado> {
  const parsed = nuevaTendenciaSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()

  // getUser() y no getSession(): la sesión sale de la cookie, y la cookie la
  // manda el navegador.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y reintenta.' }

  /**
   * El radar es de la ORG, no del cliente, pero se captura desde la pantalla de
   * un cliente. La org se deriva del cliente en vez de recibirla del navegador:
   * así nadie puede mandar una tendencia a otra agencia. Y aunque lo intentara,
   * la lectura de `clients` ya va filtrada por RLS y no encontraría el renglón.
   */
  const { data: cliente } = await supabase
    .from('clients')
    .select('org_id')
    .eq('id', datos.clientId)
    .maybeSingle()

  if (!cliente) {
    return { ok: false, mensaje: 'No encontramos ese cliente. Recarga la página y reintenta.' }
  }

  const link = datos.link ? datos.link : null
  const esAudio = datos.tipo === 'audio'

  const { error } = await supabase.from('trends').insert({
    org_id: cliente.org_id,
    platform: datos.plataforma,
    kind: datos.tipo,
    title: datos.titulo,
    // Un audio se guarda como audio y todo lo demás como referencia. Es la
    // diferencia entre "abre este sonido" y "mira este ejemplo".
    audio_url: esAudio ? link : null,
    reference_url: esAudio ? null : link,
    momentum: datos.momentum,
    // Mediodía y no medianoche: guardar `2026-09-05T00:00:00-07:00` y leerlo en
    // otra zona corre la fecha un día.
    ...(datos.vistaEl ? { spotted_at: `${datos.vistaEl}T12:00:00-07:00` } : {}),
    spotted_by: user.id,
    notes: datos.notas ? datos.notas : null,
  })

  if (error) {
    return { ok: false, mensaje: `No se pudo guardar la tendencia: ${error.message}` }
  }

  revalidatePath(`/cliente/${datos.slug}`)
  return { ok: true }
}

const fitSchema = z.object({
  clientId: uuid,
  titulo: z.string().trim().min(1, 'Escribe el título de la tendencia para poder calcular el fit.'),
  tipo: z.enum(TREND_KINDS),
  momentum: z.enum(['subiendo', 'pico', 'bajando']),
  vistaEl: z.iso.date().nullish(),
  notas: z.string().trim().max(2000).nullish(),
})

/**
 * El fit de marca de captura.
 *
 * Hoy lo calcula una función determinista de `@/domain/tendencias` y no un
 * modelo: es un número que ordena una tabla, y un modelo daría uno distinto
 * cada vez para la misma entrada. Vive como Server Action de todos modos
 * porque necesita los pilares del cliente —que RLS decide si puedes ver— y
 * porque el día que el Guionista lo calcule de verdad, este ya es el punto de
 * entrada y ningún componente cambia.
 */
export async function calcularFitDeTendencia(
  entrada: unknown,
): Promise<{ ok: true; fit: Fit } | { ok: false; mensaje: string }> {
  const parsed = fitSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()
  const { data: pilares, error } = await supabase
    .from('pillars')
    .select('name')
    .eq('client_id', datos.clientId)

  if (error) return { ok: false, mensaje: `No se pudo leer la marca: ${error.message}` }

  const hoy = fechaLocal(systemClock.now())
  const dias = datos.vistaEl ? Math.max(0, diasEntre(datos.vistaEl, hoy)) : 0

  return {
    ok: true,
    fit: calcularFitDeMarca(
      {
        titulo: datos.titulo,
        notas: datos.notas ?? null,
        tipo: datos.tipo,
        momentum: datos.momentum,
        dias,
      },
      (pilares ?? []).map((p) => p.name),
    ),
  }
}

const estadoGuionSchema = z.object({
  guionId: uuid,
  slug: z.string().trim().min(1),
  estado: z.enum(['propuesto', 'aceptado', 'descartado']),
})

export async function cambiarEstadoGuion(entrada: unknown): Promise<Resultado> {
  const parsed = estadoGuionSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scripts')
    .update({ status: datos.estado })
    .eq('id', datos.guionId)
    .select('id')

  if (error) return { ok: false, mensaje: `No se pudo actualizar el guion: ${error.message}` }
  if (!data?.length) {
    // Cero renglones con RLS encendido no es "no pasó nada": es "no tienes
    // acceso a ese guion". Postgres no lo distingue, así que se dice completo.
    return {
      ok: false,
      mensaje: 'Ese guion ya no existe o no es de un cliente tuyo. Recarga la página.',
    }
  }

  revalidatePath(`/cliente/${datos.slug}`)
  return { ok: true }
}

const edicionGuionSchema = z.object({
  guionId: uuid,
  slug: z.string().trim().min(1),
  duracionS: z.coerce
    .number()
    .int('La duración va en segundos enteros.')
    .min(1)
    .max(3600)
    .nullish(),
  requiere: z.string().trim().max(2000).nullish(),
  alternativa: z.string().trim().max(2000).nullish(),
})

/**
 * La edición humana de un guion que escribió el Guionista.
 *
 * Cada campo tocado se registra en `human_edits`. Esa tabla es el criterio de
 * la marca aprendido: la lista de correcciones que una persona le hace al
 * agente es lo que después permite dejar de hacérselas. Si la edición se
 * guardara pisando el campo y ya, ese aprendizaje se perdería en cada guardado.
 */
export async function editarGuion(entrada: unknown): Promise<Resultado> {
  const parsed = edicionGuionSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, mensaje: 'Se cerró tu sesión. Vuelve a entrar y reintenta.' }

  const { data: antes } = await supabase
    .from('scripts')
    .select('id, org_id, client_id, piece_id, duration_s, requirements, alternative')
    .eq('id', datos.guionId)
    .maybeSingle()

  if (!antes) {
    return {
      ok: false,
      mensaje: 'Ese guion ya no existe o no es de un cliente tuyo. Recarga la página.',
    }
  }

  const requiere = datos.requiere ? datos.requiere : null
  const alternativa = datos.alternativa ? datos.alternativa : null
  const duracion = datos.duracionS ?? null

  const { data, error } = await supabase
    .from('scripts')
    .update({
      duration_s: duracion,
      requirements: requiere,
      alternative: alternativa,
      status: 'editado',
    })
    .eq('id', datos.guionId)
    .select('id')

  if (error) return { ok: false, mensaje: `No se pudo guardar el guion: ${error.message}` }
  if (!data?.length) {
    return { ok: false, mensaje: 'No se guardó el cambio. Recarga la página y reintenta.' }
  }

  const cambios: Array<{ field: string; old_value: string | null; new_value: string | null }> = []
  if (antes.duration_s !== duracion) {
    cambios.push({
      field: 'script.duration_s',
      old_value: antes.duration_s === null ? null : String(antes.duration_s),
      new_value: duracion === null ? null : String(duracion),
    })
  }
  if (antes.requirements !== requiere) {
    cambios.push({
      field: 'script.requirements',
      old_value: antes.requirements,
      new_value: requiere,
    })
  }
  if (antes.alternative !== alternativa) {
    cambios.push({
      field: 'script.alternative',
      old_value: antes.alternative,
      new_value: alternativa,
    })
  }

  if (cambios.length > 0) {
    const { error: errorBitacora } = await supabase.from('human_edits').insert(
      cambios.map((cambio) => ({
        org_id: antes.org_id,
        client_id: antes.client_id,
        piece_id: antes.piece_id,
        agent: 'guionista' as const,
        edited_by: user.id,
        ...cambio,
      })),
    )
    // El guion ya se guardó. Perder la bitácora es malo, pero decirle a la
    // persona que su edición falló cuando sí se aplicó es peor: la repetiría.
    if (errorBitacora) {
      console.error('No se pudo registrar la edición humana del guion.', errorBitacora)
    }
  }

  revalidatePath(`/cliente/${datos.slug}`)
  return { ok: true }
}
