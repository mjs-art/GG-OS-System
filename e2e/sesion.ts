import { expect, type Page, type TestInfo } from '@playwright/test'

/**
 * Entrar con una sesión real: formulario, correo de Mailpit, liga abierta.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ EL CORREO SE DERIVA Y NO SE ESCRIBE A MANO
 *
 * Esto mordió cuatro veces antes de quedar así, siempre con el mismo disfraz:
 * un `otp_expired` intermitente que parece un bug de la app y no lo es.
 *
 * El magic link es de UN SOLO USO. Dos pruebas que comparten buzón corriendo
 * en paralelo se lo consumen entre ellas — y "en paralelo" incluye el mismo
 * spec corriendo en Chromium y en el proyecto móvil a la vez, que es el caso
 * que más costó ver porque cada proyecto pasa perfecto por separado.
 *
 * La solución es un buzón POR WORKER, no por spec.
 *
 * Playwright nunca corre dos pruebas en el mismo worker al mismo tiempo, así
 * que dos pruebas jamás comparten buzón — sin importar cuántos specs, cuántos
 * proyectos, ni en qué orden se ejecuten. Deja de depender de que alguien
 * recuerde inventar un correo nuevo cada vez que agrega una prueba.
 *
 * Los usuarios existen en `supabase/seed.sql`. Tienen que estar ahí: la app
 * pide el magic link con `shouldCreateUser: false`, así que GoTrue no crea
 * cuentas al vuelo — que es exactamente lo que queremos en producción.
 * ---------------------------------------------------------------------------
 */
const MAILPIT = 'http://127.0.0.1:54324'

/**
 * `e2e-w0@ejemplo.test` … `e2e-w15@ejemplo.test`
 *
 * El módulo importa: `workerIndex` NO está acotado al número de workers
 * concurrentes. Playwright levanta un worker nuevo —con índice nuevo— cada vez
 * que uno muere, así que en una corrida con reintentos los índices siguen
 * subiendo. Sin el módulo, la suite falla con "no llegó ningún correo a
 * e2e-w8@" en cuanto eso pasa, y el mensaje no apunta a la causa.
 *
 * Dieciséis buzones contra un tope de workers muy por debajo de eso: dos
 * índices que colisionan por el módulo no pueden estar vivos al mismo tiempo.
 */
const BUZONES = 16

export function correoDePrueba(info: TestInfo): string {
  return `e2e-w${info.workerIndex % BUZONES}@ejemplo.test`
}

async function ultimoLinkPara(correo: string): Promise<string> {
  let mensajes: Array<{ ID: string; Created: string }> = []

  // El correo tarda unos milisegundos en llegar. Se espera la condición, no un
  // tiempo fijo: un sleep suficiente hoy es insuficiente en una máquina lenta.
  for (let intento = 0; intento < 40 && mensajes.length === 0; intento++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)
    ;({ messages: mensajes } = (await r.json()) as { messages: typeof mensajes })
    if (mensajes.length === 0) await new Promise((res) => setTimeout(res, 250))
  }

  // El más reciente. No se confía en el orden que devuelva la API.
  const id = [...mensajes].sort((a, b) => b.Created.localeCompare(a.Created))[0]?.ID
  if (!id) throw new Error(`No llegó ningún correo a ${correo}`)

  const cuerpo = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text?: string
  }
  const link = (cuerpo.Text ?? '').match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/)?.[0]
  if (!link) throw new Error(`El correo a ${correo} no traía liga de verificación`)
  return link.replaceAll('&amp;', '&')
}

export async function entrarComoEstudio(page: Page, info: TestInfo): Promise<string> {
  const correo = correoDePrueba(info)

  await page.goto('/entrar')
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByLabel('Correo').fill(correo)
  await page.getByRole('button', { name: 'Mandar link' }).click()
  await expect(page.getByText('Revisa tu correo')).toBeVisible()

  await page.goto(await ultimoLinkPara(correo))
  await page.waitForLoadState('networkidle')

  return correo
}
