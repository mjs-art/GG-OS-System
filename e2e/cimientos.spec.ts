import { expect, test } from '@playwright/test'

/**
 * Humo de la etapa 0.
 *
 * No prueba features — todavía no hay. Prueba que los cimientos que el resto
 * del sistema da por hechos existen de verdad: las rutas privadas están
 * cerradas, las cabeceras de seguridad salen, la app no se indexa y el sistema
 * de diseño cargó.
 *
 * Estas aserciones son baratas y atrapan regresiones que nadie nota a ojo:
 * una CSP que se rompió al agregar un script, un noindex que se perdió, un
 * proxy que dejó de proteger.
 */

test('sin sesión, la bandeja no se abre', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveURL(/\/entrar/)
  // Y conserva a dónde iba, para regresar ahí después de entrar.
  await expect(page).toHaveURL(/destino=/)
})

test('la pantalla de acceso pide correo y no contraseña', async ({ page }) => {
  await page.goto('/entrar')

  await expect(page.getByRole('heading', { name: 'Studio OS', level: 1 })).toBeVisible()
  await expect(page.getByLabel('Correo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mandar link' })).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('un correo mal escrito no manda nada y lo dice', async ({ page }) => {
  await page.goto('/entrar')

  // novalidate para saltarnos la validación del navegador y ejercitar la del
  // servidor, que es la que de verdad importa.
  await page.locator('form').evaluate((form) => form.setAttribute('novalidate', 'true'))
  await page.getByLabel('Correo').fill('esto-no-es-correo')
  await page.getByRole('button', { name: 'Mandar link' }).click()

  await expect(page.getByRole('alert')).toBeVisible()
})

test('las cabeceras de seguridad están puestas', async ({ page }) => {
  const response = await page.goto('/entrar')
  const headers = response?.headers() ?? {}

  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).toContain("object-src 'none'")
  expect(headers['x-powered-by']).toBeUndefined()
})

test('no se indexa', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('el sistema de diseño cargó', async ({ page }) => {
  await page.goto('/entrar')

  // Fondo negro cálido, no negro puro. Si esto falla es que los tokens no
  // llegaron y toda la app se ve genérica.
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(background).toBe('rgb(18, 17, 16)')

  const heading = page.getByRole('heading', { name: 'Studio OS', level: 1 })
  await expect(heading).toHaveCSS('text-transform', 'uppercase')
})

test('el foco se ve al navegar con teclado', async ({ page }) => {
  await page.goto('/entrar')
  await page.getByLabel('Correo').focus()

  const outline = await page.evaluate(() => {
    const el = document.activeElement
    return el ? getComputedStyle(el).outlineStyle : null
  })

  expect(outline).not.toBe('none')
})
