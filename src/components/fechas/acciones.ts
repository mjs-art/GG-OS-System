'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { KEY_DATE_KINDS, proponerFechasClave, type PropuestaFechaClave } from '@/domain/tendencias'
import { createClient } from '@/lib/supabase/server'
import { isMonthKey, type MonthKey } from '@/lib/time'

/**
 * Mutaciones de la sección Fechas y promociones.
 *
 * Nada de escribir a Supabase desde el navegador: todo pasa por aquí y todo
 * pasa por Zod antes de tocar la base.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }

const uuid = z.uuid('Identificador inválido.')

/** `z.custom` para que el tipo inferido sea `MonthKey` y no `string`. */
const mesSchema = z.custom<MonthKey>((v) => typeof v === 'string' && isMonthKey(v), {
  message: 'Mes inválido: se espera el formato AAAA-MM.',
})

const nuevaFechaSchema = z.object({
  clientId: uuid,
  slug: z.string().trim().min(1),
  fecha: z.iso.date('La fecha va en formato AAAA-MM-DD.'),
  titulo: z
    .string()
    .trim()
    .min(1, 'La fecha necesita un título.')
    .max(160, 'El título se pasa de 160 caracteres.'),
  tipo: z.enum(KEY_DATE_KINDS),
  notas: z.string().trim().max(2000).nullish(),
  ideaCampana: z.string().trim().max(2000).nullish(),
  llevaPresupuesto: z.boolean().nullish(),
})

export async function agregarFechaClave(entrada: unknown): Promise<Resultado> {
  const parsed = nuevaFechaSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()

  // El org_id se deriva del cliente, nunca llega del navegador. Además hay un
  // trigger en la base que rechaza la combinación incoherente aunque alguien
  // lo intente por otra vía.
  const { data: cliente } = await supabase
    .from('clients')
    .select('org_id')
    .eq('id', datos.clientId)
    .maybeSingle()

  if (!cliente) {
    return { ok: false, mensaje: 'No encontramos ese cliente. Recarga la página y reintenta.' }
  }

  const { error } = await supabase.from('key_dates').insert({
    org_id: cliente.org_id,
    client_id: datos.clientId,
    date: datos.fecha,
    title: datos.titulo,
    kind: datos.tipo,
    notes: datos.notas ? datos.notas : null,
    campaign_idea: datos.ideaCampana ? datos.ideaCampana : null,
    has_budget: datos.llevaPresupuesto ?? false,
  })

  if (error) return { ok: false, mensaje: `No se pudo guardar la fecha: ${error.message}` }

  revalidatePath(`/cliente/${datos.slug}`)
  return { ok: true }
}

const propuestaSchema = z.object({ clientId: uuid, mes: mesSchema })

/**
 * Lo que el Estratega propone para un mes vacío.
 *
 * Devuelve propuestas y **no escribe nada**. El agente propone, la persona
 * ejecuta: cada fecha entra al calendario del cliente solo cuando alguien le da
 * "Agregar". Llenar el mes solo sería más rápido y también sería la primera vez
 * que un agente mete un compromiso al calendario sin que nadie lo lea.
 *
 * Corre contra lógica determinista, no contra un modelo: cero llamadas de red.
 */
export async function proponerCampanas(
  entrada: unknown,
): Promise<{ ok: true; propuestas: PropuestaFechaClave[] } | { ok: false; mensaje: string }> {
  const parsed = propuestaSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const supabase = await createClient()

  // Se confirma el acceso al cliente aunque la propuesta no toque la base: si
  // no puedes ver al cliente, tampoco recibes su calendario sugerido.
  const { data: cliente } = await supabase
    .from('clients')
    .select('id')
    .eq('id', parsed.data.clientId)
    .maybeSingle()

  if (!cliente) {
    return { ok: false, mensaje: 'No encontramos ese cliente. Recarga la página y reintenta.' }
  }

  return { ok: true, propuestas: proponerFechasClave(parsed.data.mes) }
}
