'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { sincronizarReferenciasApify } from '@/lib/apis/redes-sync'
import { serverEnv } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Mutaciones de § Referencias: agregar y quitar cuentas de la competencia o de
 * inspiración, y traer sus números desde Apify.
 *
 * Como en el resto de estas acciones, nada filtra por org ni revisa permisos con
 * un `if`: lo hace RLS. Lo que sí se revisa es el conteo de renglones afectados,
 * porque un DELETE que RLS bloquea afecta cero filas y regresa sin error.
 */

const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'El slug del cliente no se ve bien.')

function refrescarCliente(slug: string): void {
  revalidatePath(`/cliente/${slug}`)
}

export interface EstadoReferencia {
  status: 'guardada' | 'borrada' | 'error'
  message: string
}

const altaSchema = z.object({
  clientId: z.uuid(),
  orgId: z.uuid(),
  slug: slugSchema,
  platform: z.enum(['instagram', 'facebook', 'tiktok', 'linkedin']),
  handle: z
    .string()
    .trim()
    .min(1, 'Escribe el handle de la cuenta, con o sin arroba.')
    .max(120, 'El handle no puede pasar de 120 caracteres.')
    .transform((h) => h.replace(/^@/, '')),
  // FormData.get() devuelve null cuando el campo no viene; por eso nullish.
  label: z
    .string()
    .trim()
    .max(120, 'La etiqueta no puede pasar de 120 caracteres.')
    .nullish()
    .transform((v) => v || null),
  kind: z.enum(['competencia', 'inspiracion']),
})

export async function agregarReferencia(formData: FormData): Promise<EstadoReferencia> {
  const parsed = altaSchema.safeParse({
    clientId: formData.get('clientId'),
    orgId: formData.get('orgId'),
    slug: formData.get('slug'),
    platform: formData.get('platform'),
    handle: formData.get('handle'),
    label: formData.get('label'),
    kind: formData.get('kind'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa el formulario.' }
  }

  const { clientId, orgId, slug, platform, handle, label, kind } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.from('reference_accounts').insert({
    org_id: orgId,
    client_id: clientId,
    platform,
    handle,
    label,
    kind,
  })

  if (error) {
    // unique (client_id, platform, handle) — ya estaba en la lista.
    if (error.code === '23505') {
      return { status: 'error', message: 'Esa cuenta ya está en la lista para esta red.' }
    }
    return { status: 'error', message: `No se pudo agregar: ${error.message}` }
  }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Cuenta agregada. Sincroniza para traer sus números.' }
}

const borrarSchema = z.object({ id: z.uuid(), slug: slugSchema })

export async function borrarReferencia(formData: FormData): Promise<EstadoReferencia> {
  const parsed = borrarSchema.safeParse({
    id: formData.get('id'),
    slug: formData.get('slug'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'No se pudo identificar la cuenta. Recarga la sección.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('reference_accounts')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { status: 'error', message: `No se pudo borrar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { status: 'error', message: 'Esa cuenta ya no está en la lista. Recarga la sección.' }
  }

  refrescarCliente(parsed.data.slug)
  return { status: 'borrada', message: 'Cuenta quitada de la lista.' }
}

const syncSchema = z.object({ clientId: z.uuid(), slug: slugSchema })

export async function sincronizarReferencias(
  input: unknown,
): Promise<{ status: 'ok' | 'error'; message: string; revisadas: string[] }> {
  const parsed = syncSchema.safeParse(input)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'No se pudo identificar al cliente. Recarga la página e intenta de nuevo.',
      revisadas: [],
    }
  }

  const env = serverEnv()
  const supabase = await createClient()

  const { data: cuentas } = await supabase
    .from('reference_accounts')
    .select('id, handle')
    .eq('client_id', parsed.data.clientId)
    .eq('platform', 'instagram')

  if (!cuentas?.length) {
    return {
      status: 'error',
      message: 'No hay cuentas de referencia de Instagram que sincronizar.',
      revisadas: [],
    }
  }

  if (!env.APIFY_API_TOKEN) {
    return {
      status: 'ok',
      message:
        'Apify no está configurado todavía. Conecta el token para traer los números de estas cuentas.',
      revisadas: [],
    }
  }

  const { actualizadas } = await sincronizarReferenciasApify({
    supabase,
    apifyToken: env.APIFY_API_TOKEN,
    cuentas: cuentas.map((c) => ({ id: c.id, handle: c.handle })),
    ahora: systemClock.now(),
  })

  if (actualizadas.length === 0) {
    return {
      status: 'error',
      message:
        'Apify no devolvió datos de ninguna cuenta. Revisa que los handles estén bien y que las cuentas sean públicas.',
      revisadas: [],
    }
  }

  refrescarCliente(parsed.data.slug)
  return {
    status: 'ok',
    message: `${actualizadas.length} ${actualizadas.length === 1 ? 'cuenta actualizada' : 'cuentas actualizadas'} desde Apify.`,
    revisadas: actualizadas,
  }
}
