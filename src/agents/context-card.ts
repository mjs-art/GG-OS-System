import type { SupabaseClient } from '@supabase/supabase-js'
import type { ContextCard, PreguntaFrecuente } from '@/lib/datos/secciones'
import type { Database, Json } from '@/lib/supabase/database.types'

/**
 * Convierte el Context Card en el texto que va al system prompt del agente.
 *
 * Es la memoria del cliente hecha instrucción. Se renderiza aparte (y no dentro
 * del proveedor) porque el runner recibe el Context Card ya como `string`: así
 * la lógica de "con qué contexto corrió" es la misma sin importar el proveedor,
 * y la versión que se registra en `agent_runs` corresponde exactamente a este
 * texto.
 *
 * Solo se incluyen las secciones que traen contenido: un encabezado vacío en el
 * prompt es ruido que el modelo interpreta como "no hay nada que decir aquí".
 */
export function renderContextCard(card: ContextCard): string {
  const bloques: string[] = []
  const linea = (titulo: string, valor: string | null) => {
    if (valor && valor.trim() !== '') bloques.push(`## ${titulo}\n${valor.trim()}`)
  }
  const lista = (titulo: string, valores: readonly string[]) => {
    if (valores.length > 0) bloques.push(`## ${titulo}\n${valores.map((v) => `- ${v}`).join('\n')}`)
  }

  bloques.push(`# Contexto de marca (versión ${card.version})`)
  linea('Qué es', card.whatItIs)
  linea('Posicionamiento', card.positioning)
  linea('A quién le habla', card.audience)
  lista('Tono', card.tone)
  lista('Diferenciadores', card.differentiators)
  lista('Palabras prohibidas', card.bannedWords)
  lista('Ejemplos aprobados', card.approvedExamples)
  linea('Cadencia', card.cadence)

  if (card.faqs.length > 0) {
    const faqs = card.faqs.map((f) => `- P: ${f.pregunta}\n  R: ${f.respuesta}`).join('\n')
    bloques.push(`## Preguntas frecuentes\n${faqs}`)
  }

  return bloques.join('\n\n')
}

/** Las FAQs viven en jsonb; se leen sin confiar en su forma. */
function leerFaqs(valor: Json): PreguntaFrecuente[] {
  if (!Array.isArray(valor)) return []
  return valor.flatMap((item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const o = item as Record<string, unknown>
      if (typeof o['pregunta'] === 'string' && typeof o['respuesta'] === 'string') {
        return [{ pregunta: o['pregunta'], respuesta: o['respuesta'] }]
      }
    }
    return []
  })
}

/**
 * Carga la última versión del Context Card de un cliente. Lo usan los
 * compositores de agentes, que ya leen con el cliente admin porque la ruta
 * autorizó antes. Devuelve `null` si el cliente todavía no tiene memoria de
 * marca — el compositor decide qué hacer con eso.
 */
export async function cargarContextCard(
  admin: SupabaseClient<Database>,
  clientId: string,
): Promise<ContextCard | null> {
  const { data: card } = await admin
    .from('context_card_versions')
    .select(
      'id, version, what_it_is, positioning, differentiators, faqs, audience, tone, banned_words, approved_examples, cadence, created_at',
    )
    .eq('client_id', clientId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!card) return null

  return {
    id: card.id,
    version: card.version,
    whatItIs: card.what_it_is,
    positioning: card.positioning,
    differentiators: card.differentiators ?? [],
    faqs: leerFaqs(card.faqs),
    audience: card.audience,
    tone: card.tone ?? [],
    bannedWords: card.banned_words ?? [],
    approvedExamples: card.approved_examples ?? [],
    cadence: card.cadence,
    createdAt: card.created_at,
  }
}
