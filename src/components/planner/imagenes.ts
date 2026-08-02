/**
 * La imagen de cada tile del grid.
 *
 * Todavía no hay subida de archivos: el campo `asset_status` solo dice
 * "pendiente" o "recibido". Mientras tanto el grid necesita verse como se va a
 * ver —un feed de Instagram, no una cuadrícula de cajas grises— porque la
 * pregunta que responde esta vista es "¿cómo se ve el mes de un vistazo?".
 *
 * La foto se elige por el id de la pieza, no al azar: si cambiara en cada
 * render, arrastrar una pieza se vería como si la imagen se hubiera
 * reemplazado, que es justo lo contrario de lo que el gesto significa.
 *
 * El día que haya assets reales, este módulo se sustituye por la URL de
 * Supabase Storage y nada más cambia.
 */

/** Fotos de Unsplash: barra oscura, coctelería, luz cálida, jazz. */
const FOTOS = [
  'photo-1514933651103-005eec06c04b',
  'photo-1470337458703-46ad1756a187',
  'photo-1551024709-8f23befc6f87',
  'photo-1536935338788-846bb9981813',
  'photo-1517620430776-0ec904756579',
  'photo-1493225457124-a3eb161ffa5f',
  'photo-1566417713940-fe7c737a9ef2',
  'photo-1572116469696-31de0f17cc34',
  'photo-1514362545857-3bc16c4c7d1b',
  'photo-1543007630-9710e4a00a20',
  'photo-1585699324551-f6c309eedeca',
  'photo-1470225620780-dba8ba36b745',
] as const

/** Hash estable y barato. No es criptografía: solo tiene que ser determinista. */
function huella(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function imagenDePieza(pieceId: string): string {
  const foto = FOTOS[huella(pieceId) % FOTOS.length] ?? FOTOS[0]
  return `https://images.unsplash.com/${foto}?auto=format&fit=crop&w=640&h=640&q=60`
}
