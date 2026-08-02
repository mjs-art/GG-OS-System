import { expect, test, type Page } from '@playwright/test'

/**
 * El login de verdad, de punta a punta.
 *
 * No usa la API de admin para generar el link: eso produce un link de flujo
 * implícito (token en el fragmento) que NO es el que recibe un usuario real, y
 * probarlo así daría un falso negativo. Aquí se llena el formulario, se saca el
 * correo de Mailpit y se abre ese link en el MISMO contexto de navegador —
 * que es lo que importa, porque el verificador de PKCE vive en una cookie de
 * ese contexto.
 *
 * Es la prueba más valiosa del repo: si el login se rompe, no hay app.
 */
const MAILPIT = 'http://127.0.0.1:54324'

async function ultimoLinkPara(correo: string): Promise<string> {
  // Reintenta: el correo tarda unos milisegundos en llegar a Mailpit y sin
  // esto la prueba falla una de cada tantas por puro tiempo.
  let messages: Array<{ ID: string; Created: string }> = []
  for (let intento = 0; intento < 20 && messages.length === 0; intento++) {
    const lista = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`,
    )
    ;({ messages } = (await lista.json()) as { messages: typeof messages })
    if (messages.length === 0) await new Promise((r) => setTimeout(r, 250))
  }

  // El más reciente. No se confía en el orden que devuelva la API.
  const id = [...messages].sort((a, b) => b.Created.localeCompare(a.Created))[0]?.ID
  if (!id) throw new Error(`No llegó ningún correo a ${correo}`)

  const cuerpo = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text?: string
    HTML?: string
  }
  const texto = `${cuerpo.Text ?? ''}${cuerpo.HTML ?? ''}`
  const link = texto.match(/https?:\/\/[^\s"'<>]+/g)?.find((u) => u.includes('/auth/v1/verify'))
  if (!link) throw new Error(`El correo no traía link de verificación: ${texto.slice(0, 300)}`)
  return link.replaceAll('&amp;', '&')
}

/**
 * Cada prueba usa su propio correo.
 *
 * Vaciar Mailpit al empezar parecía más simple, pero las pruebas corren en
 * paralelo: dos que comparten buzón se borran el correo entre ellas y el link
 * llega ya consumido. El síntoma es un `otp_expired` intermitente que parece
 * un bug de la app y no lo es.
 */
async function entrar(page: Page, correo: string) {
  await page.goto('/entrar')
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByLabel('Correo').fill(correo)
  await page.getByRole('button', { name: 'Mandar link' }).click()
  await expect(page.getByText('Revisa tu correo')).toBeVisible()

  await page.goto(await ultimoLinkPara(correo))
  await page.waitForLoadState('networkidle')
}

test('el magic link deja la sesión abierta', async ({ page }) => {
  await entrar(page, 'ana@ejemplo.test')

  await expect(page).not.toHaveURL(/\/entrar/)
  await expect(page).not.toHaveURL(/link_invalido/)
})

test('con sesión, las pantallas del estudio cargan de verdad', async ({ page }) => {
  await entrar(page, 'equipo@ejemplo.test')

  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
  // Que exista el cliente del seed prueba que RLS le da acceso a Ana.
  await expect(page.getByText('Bar Ficticio')).toBeVisible()

  await page.goto('/calendario?mes=2026-09')
  await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeVisible()

  await page.goto('/cliente/bar-ficticio?mes=2026-09')
  await expect(page.getByRole('heading', { name: 'Bar Ficticio', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resumen', level: 2 })).toBeVisible()
})
