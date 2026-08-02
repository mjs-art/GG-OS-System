'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  importarResultadosMensuales,
  importarResultadosPorPieza,
  resumenDeImportacion,
  type ErrorDeImportacion,
} from '@/domain/csv'
import { createClient } from '@/lib/supabase/server'
import { isMonthKey, systemClock } from '@/lib/time'

/**
 * Mutaciones de la sección Resultados.
 *
 * Todo lo que entra aquí es externo —un archivo que alguien exportó, ocho
 * números que alguien tecleó— y por lo tanto se valida con Zod en el límite.
 * Un tipo de TypeScript no valida nada en runtime.
 *
 * **Todo o nada.** Si el CSV trae un renglón malo no se escribe ninguno. Cada
 * importación es UN `upsert` con el arreglo completo: en Postgres una sola
 * sentencia es atómica, así que o entran los doce meses o no entra ninguno. Un
 * bucle de doce upserts sí podría dejar el mes seis a medias, y ese estado no
 * se distingue a simple vista de uno correcto.
 */

export interface EstadoResultados {
  status: 'inicial' | 'guardado' | 'error'
  message?: string
  /** Los renglones malos, con su número de línea. Se listan tal cual. */
  errores?: ErrorDeImportacion[]
}

const mesSchema = z.string().refine(isMonthKey, {
  message: 'Mes inválido. Se espera AAAA-MM, por ejemplo 2026-09.',
})

/** 4 MB. Un CSV de métricas de un mes pesa kilobytes; más que esto es otra cosa. */
const MAX_BYTES = 4 * 1024 * 1024

const archivoSchema = z.object({
  clientId: z.uuid('Cliente inválido.'),
  tipo: z.enum(['mensual', 'por_pieza']),
  archivo: z
    .instanceof(File, { message: 'Elige un archivo CSV.' })
    .refine((f) => f.size > 0, 'El archivo está vacío.')
    .refine((f) => f.size <= MAX_BYTES, 'El archivo pesa más de 4 MB. ¿Seguro que es el reporte?'),
})

/** Datos del cliente que hacen falta para escribir. El org NO viene del formulario. */
async function clienteDe(clientId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('id, org_id, slug')
    .eq('id', clientId)
    .maybeSingle()
  return data
}

export async function importarCsv(
  _prev: EstadoResultados,
  formData: FormData,
): Promise<EstadoResultados> {
  const parsed = archivoSchema.safeParse({
    clientId: formData.get('clientId'),
    tipo: formData.get('tipo'),
    archivo: formData.get('archivo'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Revisa el archivo que elegiste.',
    }
  }

  const { clientId, tipo, archivo } = parsed.data
  const texto = await archivo.text()

  const cliente = await clienteDe(clientId)
  if (!cliente) {
    return { status: 'error', message: 'No se encontró el cliente. Vuelve a abrir la página.' }
  }

  const supabase = await createClient()

  if (tipo === 'mensual') {
    const resultado = importarResultadosMensuales(texto)
    if (!resultado.ok) {
      return {
        status: 'error',
        message: resumenDeImportacion(resultado),
        errores: resultado.errores,
      }
    }

    const { error } = await supabase.from('results_monthly').upsert(
      resultado.filas.map(({ datos }) => ({
        org_id: cliente.org_id,
        client_id: cliente.id,
        month: datos.mes,
        reach: datos.alcance,
        impressions: datos.impresiones,
        saves: datos.guardados,
        shares: datos.compartidos,
        interactions: datos.interacciones,
        new_followers: datos.seguidores_nuevos,
        profile_visits: datos.visitas_perfil,
        link_clicks: datos.clics_link,
        source: 'csv' as const,
        updated_at: systemClock.now().toISOString(),
      })),
      { onConflict: 'client_id,month' },
    )

    if (error) {
      return { status: 'error', message: `No se pudo guardar: ${error.message}` }
    }

    revalidatePath(`/cliente/${cliente.slug}`)
    return {
      status: 'guardado',
      message: `Listo. Se importaron ${resultado.filas.length} meses${
        resultado.columnasIgnoradas.length > 0
          ? `. Se ignoraron las columnas: ${resultado.columnasIgnoradas.join(', ')}`
          : ''
      }.`,
    }
  }

  const resultado = importarResultadosPorPieza(texto)
  if (!resultado.ok) {
    return { status: 'error', message: resumenDeImportacion(resultado), errores: resultado.errores }
  }

  // Un solo instante de medición para todo el archivo: son la misma foto. Con
  // un `now()` por renglón, dos importaciones seguidas se verían como dos
  // mediciones distintas de cada pieza.
  const medidoEn = systemClock.now().toISOString()

  // No se verifica aquí que cada `piece_id` sea del cliente: la FK compuesta
  // (piece_id, client_id) de `results_piece` ya lo impide, y como es un solo
  // INSERT, un id ajeno tumba el archivo completo en vez de colar un renglón.
  const { error } = await supabase.from('results_piece').insert(
    resultado.filas.map(({ datos }) => ({
      org_id: cliente.org_id,
      client_id: cliente.id,
      piece_id: datos.pieza_id,
      reach: datos.alcance,
      impressions: datos.impresiones,
      saves: datos.guardados,
      shares: datos.compartidos,
      interactions: datos.interacciones,
      measured_at: medidoEn,
    })),
  )

  if (error) {
    return {
      status: 'error',
      message:
        `No se pudo guardar: ${error.message}. ` +
        'Si habla de una llave foránea, alguna pieza del archivo no es de este cliente.',
    }
  }

  revalidatePath(`/cliente/${cliente.slug}`)
  return {
    status: 'guardado',
    message: `Listo. Se midieron ${resultado.filas.length} piezas.`,
  }
}

/* -------------------------------------------------------------------------- */
/*  Captura a mano                                                             */
/* -------------------------------------------------------------------------- */

const entero = z.coerce.number().int('Va un número entero.').min(0, 'No puede ser negativo.')

const capturaSchema = z.object({
  clientId: z.uuid('Cliente inválido.'),
  mes: mesSchema,
  alcance: entero,
  impresiones: entero,
  guardados: entero,
  compartidos: entero,
  interacciones: entero,
  // Sin `min(0)`: un mes se pueden perder seguidores, y la base tampoco lo
  // restringe. Forzar el cero aquí obligaría a mentir en la captura.
  seguidores_nuevos: z.coerce.number().int('Va un número entero.'),
  visitas_perfil: entero,
  clics_link: entero,
})

export async function capturarResultados(
  _prev: EstadoResultados,
  formData: FormData,
): Promise<EstadoResultados> {
  const parsed = capturaSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      status: 'error',
      message: issue
        ? `${String(issue.path[0] ?? 'Un campo')}: ${issue.message}`
        : 'Revisa los números.',
    }
  }

  const datos = parsed.data
  const cliente = await clienteDe(datos.clientId)
  if (!cliente) {
    return { status: 'error', message: 'No se encontró el cliente. Vuelve a abrir la página.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('results_monthly').upsert(
    {
      org_id: cliente.org_id,
      client_id: cliente.id,
      month: datos.mes,
      reach: datos.alcance,
      impressions: datos.impresiones,
      saves: datos.guardados,
      shares: datos.compartidos,
      interactions: datos.interacciones,
      new_followers: datos.seguidores_nuevos,
      profile_visits: datos.visitas_perfil,
      link_clicks: datos.clics_link,
      source: 'manual' as const,
      updated_at: systemClock.now().toISOString(),
    },
    { onConflict: 'client_id,month' },
  )

  if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }

  revalidatePath(`/cliente/${cliente.slug}`)
  return { status: 'guardado', message: 'Guardado. Los números del mes ya están capturados.' }
}

/* -------------------------------------------------------------------------- */
/*  Aplicar un cambio propuesto por el Analista                                */
/* -------------------------------------------------------------------------- */

/**
 * El Analista **propone**; esta acción es la que ejecuta, y solo porque una
 * persona le dio clic.
 *
 * Solo se aplican los campos cuyo valor propuesto es un valor de verdad. El
 * agente escribe "de 9:00 am a 6:00 pm" y "de Coctelería a Ambiente": eso es
 * prosa, no un timestamp ni un uuid de pilar, y convertirlo aquí con una
 * heurística es cómo se mueve una pieza al día equivocado. Para esos dos, la
 * acción manda al planner.
 */
const CAMPOS_APLICABLES = ['hook', 'cta', 'format'] as const

const aplicarSchema = z.object({
  clientId: z.uuid('Cliente inválido.'),
  pieceId: z.uuid('Pieza inválida.'),
  campo: z.enum(['hook', 'cta', 'format', 'publish_at', 'pillar']),
  valor: z.string().trim().min(1, 'El cambio propuesto viene vacío.').max(2000),
})

export async function aplicarCambioDelAnalista(
  _prev: EstadoResultados,
  formData: FormData,
): Promise<EstadoResultados> {
  const parsed = aplicarSchema.safeParse({
    clientId: formData.get('clientId'),
    pieceId: formData.get('pieceId'),
    campo: formData.get('campo'),
    valor: formData.get('valor'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'No se pudo leer el cambio propuesto.',
    }
  }

  const { clientId, pieceId, campo, valor } = parsed.data

  if (!(CAMPOS_APLICABLES as readonly string[]).includes(campo)) {
    return {
      status: 'error',
      message:
        campo === 'publish_at'
          ? 'Este cambio es de fecha y hora: hazlo en el planner, donde ves el resto del mes.'
          : 'Este cambio es de pilar: hazlo en el planner, donde ves el balance completo.',
    }
  }

  const cliente = await clienteDe(clientId)
  if (!cliente) {
    return { status: 'error', message: 'No se encontró el cliente. Vuelve a abrir la página.' }
  }

  const supabase = await createClient()

  let cambio: { hook: string } | { cta: string } | { format: 'post' | 'carrusel' | 'reel' }
  if (campo === 'hook') {
    cambio = { hook: valor }
  } else if (campo === 'cta') {
    cambio = { cta: valor }
  } else {
    const formato = z.enum(['post', 'carrusel', 'reel']).safeParse(valor.toLowerCase())
    if (!formato.success) {
      return {
        status: 'error',
        message: `"${valor}" no es un formato válido. Los formatos son post, carrusel y reel.`,
      }
    }
    cambio = { format: formato.data }
  }

  // Un UPDATE que RLS filtra no lanza error: afecta cero renglones y regresa en
  // silencio. Por eso se pide el conteo y se revisa, en vez de asumir que pasó.
  const { error, count } = await supabase
    .from('pieces')
    .update(cambio, { count: 'exact' })
    .eq('id', pieceId)
    .eq('client_id', cliente.id)

  if (error) return { status: 'error', message: `No se pudo aplicar: ${error.message}` }
  if (count === 0) {
    return {
      status: 'error',
      message: 'La pieza ya no existe o no se puede editar desde aquí. Ábrela en el planner.',
    }
  }

  revalidatePath(`/cliente/${cliente.slug}`)
  return { status: 'guardado', message: 'Aplicado. La pieza ya trae el cambio.' }
}
