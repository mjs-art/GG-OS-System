/**
 * Convierte un enlace de Google Drive en una miniatura que sí se puede pintar.
 *
 * Un link de "compartir" de Drive (`.../file/d/ID/view`) es una página del
 * visor, no una imagen: puesto en un `<img>` sale roto. Drive expone la
 * miniatura del archivo en `/thumbnail?id=ID`, que sí es una imagen y respeta el
 * permiso "cualquiera con el enlace" que el estudio ya usa para compartir. Esto
 * saca el ID y arma esa URL.
 *
 * Pura y probada: las formas de URL de Drive son varias, y una regex floja o
 * saca el ID equivocado —y se muestra el archivo de otra pieza— o no lo saca y
 * el preview no aparece. Las dos fallas son caras y silenciosas.
 *
 * Solo Drive: cualquier otro enlace (Canva, Dropbox, una imagen directa) se
 * devuelve tal cual. No se inventa un preview para algo que no se sabe leer.
 */

const HOSTS_DRIVE = new Set(['drive.google.com', 'docs.google.com'])

/** Un ID de Drive es alfanumérico con guiones y guiones bajos, sin nada más. */
const ID_VALIDO = /^[A-Za-z0-9_-]+$/

export function idDeDrive(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (!HOSTS_DRIVE.has(parsed.hostname)) return null

  // Forma de ruta: /file/d/ID/view · /d/ID/edit · /document/d/ID/...
  const enRuta = parsed.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)
  if (enRuta?.[1]) return enRuta[1]

  // Forma de query: open?id=ID · uc?id=ID · thumbnail?id=ID
  const enQuery = parsed.searchParams.get('id')
  if (enQuery && ID_VALIDO.test(enQuery)) return enQuery

  return null
}

/** El ancho de la miniatura. Grande para que no se vea pixeleada en el grid. */
const ANCHO_MINIATURA = 1000

/** La URL de miniatura de un enlace de Drive, o `null` si no es de Drive. */
export function miniaturaDeDrive(url: string): string | null {
  const id = idDeDrive(url)
  if (!id) return null
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${ANCHO_MINIATURA}`
}

/**
 * La URL con la que se PINTA un enlace externo: la miniatura si es de Drive, el
 * enlace tal cual si no. El enlace original se guarda sin tocar; esto es solo
 * para mostrar.
 */
export function urlMostrableDeEnlace(url: string): string {
  return miniaturaDeDrive(url) ?? url
}
