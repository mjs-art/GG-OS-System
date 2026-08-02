'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Mutaciones del calendario.
 *
 * Nada de escribir a Supabase desde el navegador: todo pasa por aquí y todo
 * pasa por Zod antes de tocar la base.
 */

export type Resultado = { ok: true } | { ok: false; mensaje: string }

const nuevaTareaSchema = z.object({
  clientIds: z.array(z.uuid('Identificador inválido.')).min(1, 'Elige al menos un cliente.'),
  titulo: z
    .string()
    .trim()
    .min(1, 'Escribe qué hay que hacer.')
    .max(300, 'El pendiente se pasa de 300 caracteres.'),
  fecha: z.iso.date('La fecha va en formato AAAA-MM-DD.'),
})

/**
 * Crea el mismo pendiente para uno o varios clientes a la vez, desde el día
 * del calendario en el que se hizo click.
 *
 * `org_id` se resuelve del lado del servidor para cada cliente, nunca llega
 * del navegador. El trigger `tasks_org_guard` de la base rechaza cualquier
 * combinación incoherente aunque alguien lo intente por otra vía.
 */
export async function crearTareasDelDia(entrada: unknown): Promise<Resultado> {
  const parsed = nuevaTareaSchema.safeParse(entrada)
  if (!parsed.success) {
    return { ok: false, mensaje: parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }
  const datos = parsed.data

  const supabase = await createClient()

  const { data: clientes, error: errorClientes } = await supabase
    .from('clients')
    .select('id, org_id, slug')
    .in('id', datos.clientIds)

  if (errorClientes || !clientes || clientes.length !== datos.clientIds.length) {
    return {
      ok: false,
      mensaje: 'No encontramos alguno de esos clientes. Recarga la página y reintenta.',
    }
  }

  const { error } = await supabase.from('tasks').insert(
    clientes.map((c) => ({
      org_id: c.org_id,
      client_id: c.id,
      title: datos.titulo,
      due_date: datos.fecha,
    })),
  )

  if (error) return { ok: false, mensaje: `No se pudo guardar el pendiente: ${error.message}` }

  revalidatePath('/calendario')
  for (const c of clientes) revalidatePath(`/cliente/${c.slug}`)

  return { ok: true }
}
