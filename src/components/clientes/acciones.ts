'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { slugify } from '@/domain/slug'
import { crearCliente, type DatosDeMarcaAlCrear, type PilarNuevo } from '@/lib/datos/crear-cliente'
import { orgsDelUsuario } from '@/lib/datos/orgs'

/**
 * `EstadoAlta` puede vivir aquí aunque el módulo lleve `'use server'`: una
 * interfaz se borra al compilar. Una constante sí rompería (React entregaría
 * una referencia serializable en vez del valor).
 */
export interface EstadoAlta {
  status: 'inicial' | 'error'
  mensaje?: string
}

/** El mismo CHECK que la base: minúsculas y dígitos con guiones simples. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HEX = /^#[0-9a-fA-F]{6}$/

const pilar = z.object({
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(HEX),
  targetPct: z.number().min(0).max(100),
})

const entrada = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Ponle nombre al cliente.')
    .max(120, 'El nombre es larguísimo. Máximo 120 caracteres.'),
  // El slug se deriva del nombre si el campo viene vacío; si viene, se respeta.
  slug: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v ?? ''),
  handle: z
    .string()
    .trim()
    .max(120)
    .nullish()
    .transform((v) => (v && v !== '' ? v : null)),
  tier: z
    .string()
    .trim()
    .max(40)
    .nullish()
    .transform((v) => (v && v !== '' ? v : null)),
  brandColor: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v && v !== '' ? v : null))
    .refine(
      (v) => v === null || HEX.test(v),
      'El color de marca tiene que ser un hex de 6 dígitos. Elígelo con el selector.',
    ),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .nullish()
    .transform((v) => (v && v !== '' ? v : 'America/Tijuana')),
  orgId: z
    .string()
    .nullish()
    .transform((v) => (v && v !== '' ? v : null)),
  // Los pilares viajan como JSON: FormData es plano y son una lista de objetos.
  pilares: z
    .string()
    .nullish()
    .transform((valor, ctx): PilarNuevo[] => {
      if (!valor || valor.trim() === '') return []
      try {
        const crudo: unknown = JSON.parse(valor)
        return z.array(pilar).parse(crudo)
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'No se pudieron leer los pilares. Recarga la página e inténtalo otra vez.',
        })
        return z.NEVER
      }
    }),
  datosDeMarca: z
    .string()
    .nullish()
    .transform((v): DatosDeMarcaAlCrear | null => {
      if (!v || v.trim() === '') return null
      try {
        const crudo = JSON.parse(v) as unknown
        return z
          .object({
            queEs: z.string().nullable(),
            posicionamiento: z.string().nullable(),
            diferenciadores: z.array(z.string()),
            audiencia: z.string().nullable(),
            tono: z.array(z.string()),
            palabrasProhibidas: z.array(z.string()),
            cadencia: z.string().nullable(),
          })
          .parse(crudo)
      } catch {
        return null
      }
    }),
})

export async function crearClienteAccion(
  _prev: EstadoAlta,
  formData: FormData,
): Promise<EstadoAlta> {
  const parsed = entrada.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    handle: formData.get('handle'),
    tier: formData.get('tier'),
    brandColor: formData.get('brandColor'),
    timezone: formData.get('timezone'),
    orgId: formData.get('orgId'),
    pilares: formData.get('pilares'),
    datosDeMarca: formData.get('datosDeMarca'),
  })

  if (!parsed.success) {
    return { status: 'error', mensaje: parsed.error.issues[0]?.message ?? 'Revisa el formulario.' }
  }

  const datos = parsed.data
  const slug = datos.slug !== '' ? slugify(datos.slug) : slugify(datos.name)
  if (!SLUG.test(slug)) {
    return {
      status: 'error',
      mensaje:
        'El nombre no da para un identificador de URL. Escribe el slug a mano: minúsculas, números y guiones.',
    }
  }

  // Nombres de pilar repetidos: la base los rechaza (unique client_id, name),
  // pero atajarlo aquí evita crear el cliente y luego fallar en los pilares.
  const nombres = datos.pilares.map((p) => p.name.toLowerCase())
  if (new Set(nombres).size !== nombres.length) {
    return {
      status: 'error',
      mensaje: 'Dos pilares tienen el mismo nombre. Cada pilar del cliente tiene que ser único.',
    }
  }

  // La org NO se confía al formulario: se cruza contra las del usuario. Un slug
  // que viaja se puede editar; que el cliente cuelgue de una org ajena no.
  const orgs = await orgsDelUsuario()
  if (orgs.length === 0) {
    return { status: 'error', mensaje: 'No perteneces a ninguna organización. Habla con el owner.' }
  }
  const org = datos.orgId !== null ? orgs.find((o) => o.id === datos.orgId) : orgs[0]
  if (!org) {
    return { status: 'error', mensaje: 'Esa organización no es tuya. Vuelve a elegir.' }
  }

  const resultado = await crearCliente({
    orgId: org.id,
    slug,
    name: datos.name,
    handle: datos.handle,
    tier: datos.tier,
    brandColor: datos.brandColor,
    timezone: datos.timezone,
    pilares: datos.pilares,
    datosDeMarca: datos.datosDeMarca,
  })

  if (!resultado.ok) {
    // Si el cliente sí quedó creado (falló solo en los pilares), refresca la
    // lista: el mensaje le dice al usuario que lo abra desde ahí.
    if (resultado.clienteCreado) revalidatePath('/clientes')
    return { status: 'error', mensaje: resultado.mensaje }
  }

  revalidatePath('/clientes')
  // Al recién nacido: su ficha. `redirect` lanza, así que va al final y fuera
  // de cualquier try.
  redirect(`/cliente/${resultado.slug}`)
}
