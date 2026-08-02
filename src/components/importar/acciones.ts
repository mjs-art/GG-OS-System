'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ErrorDeImportacion } from '@/domain/csv'
import { construirPlanDeImportacion } from '@/domain/importar-notion'
import { contextoDeImportacion, escribirImportacion } from '@/lib/datos/importar'

/**
 * La única mutación del importador.
 *
 * La vista previa se calcula en el navegador —el mapeo es puro, así que es
 * instantáneo y no cuesta un viaje al servidor por cada tecla— pero aquí el
 * plan se **vuelve a calcular** desde el texto pegado. Lo que llega de un
 * formulario es lo que el navegador quiso mandar, y confiar en un plan que
 * viajó por la red sería dejar que el cliente decida qué se escribe en la base.
 *
 * `EstadoImportacion` sí puede vivir aquí aunque el módulo lleve `'use server'`:
 * una interfaz se borra al compilar, así que no queda un export que no sea
 * función asíncrona. Una constante sí rompería.
 */

/** 4 MB de texto pegado. Un mes de un cliente son kilobytes. */
const MAX_CARACTERES = 4_000_000

const entrada = z.object({
  slug: z.string().min(1).max(120),
  texto: z
    .string()
    .min(1, 'Pega primero el CSV que exportaste de Notion.')
    .max(MAX_CARACTERES, 'El pegado es enorme. Impórtalo por partes.'),
  /**
   * Nombre de Notion → uuid del usuario del estudio. Viaja como JSON porque
   * `FormData` es plano y el mapa tiene tantas llaves como personas haya.
   */
  asignaciones: z
    .string()
    .nullish()
    .transform((valor, ctx) => {
      if (!valor || valor.trim() === '') return {}
      try {
        const crudo: unknown = JSON.parse(valor)
        return z.record(z.string().min(1), z.uuid()).parse(crudo)
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'No se pudo leer el empate de personas. Recarga la página e inténtalo otra vez.',
        })
        return z.NEVER
      }
    }),
  // `FormData.get()` devuelve null cuando la casilla no está marcada, no
  // undefined. Por eso `.nullish()` y no `.optional()`.
  aceptaDuplicar: z
    .string()
    .nullish()
    .transform((v) => v === 'on'),
})

export interface EstadoImportacion {
  status: 'inicial' | 'importado' | 'error'
  mensaje?: string
  errores?: ErrorDeImportacion[]
}

export async function importarDesdeNotion(
  _prev: EstadoImportacion,
  formData: FormData,
): Promise<EstadoImportacion> {
  const parsed = entrada.safeParse({
    slug: formData.get('slug'),
    texto: formData.get('texto'),
    asignaciones: formData.get('asignaciones'),
    aceptaDuplicar: formData.get('aceptaDuplicar'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      mensaje: parsed.error.issues[0]?.message ?? 'Revisa lo que pegaste.',
    }
  }

  const { slug, texto, asignaciones, aceptaDuplicar } = parsed.data

  const contexto = await contextoDeImportacion(slug)
  if (!contexto) {
    return { status: 'error', mensaje: 'No se encontró el cliente. Vuelve a abrir la página.' }
  }

  const plan = construirPlanDeImportacion(texto)
  if (!plan.ok) {
    return {
      status: 'error',
      mensaje: 'El archivo cambió o trae renglones que no se pueden mapear. No se escribió nada.',
      errores: plan.errores,
    }
  }

  /* --- Los meses que ya tienen piezas ------------------------------------- */

  const yaPoblados = plan.meses.filter((mes) => (contexto.piezasPorMes[mes] ?? 0) > 0)
  if (yaPoblados.length > 0 && !aceptaDuplicar) {
    return {
      status: 'error',
      mensaje:
        `Ya hay piezas en ${yaPoblados.join(', ')}. Esta importación AGREGA, no reemplaza: ` +
        'si el mes ya se importó, quedaría duplicado. Marca la casilla para hacerlo de todos modos.',
    }
  }

  /* --- Las personas empatadas tienen que ser del estudio ------------------- */

  const delEstudio = new Set(contexto.miembros.map((m) => m.userId))
  const intrusos = Object.entries(asignaciones).filter(([, id]) => !delEstudio.has(id))
  if (intrusos.length > 0) {
    // La base también lo impide (`pieces_assignee_guard`), pero un mensaje que
    // nombra a la persona se arregla en diez segundos y una excepción de
    // Postgres no.
    return {
      status: 'error',
      mensaje: `${intrusos.map(([nombre]) => nombre).join(', ')} quedó empatada con alguien que no es del estudio. Vuelve a elegir.`,
    }
  }

  /* --- Escribir ------------------------------------------------------------ */

  const resultado = await escribirImportacion({
    clientId: contexto.clientId,
    orgId: contexto.orgId,
    piezas: plan.piezas,
    stories: plan.stories,
    sprints: plan.sprints,
    asignaciones,
  })

  if (!resultado.ok) return { status: 'error', mensaje: resultado.mensaje }

  revalidatePath(`/cliente/${contexto.slug}`)

  const { piezas, stories, sprintsCreados } = resultado.resultado
  const partes = [`${piezas} ${piezas === 1 ? 'pieza' : 'piezas'}`]
  if (stories > 0) partes.push(`${stories} ${stories === 1 ? 'story' : 'stories'}`)
  if (sprintsCreados > 0) {
    partes.push(`${sprintsCreados} ${sprintsCreados === 1 ? 'sprint nuevo' : 'sprints nuevos'}`)
  }

  return {
    status: 'importado',
    mensaje: `Listo. Se importaron ${partes.join(', ')}. Studio OS ya es la fuente de verdad de ${contexto.nombre}: lo que se edite en Notion a partir de ahora no llega aquí.`,
  }
}
