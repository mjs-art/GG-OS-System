/**
 * El caption de una pieza, armado como lo muestra Instagram.
 *
 * Una pieza guarda su texto repartido en varios campos —hook, copy de entrada,
 * copy de salida, CTA, hashtags— porque así se revisa y se edita por partes.
 * Pero el cliente (y Ana, en el preview) quiere ver el post como se va a
 * publicar: un solo bloque de texto. Esta función es ese ensamblado, y vive en
 * `domain` porque es la clase de regla que se prueba una vez y se confía: el
 * orden de los campos es una decisión de producto, no de presentación.
 *
 * El orden es el de Instagram: primero el gancho, luego el cuerpo, luego el
 * llamado a la acción, y los hashtags al final —separados por una línea en
 * blanco, como se acostumbra— para que no se mezclen con la prosa.
 */

export interface CaptionInput {
  hook: string | null
  copyIn: string | null
  copyOut: string | null
  cta: string | null
  hashtags: readonly string[]
}

/** Un `#` por hashtag, sin duplicar el que ya lo trae. */
function conNumeral(tag: string): string {
  const limpio = tag.trim().replace(/^#+/, '')
  return `#${limpio}`
}

export function componerCaption(pieza: CaptionInput): string {
  const bloques: string[] = []

  // Prosa: hook, copys y CTA en orden, saltando los vacíos. Un campo en null o
  // en blanco no debe dejar una línea vacía de más.
  for (const campo of [pieza.hook, pieza.copyIn, pieza.copyOut, pieza.cta]) {
    const texto = campo?.trim()
    if (texto) bloques.push(texto)
  }

  const cuerpo = bloques.join('\n\n')

  const tags = pieza.hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .map(conNumeral)
    .join(' ')

  // Los hashtags van tras una línea en blanco, pero solo si hay prosa arriba:
  // un caption de puros hashtags no debe empezar con un salto de línea.
  if (!tags) return cuerpo
  if (!cuerpo) return tags
  return `${cuerpo}\n\n${tags}`
}
