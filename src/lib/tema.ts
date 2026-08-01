import { cookies } from 'next/headers'
import { resolverTema, TEMA_COOKIE, type Tema } from '@/domain/tema'

/**
 * Lectura del tema desde la petición. El único IO del asunto; las reglas
 * viven en `@/domain/tema`.
 */
export async function leerTema(): Promise<Tema> {
  const store = await cookies()
  return resolverTema(store.get(TEMA_COOKIE)?.value)
}
