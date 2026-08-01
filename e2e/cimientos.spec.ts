import { expect, test, type Page } from '@playwright/test'
import { TEMA_COOKIE } from '../src/domain/tema'

/** #1B1717, el negro cálido oficial: el fondo del tema oscuro. */
const OSCURO = 'rgb(27, 23, 23)'
/** #EDEBDD, el crema oficial: el fondo del tema claro. */
const CLARO = 'rgb(237, 235, 221)'

/**
 * Se mide en `html` y no en `body`: cuando el html es transparente el
 * navegador propaga el fondo del body al lienzo, y WebKit deja entonces el
 * body reportando rgba(0,0,0,0). En html el valor es el mismo en los dos
 * motores.
 */
const fondo = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)

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
  //
  // Se ancla al form que contiene el campo de correo y no a `form` a secas:
  // el switch de tema también es un form (a propósito, para no mandar
  // JavaScript al cliente) y un selector suelto se vuelve ambiguo.
  await page
    .locator('form')
    .filter({ has: page.getByLabel('Correo') })
    .evaluate((form) => form.setAttribute('novalidate', 'true'))
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
  // Sin cookie de tema, el default es oscuro.
  expect(await fondo(page)).toBe(OSCURO)

  // El display es serif. Antes esta aserción pedía `text-transform: uppercase`
  // porque el display era Archivo expandida en caps; con la tipografía de Ana
  // dejó de ser mayúsculas, así que ahora se afirma la familia — que es lo que
  // de verdad distingue "cargaron los tokens" de "la app se ve genérica".
  const heading = page.getByRole('heading', { name: 'Studio OS', level: 1 })
  await expect(heading).toHaveCSS('font-family', /Instrument Serif/)

  // Y el body es la Helvetica del sistema, sin descargar nada.
  const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(bodyFont).toMatch(/Helvetica/)
})

test('el switch cambia el tema y la preferencia sobrevive la navegación', async ({ page }) => {
  await page.goto('/entrar')
  expect(await fondo(page)).toBe(OSCURO)

  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro')
  expect(await fondo(page)).toBe(CLARO)

  // La preferencia es una cookie, no estado de React: tiene que seguir puesta
  // después de una carga completa desde el servidor.
  await page.reload()
  expect(await fondo(page)).toBe(CLARO)

  // Y de regreso.
  await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro')
  expect(await fondo(page)).toBe(OSCURO)
})

test('el tema se resuelve en el servidor: no hay pintado con el tema equivocado', async ({
  page,
  baseURL,
  context,
}) => {
  await context.addCookies([{ name: TEMA_COOKIE, value: 'claro', url: baseURL ?? '' }])

  // `domcontentloaded` y no `load`: se mira el HTML tal como llegó, antes de
  // que la app corra JavaScript. Si el atributo se pusiera desde el cliente,
  // aquí todavía no estaría — y eso es exactamente el flashazo.
  await page.goto('/entrar', { waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'claro')
})

test('una cookie de tema con basura cae al default, no se escribe en el DOM', async ({
  page,
  baseURL,
  context,
}) => {
  await context.addCookies([{ name: TEMA_COOKIE, value: 'sepia"><script>', url: baseURL ?? '' }])

  await page.goto('/entrar')

  await expect(page.locator('html')).toHaveAttribute('data-tema', 'oscuro')
  expect(await fondo(page)).toBe(OSCURO)
})

test('cada tema tiene su propio color de foco', async ({ page, baseURL, context }) => {
  // El rojo oficial #810100 da 1.6:1 sobre el negro oficial #1B1717: como
  // anillo de foco en tema oscuro es invisible, y WCAG pide 3:1. Por eso el
  // tema oscuro usa un rojo derivado más claro y el claro sí usa uno oficial.
  // Esta prueba es lo que impide que alguien lo "corrija" de regreso al color
  // de marca sin darse cuenta de que rompe la accesibilidad.
  //
  // Se compara en hex y no en rgb() porque una custom property se devuelve tal
  // como está escrita en el CSS: el navegador no la resuelve hasta que se usa.
  const esperado = {
    oscuro: '#c9382b', // derivado, para alcanzar 3:1 sobre el negro
    claro: '#630000', // oficial, 11:1 sobre el crema
  } as const

  for (const tema of ['oscuro', 'claro'] as const) {
    await context.clearCookies()
    await context.addCookies([{ name: TEMA_COOKIE, value: tema, url: baseURL ?? '' }])
    await page.goto('/entrar')

    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent-hot').trim(),
    )
    expect(color, `--color-accent-hot en tema ${tema}`).toBe(esperado[tema])
  }
})

test('el botón primario se lee en los dos temas', async ({ page, baseURL, context }) => {
  // Regresión de verdad: el botón primario usaba `text-fg`, que en tema claro
  // es casi negro. Sobre el rojo oscuro del fondo quedaba ilegible y ninguna
  // prueba lo notaba — se descubrió mirando una captura. Por eso existe el
  // token `on-accent`, que es el mismo crema en los dos temas.
  for (const tema of ['oscuro', 'claro'] as const) {
    await context.clearCookies()
    await context.addCookies([{ name: TEMA_COOKIE, value: tema, url: baseURL ?? '' }])
    await page.goto('/entrar')

    const boton = page.getByRole('button', { name: 'Mandar link' })
    await expect(boton, `color del texto en tema ${tema}`).toHaveCSS('color', 'rgb(237, 235, 221)')
    await expect(boton, `fondo en tema ${tema}`).toHaveCSS('background-color', 'rgb(129, 1, 0)')
  }
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
