'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isMonthKey, systemClock } from '@/lib/time'

/**
 * Mutaciones del plan de volumen.
 *
 * Regla del proyecto que aquí se nota: **el agente propone, la persona
 * ejecuta**. Esta acción NO inventa un plan ni finge una corrida del Estratega.
 * Guarda las dos restricciones que Ana declara —cuántas piezas puede producir
 * y qué porcentaje quiere por pilar— y deja el plan listo para que el Estratega
 * corra contra ellas. Fabricar aquí un rationale sería exactamente el tipo de
 * número sin respaldo que esta sección existe para evitar.
 *
 * El `org_id` NO llega por formulario. Se lee de la base a partir del cliente:
 * un campo oculto con el org lo puede editar cualquiera con las herramientas de
 * desarrollo, y aunque RLS lo detendría, no hay razón para depender de eso.
 */

export interface EstadoVolumen {
  status: 'inicial' | 'guardado' | 'error'
  message?: string
}

const mesSchema = z.string().refine(isMonthKey, {
  message: 'Mes inválido. Se espera AAAA-MM, por ejemplo 2026-09.',
})

const recalcularSchema = z.object({
  clientId: z.uuid('Cliente inválido.'),
  mes: mesSchema,
  // El tope real de producción. Cero es válido: un mes de pausa existe.
  capacidad: z.coerce
    .number()
    .int('La capacidad va en piezas enteras.')
    .min(0)
    .max(400, 'Más de 400 piezas al mes no es una capacidad, es un error de dedo.'),
  // Se validan aunque hoy no se persistan: `volume_plans` no tiene columna de
  // notas y no puedo agregar una migración desde aquí. Van al Estratega en la
  // corrida y el modal lo dice; guardarlas dentro de `rationale` las pintaría
  // como si fueran una razón del plan, que es peor que no guardarlas.
  //
  // `nullish` y no `optional`: FormData.get() devuelve null cuando el campo no
  // viene, y el textarea vacío es el caso común.
  notas: z.string().max(2000).nullish(),
  objetivos: z.record(z.uuid(), z.number().min(0).max(100)),
})

export async function recalcularVolumen(
  _prev: EstadoVolumen,
  formData: FormData,
): Promise<EstadoVolumen> {
  // Los objetivos vienen como `objetivo:<pillar_id>` para poder tener un slider
  // por pilar sin saber de antemano cuántos son.
  const objetivos: Record<string, number> = {}
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith('objetivo:')) continue
    objetivos[clave.slice('objetivo:'.length)] = Number(valor)
  }

  const parsed = recalcularSchema.safeParse({
    clientId: formData.get('clientId'),
    mes: formData.get('mes'),
    capacidad: formData.get('capacidad'),
    notas: formData.get('notas'),
    objetivos,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Revisa los datos del recálculo.',
    }
  }

  const { clientId, mes, capacidad, objetivos: mezcla } = parsed.data

  const suma = Object.values(mezcla).reduce((a, b) => a + b, 0)
  // Un plan cuyos pilares no suman 100 le pide al Estratega algo imposible, y
  // el error se descubre hasta que la barra sale rara enfrente del cliente.
  if (Object.keys(mezcla).length > 0 && Math.abs(suma - 100) > 1) {
    return {
      status: 'error',
      message: `Los objetivos por pilar suman ${Math.round(suma)}% y tienen que sumar 100%.`,
    }
  }

  const supabase = await createClient()

  const { data: cliente, error: errorCliente } = await supabase
    .from('clients')
    .select('id, org_id, slug')
    .eq('id', clientId)
    .maybeSingle()

  if (errorCliente || !cliente) {
    return {
      status: 'error',
      message: 'No se encontró el cliente. Vuelve a abrir la página y prueba otra vez.',
    }
  }

  const { error } = await supabase.from('volume_plans').upsert(
    {
      org_id: cliente.org_id,
      client_id: cliente.id,
      month: mes,
      capacity_declared: capacidad,
      pillar_mix: mezcla,
      updated_at: systemClock.now().toISOString(),
    },
    { onConflict: 'client_id,month' },
  )

  if (error) {
    return {
      status: 'error',
      message: `No se pudo guardar el plan: ${error.message}`,
    }
  }

  revalidatePath(`/cliente/${cliente.slug}`)

  return {
    status: 'guardado',
    message:
      `Quedaron ${capacidad} piezas de capacidad y los objetivos por pilar. ` +
      'El Estratega arma la propuesta con esas restricciones en su siguiente corrida.',
  }
}
