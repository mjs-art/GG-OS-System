'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearClienteInstagram } from '@/lib/apis/instagram'
import { codeRuleParams, ruleSeverity } from '@/domain/brand-rules'
import { serverEnv } from '@/lib/env'
import { createClient, requireUser } from '@/lib/supabase/server'
import { systemClock } from '@/lib/time'

/**
 * Mutaciones de Redes, Marca y Privado.
 *
 * Todo lo que escribe pasa por aquí, con Zod en el límite. Un tipo de
 * TypeScript no valida nada en runtime, y estos datos llegan de un formulario
 * del navegador.
 *
 * Ninguna de estas acciones filtra por org ni verifica permisos con un `if`.
 * Lo hace RLS. Lo que sí se revisa es el **conteo de renglones afectados**:
 * un UPDATE o un DELETE que RLS bloquea no lanza error, afecta cero renglones
 * y regresa en silencio. Sin ese conteo la interfaz diría "guardado" cuando no
 * se guardó nada, que es el peor error posible en una nota.
 */

/** Solo se revalida una ruta interna, construida a partir de un slug limpio. */
const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/, 'El slug del cliente no se ve bien.')

const idsSchema = z.object({
  clientId: z.uuid(),
  orgId: z.uuid(),
  slug: slugSchema,
})

function refrescarCliente(slug: string): void {
  revalidatePath(`/cliente/${slug}`)
}

/* ==========================================================================
   § REDES — auditar cuentas
   ========================================================================== */

export interface ResultadoAuditoria {
  status: 'ok' | 'error'
  message: string
  /** Ids de `social_accounts` que se volvieron a revisar. La UI las destella. */
  revisadas: string[]
}

/**
 * Vuelve a pasar el semáforo sobre lo que hay capturado y sella `checked_at`.
 *
 * Lo que esta acción **no** hace, y hay que saberlo: no escribe en
 * `account_audits`. Esa tabla es append-only y solo tiene `grant select` para
 * `authenticated` — la escribe el runner del Auditor con `service_role`, junto
 * con su corrida, su costo y su versión de Context Card. Un botón de la
 * interfaz que insertara ahí produciría auditorías sin corrida que las
 * respalde, y una auditoría que no se puede rastrear no se puede operar.
 *
 * Mientras el Auditor no esté enchufado, lo honesto es esto: la parte
 * determinista de la revisión (días sin publicar, cadencia, checklist) ya
 * corre en `@/domain/redes` en cada render, y aquí solo se registra que
 * alguien la miró.
 */
export async function auditarCuentas(input: unknown): Promise<ResultadoAuditoria> {
  const parsed = idsSchema.pick({ clientId: true, slug: true }).safeParse(input)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'No se pudo identificar al cliente. Recarga la página e intenta de nuevo.',
      revisadas: [],
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('social_accounts')
    .update({ checked_at: systemClock.now().toISOString() })
    .eq('client_id', parsed.data.clientId)
    .select('id')

  if (error) {
    return {
      status: 'error',
      message: `No se pudo registrar la revisión: ${error.message}`,
      revisadas: [],
    }
  }

  const revisadas = (data ?? []).map((r) => r.id)

  if (revisadas.length === 0) {
    return {
      status: 'error',
      message: 'No hay cuentas conectadas que revisar. Conecta al menos una red primero.',
      revisadas: [],
    }
  }

  refrescarCliente(parsed.data.slug)

  return {
    status: 'ok',
    message: `${revisadas.length} ${revisadas.length === 1 ? 'cuenta revisada' : 'cuentas revisadas'}.`,
    revisadas,
  }
}

/**
 * Sincroniza los datos de Instagram desde la API: seguidores, último post,
 * publicaciones de la semana.
 *
 * Si el token no está configurado, el mensaje lo dice y la app sigue
 * funcionando con captura manual. Esa es la diferencia entre una feature que
 * no sirve y una que todavía no se enchufa.
 */
export async function sincronizarRedes(
  input: unknown,
): Promise<{ status: 'ok' | 'error'; message: string; revisadas: string[] }> {
  const parsed = idsSchema.pick({ clientId: true, slug: true }).safeParse(input)
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'No se pudo identificar al cliente. Recarga la página e intenta de nuevo.',
      revisadas: [],
    }
  }

  const token = serverEnv().INSTAGRAM_LONG_LIVED_TOKEN
  if (!token) {
    return {
      status: 'ok',
      message:
        'Instagram Graph API no está configurada todavía. Las métricas se capturan a mano por ahora.',
      revisadas: [],
    }
  }

  const supabase = await createClient()

  const { data: cuentas } = await supabase
    .from('social_accounts')
    .select('id, platform')
    .eq('client_id', parsed.data.clientId)
    .eq('platform', 'instagram')

  if (!cuentas?.length) {
    return {
      status: 'error',
      message: 'El cliente no tiene cuentas de Instagram registradas.',
      revisadas: [],
    }
  }

  const clienteIg = crearClienteInstagram({ token, businessAccountId: 'me' })
  const frescos = await clienteIg.datosFrescos()

  if (!frescos) {
    return {
      status: 'error',
      message:
        'El token de Instagram rechazó la petición. Revisa que esté vigente y que la cuenta de negocio esté conectada a la página de Facebook.',
      revisadas: [],
    }
  }

  const ahora = systemClock.now().toISOString()
  const revisadas: string[] = []

  for (const cuenta of cuentas) {
    const { error, data } = await supabase
      .from('social_accounts')
      .update({
        followers: frescos.followers,
        last_post_at: frescos.lastPostAt ?? null,
        posts_per_week: frescos.postsThisWeek,
        checked_at: ahora,
      })
      .eq('id', cuenta.id)
      .select('id')

    if (!error && (data ?? []).length > 0) {
      revisadas.push(cuenta.id)
    }
  }

  if (revisadas.length === 0) {
    return {
      status: 'error',
      message: 'No se pudo actualizar ninguna cuenta. Revisa los permisos del token.',
      revisadas: [],
    }
  }

  refrescarCliente(parsed.data.slug)

  return {
    status: 'ok',
    message: `${revisadas.length} ${revisadas.length === 1 ? 'cuenta sincronizada' : 'cuentas sincronizadas'} desde Instagram. Seguidores, última publicación y cadencia al día.`,
    revisadas,
  }
}

/* ==========================================================================
   § MARCA — agregar regla dura
   ========================================================================== */

export interface EstadoRegla {
  status: 'guardada' | 'error'
  message: string
}

/**
 * El formulario no pide un JSON de parámetros: pide un tipo de regla.
 *
 * Es la diferencia entre una regla que el Editor de marca puede verificar y
 * una que aparece marcada como "mal configurada" para siempre. Los tipos de
 * aquí son exactamente los que `checkCodeRules` sabe evaluar; cualquier otra
 * cosa entra como regla de juicio, que la revisa un modelo.
 */
const reglaSchema = z
  .object({
    clientId: z.uuid(),
    orgId: z.uuid(),
    slug: slugSchema,
    rule: z
      .string()
      .trim()
      .min(1, 'Escribe la regla como se la dirías a alguien nuevo del equipo.')
      .max(500, 'La regla no puede pasar de 500 caracteres. Pártela en dos.'),
    severity: ruleSeverity,
    tipo: z.enum(['hashtags_exact', 'lowercase', 'banned_words', 'juicio']),
    // FormData.get() devuelve **null**, no undefined, cuando el campo no viene
    // — y no viene siempre que el tipo elegido no lo pide. Con `.optional()`
    // esto reventaría en el caso más común, que es la regla de juicio.
    cantidad: z.string().nullish(),
    palabras: z.string().nullish(),
  })
  .refine((v) => v.tipo !== 'hashtags_exact' || Number.isInteger(Number(v.cantidad)), {
    message: 'Escribe cuántos hashtags exactos pide la regla.',
    path: ['cantidad'],
  })
  .refine((v) => v.tipo !== 'banned_words' || (v.palabras ?? '').trim().length > 0, {
    message: 'Lista al menos una palabra prohibida, separadas por coma.',
    path: ['palabras'],
  })

export async function editarReglaDura(formData: FormData): Promise<EstadoRegla> {
  const parsed = z
    .object({
      id: z.uuid(),
      clientId: z.uuid(),
      slug: slugSchema,
      rule: z
        .string()
        .trim()
        .min(1, 'Escribe la regla como se la dirías a alguien nuevo del equipo.')
        .max(500, 'La regla no puede pasar de 500 caracteres. Pártela en dos.'),
      severity: ruleSeverity,
    })
    .safeParse({
      id: formData.get('id'),
      clientId: formData.get('clientId'),
      slug: formData.get('slug'),
      rule: formData.get('rule'),
      severity: formData.get('severity'),
    })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa el formulario.' }
  }

  const { id, clientId, slug, rule, severity } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('brand_rules')
    .update({ rule, severity })
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id')

  if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { status: 'error', message: 'Esa regla ya no existe. Recarga la sección.' }
  }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Regla guardada.' }
}

export async function borrarReglaDura(formData: FormData): Promise<EstadoRegla> {
  const parsed = z
    .object({
      id: z.uuid(),
      clientId: z.uuid(),
      slug: slugSchema,
    })
    .safeParse({
      id: formData.get('id'),
      clientId: formData.get('clientId'),
      slug: formData.get('slug'),
    })

  if (!parsed.success) {
    return { status: 'error', message: 'No se pudo identificar la regla. Recarga la sección.' }
  }

  const { id, clientId, slug } = parsed.data
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('brand_rules')
    .delete()
    .eq('id', id)
    .eq('client_id', clientId)
    .select('id')

  if (error) return { status: 'error', message: `No se pudo borrar: ${error.message}` }
  if ((data ?? []).length === 0) {
    return { status: 'error', message: 'Esa regla ya no existe. Recarga la sección.' }
  }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Regla borrada.' }
}

export async function agregarReglaDura(formData: FormData): Promise<EstadoRegla> {
  const parsed = reglaSchema.safeParse({
    clientId: formData.get('clientId'),
    orgId: formData.get('orgId'),
    slug: formData.get('slug'),
    rule: formData.get('rule'),
    severity: formData.get('severity'),
    tipo: formData.get('tipo'),
    cantidad: formData.get('cantidad'),
    palabras: formData.get('palabras'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa el formulario.' }
  }

  const { clientId, orgId, slug, rule, severity, tipo, cantidad, palabras } = parsed.data

  const configuracion =
    tipo === 'hashtags_exact'
      ? {
          kind: 'hashtags',
          checkBy: 'codigo' as const,
          params: { kind: tipo, count: Number(cantidad) },
        }
      : tipo === 'lowercase'
        ? { kind: 'formato', checkBy: 'codigo' as const, params: { kind: tipo } }
        : tipo === 'banned_words'
          ? {
              kind: 'lexico',
              checkBy: 'codigo' as const,
              params: {
                kind: tipo,
                words: (palabras ?? '')
                  .split(',')
                  .map((p) => p.trim())
                  .filter(Boolean),
              },
            }
          : { kind: 'juicio', checkBy: 'modelo' as const, params: {} }

  // Segunda validación, contra el mismo esquema que usa el verificador. Si
  // esto falla, la regla entraría a la base para nunca poder evaluarse.
  if (configuracion.checkBy === 'codigo') {
    const params = codeRuleParams.safeParse(configuracion.params)
    if (!params.success) {
      return {
        status: 'error',
        message: 'Los parámetros de la regla no son válidos. Revisa la cantidad o las palabras.',
      }
    }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('brand_rules').insert({
    org_id: orgId,
    client_id: clientId,
    kind: configuracion.kind,
    rule,
    severity,
    check_by: configuracion.checkBy,
    params: configuracion.params,
  })

  if (error) {
    return { status: 'error', message: `No se pudo guardar la regla: ${error.message}` }
  }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Regla agregada. Aplica desde la próxima revisión.' }
}

/* ==========================================================================
   § PRIVADO — notas
   ========================================================================== */

export interface EstadoNota {
  status: 'guardada' | 'borrada' | 'error'
  message: string
}

const notaSchema = idsSchema.extend({
  // Sin id = nota nueva. `nullish` porque el hidden no existe en el formulario
  // de alta y FormData.get() devuelve null.
  id: z.uuid().nullish(),
  body: z
    .string()
    .trim()
    .min(1, 'Una nota vacía no se guarda. Escribe algo o bórrala.')
    .max(10_000, 'La nota llegó al tope de 10,000 caracteres.'),
})

/**
 * Guarda una nota, nueva o existente.
 *
 * `author_id` sale de `getUser()` y no del formulario: si viniera del cliente,
 * cualquiera podría escribir una nota "privada" a nombre de otra persona y
 * después leerla, porque la política de RLS filtra justo por ese campo.
 */
export async function guardarNotaPrivada(formData: FormData): Promise<EstadoNota> {
  const parsed = notaSchema.safeParse({
    id: formData.get('id'),
    clientId: formData.get('clientId'),
    orgId: formData.get('orgId'),
    slug: formData.get('slug'),
    body: formData.get('body'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa la nota.' }
  }

  const { id, clientId, orgId, slug, body } = parsed.data

  const { supabase, user } = await requireUser()

  if (id) {
    const { data, error } = await supabase
      .from('private_notes')
      .update({ body })
      .eq('id', id)
      .select('id')

    if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }

    // Cero renglones = la política no dejó pasar el update. Postgres no avisa.
    if ((data ?? []).length === 0) {
      return {
        status: 'error',
        message: 'Esa nota ya no existe o no es tuya. Recarga la sección.',
      }
    }

    refrescarCliente(slug)
    return { status: 'guardada', message: 'Nota guardada.' }
  }

  const { error } = await supabase.from('private_notes').insert({
    org_id: orgId,
    client_id: clientId,
    author_id: user.id,
    body,
  })

  if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Nota guardada.' }
}

const borrarSchema = z.object({ id: z.uuid(), slug: slugSchema })

export async function borrarNotaPrivada(formData: FormData): Promise<EstadoNota> {
  const parsed = borrarSchema.safeParse({
    id: formData.get('id'),
    slug: formData.get('slug'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'No se pudo identificar la nota. Recarga la sección.' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('private_notes')
    .delete()
    .eq('id', parsed.data.id)
    .select('id')

  if (error) return { status: 'error', message: `No se pudo borrar: ${error.message}` }

  if ((data ?? []).length === 0) {
    return { status: 'error', message: 'Esa nota ya no existe o no es tuya. Recarga la sección.' }
  }

  refrescarCliente(parsed.data.slug)
  return { status: 'borrada', message: 'Nota borrada.' }
}

/* ==========================================================================
   § MARCA — notas de marca
   ========================================================================== */

const notaMarcaSchema = idsSchema.extend({
  body: z.string().max(50_000, 'La nota llegó al tope de 50,000 caracteres.'),
})

export async function guardarNotaDeMarca(formData: FormData): Promise<EstadoNota> {
  const parsed = notaMarcaSchema.safeParse({
    clientId: formData.get('clientId'),
    orgId: formData.get('orgId'),
    slug: formData.get('slug'),
    body: formData.get('body'),
  })

  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Revisa la nota.' }
  }

  const { clientId, orgId, slug, body } = parsed.data
  const supabase = await createClient()

  const { data: existente } = await supabase
    .from('brand_notes')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (existente) {
    const { error } = await supabase.from('brand_notes').update({ body }).eq('id', existente.id)

    if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }
  } else {
    const { error } = await supabase.from('brand_notes').insert({
      org_id: orgId,
      client_id: clientId,
      body,
    })

    if (error) return { status: 'error', message: `No se pudo guardar: ${error.message}` }
  }

  refrescarCliente(slug)
  return { status: 'guardada', message: 'Nota de marca guardada.' }
}
