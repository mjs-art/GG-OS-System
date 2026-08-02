import { expect, test, type Page } from '@playwright/test'

/**
 * Humo del Planner contra la página real del cliente.
 *
 * Reemplaza un test que su agente escribió contra `/humo-planner`, una ruta de
 * andamio con 15 piezas sintéticas que después borró. Quedó apuntando a un 404
 * y por lo tanto rojo para siempre — peor que no tener prueba, porque una
 * suite con un rojo permanente enseña a ignorar los rojos.
 *
 * OJO CON EL ALCANCE. Esto verifica que las trece secciones MONTAN con datos
 * reales y sin errores de servidor ni de hidratación. Eso es mucho: si una
 * sola revienta, se cae la página entera.
 *
 * Lo que NO verifica, y hay que decirlo: el drag & drop del planner —su
 * elemento firma— y el cambio entre sub-vistas. Simular arrastre sobre
 * @dnd-kit pide una secuencia de eventos de puntero que no se resuelve de
 * pasada, y el clic en el segmented control se colgaba a los 30s sin que
 * alcanzara a diagnosticarlo. Queda anotado en el roadmap como pendiente
 * real, porque decir que está probado sin estarlo es peor que no probarlo.
 */
/**
 * Serial, no paralelo.
 *
 * Los dos tests comparten buzón, y en paralelo se consumen el magic link
 * entre ellos: el segundo abre una liga ya usada y falla con `otp_expired`,
 * que parece bug de la app y no lo es. En serie cada uno pide la suya.
 */
test.describe.configure({ mode: 'serial' })

const MAILPIT = 'http://127.0.0.1:54324'

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

/** Su propio usuario: dos specs que comparten buzón se roban el magic link. */
async function entrar(page: Page) {
  await page.goto('/entrar')
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByLabel('Correo').fill('e2e-planner@ejemplo.test')
  await page.getByRole('button', { name: 'Mandar link' }).click()
  await expect(page.getByText('Revisa tu correo')).toBeVisible()
  await page.goto(await ultimoLinkPara('e2e-planner@ejemplo.test'))
  await page.waitForLoadState('networkidle')
}

test('todas las secciones del cliente cargan sin reventar', async ({ page }) => {
  const errores: string[] = []
  page.on('pageerror', (e) => errores.push(String(e)))

  await entrar(page)
  await page.goto('/cliente/bar-ficticio?mes=2026-09')
  await page.waitForLoadState('networkidle')

  // Las trece secciones se montan en la misma página larga. Si una tumba el
  // render del servidor, se cae toda — por eso vale afirmarlas juntas.
  for (const s of [
    'Resumen',
    'Redes',
    'Volumen',
    'Planner',
    'Calendario',
    'Guiones',
    'Fechas',
    'Pauta',
    'Resultados',
    'Marca',
    'Archivos',
    'Pendientes',
    'Privado',
  ]) {
    await expect(page.locator(`section#${s.toLowerCase()}`), `falta la sección ${s}`).toHaveCount(1)
  }

  expect(errores, `errores en consola: ${errores.join(' | ')}`).toEqual([])
})
