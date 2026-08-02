import { expect, test, type Locator, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const MAILPIT = 'http://127.0.0.1:54324'
const CORREO = 'e2e-arrastre@ejemplo.test'

async function ultimoLinkPara(correo: string): Promise<string> {
  let messages: Array<{ ID: string; Created: string }> = []
  for (let i = 0; i < 40 && messages.length === 0; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}`)
    ;({ messages } = (await r.json()) as { messages: typeof messages })
    if (messages.length === 0) await new Promise((res) => setTimeout(res, 250))
  }
  const id = [...messages].sort((a, b) => b.Created.localeCompare(a.Created))[0]?.ID
  if (!id) throw new Error(`No llegó correo a ${correo}`)
  const cuerpo = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
    Text?: string
  }
  const link = (cuerpo.Text ?? '').match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]*/)?.[0]
  if (!link) throw new Error('El correo no traía link de verificación')
  return link.replaceAll('&amp;', '&')
}

async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByLabel('Correo').fill(CORREO)
  await page.getByRole('button', { name: 'Mandar link' }).click()
  await expect(page.getByText('Revisa tu correo')).toBeVisible()
  await page.goto(await ultimoLinkPara(CORREO))
  await page.waitForLoadState('networkidle')
}

interface Tile {
  hook: string
  fecha: string
  amarrada: boolean
}

function tiles(page: Page): Locator {
  return page.locator('section#planner').getByRole('button', { name: /^(Post|Carrusel|Reel) del / })
}

async function leerGrid(page: Page): Promise<Tile[]> {
  return page.evaluate(() => {
    const seccion = document.querySelector('section#planner')
    if (!seccion) return []
    return [...seccion.querySelectorAll('button[aria-label]')].flatMap((b) => {
      const m = /^(?:Post|Carrusel|Reel) del (.+?): ([\s\S]+)$/.exec(
        b.getAttribute('aria-label') ?? '',
      )
      return m && m[1] && m[2]
        ? [{ fecha: m[1], hook: m[2], amarrada: (b.textContent ?? '').includes('Fecha fija') }]
        : []
    })
  })
}

test('exploración', async ({ page }) => {
  test.setTimeout(120_000)
  await entrar(page)
  await page.goto('/cliente/bar-ficticio?mes=2026-09')
  await page.waitForLoadState('networkidle')

  const estado = await leerGrid(page)
  console.warn('GRID:', JSON.stringify(estado, null, 1))
  console.warn('tiles count', await tiles(page).count())

  const grupo = page
    .locator('section#planner')
    .getByRole('group', { name: 'Qué pasa al soltar una pieza sobre otra' })
  console.warn('grupo count', await grupo.count())
  const t0 = Date.now()
  await grupo.getByRole('button', { name: 'Insertar y correr' }).click({ timeout: 10_000 })
  console.warn('click tardó', Date.now() - t0)
  await expect(grupo.getByRole('button', { name: 'Insertar y correr' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
