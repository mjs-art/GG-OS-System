'use server'

import { z } from 'zod'
import { extraerDatosDeMarca, type DatosDeMarcaExtraidos } from '@/domain/importar-notion-md'

const schema = z.object({
  content: z.string().min(1, 'El archivo está vacío.'),
})

export interface ResultadoParseoMd {
  status: 'ok' | 'error'
  message?: string
  datos?: DatosDeMarcaExtraidos
}

/**
 * Procesa el contenido de un archivo .md exportado de Notion y extrae los
 * datos de marca: nombre, qué es, pilares, audiencia, tono, diferenciadores
 * y color.
 *
 * El `content` ya viene leído del archivo por el navegador (FileReader).
 * Así evitamos subir el archivo al servidor y lo procesamos directo en la
 * Server Action.
 */
export async function procesarNotionMd(
  _prev: ResultadoParseoMd,
  formData: FormData,
): Promise<ResultadoParseoMd> {
  const parsed = schema.safeParse({
    content: formData.get('content'),
  })

  if (!parsed.success) {
    return { status: 'error', message: 'No se pudo leer el archivo. ¿Está vacío?' }
  }

  try {
    const datos = extraerDatosDeMarca(parsed.data.content)

    if (!datos.nombre) {
      return {
        status: 'error',
        message:
          'No se encontró el nombre de la marca en el archivo. Asegúrate de que el documento empiece con "# NOMBRE DE LA MARCA".',
      }
    }

    return { status: 'ok', datos }
  } catch {
    return {
      status: 'error',
      message: 'El archivo no se pudo procesar. Revisa que sea un .md exportado de Notion.',
    }
  }
}
