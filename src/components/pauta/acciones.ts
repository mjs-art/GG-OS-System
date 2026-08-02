'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accionError, accionOk, type EstadoAccion } from '@/components/pauta/estado-accion'
import { parsearCsvDeAds, pesosACentavos, totalizar } from '@/domain/pauta'
import { requireUser } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Mutaciones de la sección Pauta.
 *
 * ## La regla que gobierna este archivo
 *
 * Aprobar una propuesta cambia `ad_proposals.status` y guarda las
 * instrucciones. **Nada más.** No toca `campaigns.budget_cents` ni
 * `ad_sets.budget_cents`, no pausa nada y no habla con Meta. El cambio real lo
 * hace una persona en el ads manager y después vuelve aquí a marcarlo.
 *
 * No hay que confiar en que este archivo se porte bien: la base tiene dos
 * triggers cruzados (`app.guard_proposal_approval` y `app.guard_budget_move`)
 * que revientan la transacción si aprobar y mover dinero ocurren juntos, en
 * cualquier orden. Este código trabaja con ese guardián, no contra él.
 */

/**
 * El slug del cliente sirve para invalidar el caché de su dashboard.
 *
 * Se valida con regex y no se interpola crudo: `revalidatePath` recibe una
 * ruta, y una ruta que viene de un campo del formulario es un input externo
 * como cualquier otro.
 */
const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,60}$/, 'Ese cliente no se ve bien. Recarga la página.')

const uuidSchema = z.uuid('Ese identificador no es válido. Recarga la página.')

/** Un entero de conteo capturado a mano. Viene como texto del `<input>`. */
const enteroSchema = z.coerce
  .number({ error: 'Solo números enteros, sin comas.' })
  .int('Solo números enteros, sin comas.')
  .min(0, 'No puede ser negativo.')
  .max(1_000_000_000)

function revalidarCliente(slug: string): void {
  revalidatePath(`/cliente/${slug}`)
}

/* ==========================================================================
   Decidir una propuesta del Pautero
   ========================================================================== */

const decisionSchema = z.object({
  propuestaId: uuidSchema,
  slug: slugSchema,
  decision: z.enum(['aprobar', 'aprobar_alternativa', 'rechazar'], {
    error: 'Esa decisión no existe.',
  }),
})

/**
 * Aprobar, aprobar la alternativa o rechazar.
 *
 * `aprobada` y `aprobada_alternativa` son estados distintos y no un booleano
 * aparte porque la alternativa es OTRA instrucción. Quien la aplica en el ads
 * manager necesita saber cuál de las dos se autorizó, y una semana después
 * nadie se acuerda.
 */
export async function decidirPropuesta(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const parsed = decisionSchema.safeParse({
    propuestaId: formData.get('propuestaId'),
    slug: formData.get('slug'),
    decision: formData.get('decision'),
  })

  if (!parsed.success) {
    return accionError(parsed.error.issues[0]?.message ?? 'Faltó un dato. Recarga la página.')
  }

  const { propuestaId, slug, decision } = parsed.data
  const { supabase, user } = await requireUser()

  const { data: propuesta, error: errorLectura } = await supabase
    .from('ad_proposals')
    .select('id, status, instructions, alternative')
    .eq('id', propuestaId)
    .maybeSingle()

  if (errorLectura) {
    return accionError(`No se pudo leer la propuesta: ${errorLectura.message}`)
  }
  if (!propuesta) {
    return accionError('Esa propuesta ya no existe. Recarga la página para ver las vigentes.')
  }
  if (propuesta.status !== 'propuesta') {
    return accionError('Esa propuesta ya se había decidido. Recarga para ver en qué quedó.')
  }

  // Las instrucciones son el entregable de aprobar: sin ellas, "aprobado" no le
  // dice a nadie qué hacer, y la base lo rechaza con un check constraint.
  let instrucciones: string | null = null

  if (decision === 'aprobar') {
    instrucciones = textoOnull(propuesta.instructions)
    if (!instrucciones) {
      return accionError(
        'Esta propuesta no trae los pasos para el ads manager. Pídele al Pautero que la vuelva ' +
          'a generar antes de aprobarla.',
      )
    }
  }

  if (decision === 'aprobar_alternativa') {
    const alternativa =
      typeof propuesta.alternative === 'object' && propuesta.alternative !== null
        ? (propuesta.alternative as Record<string, unknown>)
        : {}
    const texto = alternativa['instructions']
    instrucciones = typeof texto === 'string' ? textoOnull(texto) : null

    if (!instrucciones) {
      return accionError(
        'La alternativa no trae pasos para el ads manager. Aprueba la propuesta principal o ' +
          'pídele al Pautero que escriba la alternativa completa.',
      )
    }
  }

  const status =
    decision === 'aprobar'
      ? 'aprobada'
      : decision === 'aprobar_alternativa'
        ? 'aprobada_alternativa'
        : 'rechazada'

  const { data, error } = await supabase
    .from('ad_proposals')
    .update({
      status,
      // Se guarda también al rechazar: la columna es el autor de la DECISIÓN, y
      // un rechazo sin nombre deja la conversación de la semana siguiente sin
      // a quién preguntarle por qué.
      approved_by: user.id,
      ...(instrucciones ? { instructions: instrucciones } : {}),
    })
    .eq('id', propuestaId)
    // Volver a exigir el estado de partida hace la operación idempotente: dos
    // clics seguidos no producen dos decisiones distintas.
    .eq('status', 'propuesta')
    .select('id')

  if (error) {
    return accionError(`No se pudo guardar la decisión: ${error.message}`)
  }
  // Un UPDATE filtrado por RLS no falla: afecta cero renglones y regresa en
  // silencio. Por eso se cuenta lo que volvió en vez de confiar en el error.
  if ((data ?? []).length === 0) {
    return accionError('La decisión no se guardó. Recarga la página y vuelve a intentar.')
  }

  revalidarCliente(slug)

  if (status === 'rechazada') {
    return accionOk('Propuesta rechazada. No hay nada que aplicar.')
  }

  return accionOk(
    'Queda por aplicar. La app no cambió nada en el ads manager: abre Meta o TikTok y sigue ' +
      'los pasos de abajo.',
  )
}

/* ==========================================================================
   Marcar como aplicada
   ========================================================================== */

const aplicadaSchema = z.object({
  propuestaId: uuidSchema,
  slug: slugSchema,
  // FormData.get() devuelve **null**, no undefined, cuando el campo viene
  // vacío. Con `.optional()` esto reventaría en el caso más común: sin nota.
  nota: z.string().trim().max(1000, 'La nota es muy larga.').nullish(),
})

/**
 * La persona ya hizo el cambio en el ads manager y viene a registrarlo.
 *
 * Este es el único momento en que la app se entera de que el presupuesto se
 * movió. Marcar como aplicada tampoco escribe presupuestos: solo deja el
 * registro con hora y nota.
 */
export async function marcarAplicada(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const parsed = aplicadaSchema.safeParse({
    propuestaId: formData.get('propuestaId'),
    slug: formData.get('slug'),
    nota: formData.get('nota'),
  })

  if (!parsed.success) {
    return accionError(parsed.error.issues[0]?.message ?? 'Faltó un dato. Recarga la página.')
  }

  const { propuestaId, slug, nota } = parsed.data
  const { supabase } = await requireUser()

  const { data, error } = await supabase
    .from('ad_proposals')
    .update({
      status: 'aplicada',
      applied_at: systemClock.now().toISOString(),
      applied_note: textoOnull(nota ?? ''),
    })
    .eq('id', propuestaId)
    .in('status', ['aprobada', 'aprobada_alternativa'])
    .select('id')

  if (error) {
    return accionError(`No se pudo registrar: ${error.message}`)
  }
  if ((data ?? []).length === 0) {
    return accionError(
      'Esa propuesta no está por aplicar. Recarga la página para ver en qué estado quedó.',
    )
  }

  revalidarCliente(slug)
  return accionOk('Registrada como aplicada, con la hora.')
}

/* ==========================================================================
   Captura de métricas a mano
   ========================================================================== */

const capturaSchema = z.object({
  slug: slugSchema,
  adSetId: uuidSchema,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha va en formato AAAA-MM-DD.'),
  gasto: z.string(),
  impresiones: enteroSchema,
  alcance: enteroSchema,
  clics: enteroSchema,
  resultados: enteroSchema,
})

export async function capturarMetricas(
  _prev: EstadoAccion,
  formData: FormData,
): Promise<EstadoAccion> {
  const parsed = capturaSchema.safeParse({
    slug: formData.get('slug'),
    adSetId: formData.get('adSetId'),
    fecha: formData.get('fecha'),
    gasto: formData.get('gasto') ?? '',
    impresiones: formData.get('impresiones') ?? 0,
    alcance: formData.get('alcance') ?? 0,
    clics: formData.get('clics') ?? 0,
    resultados: formData.get('resultados') ?? 0,
  })

  if (!parsed.success) {
    return accionError(parsed.error.issues[0]?.message ?? 'Revisa los números que capturaste.')
  }

  const { slug, adSetId, fecha, gasto, impresiones, alcance, clics, resultados } = parsed.data

  const gastoCents = pesosACentavos(gasto)
  if (gastoCents === null || gastoCents < 0) {
    return accionError(
      `El gasto "${gasto}" no se entiende. Escribe solo el número, por ejemplo 70 o 70.50.`,
    )
  }

  const { supabase } = await requireUser()

  // De aquí salen org_id y client_id. No se piden por formulario: un client_id
  // que viene de la petición es exactamente el dato con el que no se filtra.
  const { data: adSet, error: errorAdSet } = await supabase
    .from('ad_sets')
    .select('id, org_id, client_id')
    .eq('id', adSetId)
    .maybeSingle()

  if (errorAdSet) return accionError(`No se pudo leer el ad set: ${errorAdSet.message}`)
  if (!adSet) {
    return accionError('Ese ad set ya no existe. Recarga la página.')
  }

  const { error } = await supabase.from('ad_metrics').upsert(
    {
      org_id: adSet.org_id,
      client_id: adSet.client_id,
      ad_set_id: adSet.id,
      date: fecha,
      spend_cents: gastoCents,
      impressions: impresiones,
      reach: alcance,
      clicks: clics,
      results: resultados,
      ...derivados({ gastoCents, impresiones, alcance, clics, resultados, fecha }),
    },
    // Un día, un renglón. Recapturar el mismo día corrige el número en vez de
    // sumarlo dos veces.
    { onConflict: 'ad_set_id,date' },
  )

  if (error) return accionError(`No se pudo guardar: ${error.message}`)

  revalidarCliente(slug)
  return accionOk(`Métricas del ${fecha} guardadas.`)
}

/* ==========================================================================
   Importación de CSV
   ========================================================================== */

const importacionSchema = z.object({
  slug: slugSchema,
  campanaId: uuidSchema,
  fuente: z.enum(['meta', 'tiktok']),
})

/** 2 MB. Un export de siete días por ad set pesa kilobytes; más es otra cosa. */
const MAX_CSV_BYTES = 2 * 1024 * 1024

export async function importarCsv(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const parsed = importacionSchema.safeParse({
    slug: formData.get('slug'),
    campanaId: formData.get('campanaId'),
    fuente: formData.get('fuente'),
  })

  if (!parsed.success) {
    return accionError(parsed.error.issues[0]?.message ?? 'Faltó un dato. Recarga la página.')
  }

  const archivo = formData.get('archivo')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return accionError('Escoge el archivo CSV que exportaste del ads manager.')
  }
  if (archivo.size > MAX_CSV_BYTES) {
    return accionError(
      'Ese archivo pesa más de 2 MB. Exporta solo el rango de fechas de esta campaña.',
    )
  }

  const { slug, campanaId } = parsed.data
  const { supabase } = await requireUser()

  const { data: adSets, error: errorAdSets } = await supabase
    .from('ad_sets')
    .select('id, org_id, client_id, name')
    .eq('campaign_id', campanaId)

  if (errorAdSets) return accionError(`No se pudieron leer los ad sets: ${errorAdSets.message}`)
  if (!adSets?.length) {
    return accionError(
      'Esta campaña todavía no tiene ad sets. Créalos primero para poder colgarles las métricas.',
    )
  }

  const { filas, errores } = parsearCsvDeAds(await archivo.text())

  if (filas.length === 0) {
    return accionError('No se pudo leer ningún renglón del archivo.', errores.slice(0, 5))
  }

  // El CSV identifica el ad set por nombre, que es lo único que trae el export.
  // Se compara sin acentos ni mayúsculas porque "A · Interés" y "a · interes"
  // son el mismo ad set escrito por dos personas distintas.
  const porNombre = new Map(adSets.map((a) => [clave(a.name), a] as const))

  const renglones = []
  const sinCasar = new Set<string>()

  for (const fila of filas) {
    const adSet = porNombre.get(clave(fila.adSet))
    if (!adSet) {
      sinCasar.add(fila.adSet)
      continue
    }
    renglones.push({
      org_id: adSet.org_id,
      client_id: adSet.client_id,
      ad_set_id: adSet.id,
      date: fila.fecha,
      spend_cents: fila.gastoCents,
      impressions: fila.impresiones,
      reach: fila.alcance,
      clicks: fila.clics,
      results: fila.resultados,
      ...derivados({
        fecha: fila.fecha,
        gastoCents: fila.gastoCents,
        impresiones: fila.impresiones,
        alcance: fila.alcance,
        clics: fila.clics,
        resultados: fila.resultados,
      }),
    })
  }

  const detalles = [
    ...errores.slice(0, 5),
    ...[...sinCasar].map(
      (n) => `No hay un ad set llamado "${n}" en esta campaña. Ese renglón se saltó.`,
    ),
  ]

  if (renglones.length === 0) {
    return accionError(
      'Ninguno de los renglones corresponde a un ad set de esta campaña. Revisa que hayas ' +
        'exportado el reporte de la campaña correcta.',
      detalles,
    )
  }

  const { error } = await supabase
    .from('ad_metrics')
    .upsert(renglones, { onConflict: 'ad_set_id,date' })

  if (error) return accionError(`No se pudo guardar la importación: ${error.message}`)

  revalidarCliente(slug)
  return accionOk(
    `Se importaron ${renglones.length} ${renglones.length === 1 ? 'renglón' : 'renglones'}.`,
    detalles,
  )
}

/* ==========================================================================
   Auxiliares
   ========================================================================== */

function textoOnull(valor: string | null): string | null {
  const t = (valor ?? '').trim()
  return t === '' ? null : t
}

function clave(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim()
}

/**
 * CTR, CPM, CPC y costo por resultado de un solo día.
 *
 * Se guardan derivados aunque la app los recalcule al leer: la tabla también la
 * consultan el Pautero y las pruebas de SQL, y un renglón donde el CPC está en
 * null obliga a cada consumidor a rehacer la división.
 *
 * El CTR se acota a 100: la columna tiene un check de 0–100 y un CSV con más
 * clics que impresiones —pasa cuando alguien pega dos rangos de fechas—
 * tumbaría la importación entera por un renglón.
 */
function derivados(fila: {
  fecha: string
  gastoCents: number
  impresiones: number
  alcance: number
  clics: number
  resultados: number
}) {
  const t = totalizar([fila])
  return {
    ctr: t.ctr === null ? null : Math.min(100, Math.round(t.ctr * 1000) / 1000),
    cpm_cents: t.cpmCents,
    cpc_cents: t.cpcCents,
    cost_per_result_cents: t.costoPorResultadoCents,
  }
}
