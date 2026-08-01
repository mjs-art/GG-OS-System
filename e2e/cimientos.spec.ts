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
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByRole('button', { name: 'Mandar link' }).click()

  // Acotado a `main` porque Next inyecta su propio <next-route-announcer
  // role="alert"> para lectores de pantalla, y sin acotar el selector lo
  // cuenta como si fuera nuestro.
  const alerta = page.locator('main').getByRole('alert')

  // Se afirma el MENSAJE, no solo que exista una alerta.
  //
  // La versión anterior solo pedía `toBeVisible()` y pasó en verde mientras
  // producción estaba rota: un bug distinto —el campo `destino` ausente en una
  // visita directa— también pintaba una alerta. Una aserción que se conforma
  // con "hay un error" no distingue el error que buscas del que no sabías que
  // tenías.
  await expect(alerta).toHaveText(/correo/i)
  await expect(alerta).not.toHaveText(/invalid input|expected string|received/i)
})

test('se puede entrar llegando directo, sin destino en la URL', async ({ page }) => {
  // La regresión del bug que se escapó a producción.
  //
  // Llegar a /entrar escribiendo la URL es el camino más común, y es el único
  // en el que el campo oculto `destino` no existe. FormData.get() devuelve
  // null ahí, no undefined, y el schema lo rechazaba: el login quedaba muerto
  // justo por la puerta principal.
  await page.goto('/entrar')

  await expect(page.locator('input[name="destino"]')).toHaveCount(0)

  await page.getByLabel('Correo').fill('nadie@example.com')
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByRole('button', { name: 'Mandar link' }).click()

  // La respuesta es la misma exista o no el correo, para no filtrar quién
  // tiene acceso. Lo que importa aquí es que NO sea un error de validación.
  await expect(page.getByText('Revisa tu correo')).toBeVisible()
  await expect(page.locator('main').getByRole('alert')).toHaveCount(0)
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

  // Regresión: `upgrade-insecure-requests` sobre http rompe la app entera en
  // WebKit — reescribe los assets a https, el TLS falla contra un servidor
  // plano, y la página se queda sin CSS y sin JavaScript. Chromium exenta
  // localhost y por eso no se ve ahí. La directiva solo debe salir cuando de
  // verdad servimos por TLS.
  const overTls = new URL(page.url()).protocol === 'https:'
  if (overTls) {
    expect(headers['content-security-policy']).toContain('upgrade-insecure-requests')
  } else {
    expect(headers['content-security-policy']).not.toContain('upgrade-insecure-requests')
  }
})

test('no se indexa', async ({ page }) => {
  await page.goto('/entrar')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
})

test('el sistema de diseño cargó', async ({ page }) => {
  await page.goto('/entrar')

  // Fondo negro cálido, no negro puro. Si esto falla es que los tokens no
  // llegaron y toda la app se ve genérica.
  //
  // Se mide en `html` y no en `body`: cuando el html es transparente el
  // navegador propaga el fondo del body al lienzo, y WebKit deja entonces el
  // body reportando rgba(0,0,0,0). En html el valor es el mismo en los dos
  // motores.
  const background = await page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  )
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
