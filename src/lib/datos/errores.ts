import type { PostgrestError } from '@supabase/supabase-js'

/**
 * ¿El error es de la sesión, o de nosotros?
 *
 * Importa distinguirlo porque el remedio es opuesto. Un error de esquema o de
 * red hay que verlo y arreglarlo, así que debe tronar fuerte. Un token que el
 * servidor todavía no acepta no es un bug de la app y tumbar la página entera
 * por eso es una reacción desproporcionada.
 *
 * El caso concreto que motivó esto: `JWT issued at future`. Postgres rechaza
 * un token cuyo `iat` va por delante de su reloj, y basta una fracción de
 * segundo de deriva entre el contenedor de auth y el de la base para que la
 * primera petición después de entrar falle. Se ve intermitente, se ve como si
 * la app estuviera rota, y no lo está. En producción el mismo riesgo existe
 * con cualquier deriva de reloj entre servicios.
 *
 * Lo que NO hace esta función: silenciar. Quien la usa sigue teniendo que
 * decidir qué mostrar, y el error se registra.
 */
export function esErrorDeSesion(error: PostgrestError | null): boolean {
  if (!error) return false

  // PGRST301 = JWT inválido o expirado. 42501 = privilegio insuficiente, que
  // es lo que devuelve RLS cuando el rol efectivo no es el que esperábamos.
  if (error.code === 'PGRST301' || error.code === '42501') return true

  return /jwt|token|issued at future|expired/i.test(error.message)
}
