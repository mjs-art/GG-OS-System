/**
 * Deriva el slug de un cliente a partir de su nombre.
 *
 * El slug es la llave por URL (`/cliente/{slug}`) y la base lo restringe con un
 * CHECK: `^[a-z0-9]+(-[a-z0-9]+)*$` — minúsculas y dígitos separados por un solo
 * guion, sin guion al inicio ni al final. Esta función produce siempre algo que
 * cumple ese CHECK, o cadena vacía si el nombre no tiene ni una letra ni un
 * dígito aprovechable (ej. "···"). La cadena vacía la atrapa la validación de
 * arriba con un mensaje humano; aquí no adivinamos un slug de la nada.
 *
 * Los acentos y la ñ se pliegan a ASCII (María → maria, piña → pina) en vez de
 * borrarse: "Café Río" tiene que dar "cafe-rio", no "caf-ro".
 */
export function slugify(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      // Quita los diacríticos que NFD separó de su letra: rango de combining
      // marks U+0300–U+036F (tilde, acento, diéresis). La ñ = n + U+0303.
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Todo lo que no sea letra o dígito ASCII se vuelve frontera de guion.
      .replace(/[^a-z0-9]+/g, '-')
      // Sin guion colgando en las orillas.
      .replace(/^-+|-+$/g, '')
  )
}
