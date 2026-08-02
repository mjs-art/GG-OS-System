import type { ContextCard } from '@/lib/datos/secciones'

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
