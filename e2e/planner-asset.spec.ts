import { entrarComoEstudio } from './sesion'
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
  type TestInfo,
} from '@playwright/test'

/**
 * La imagen de la pieza y los tres campos que el uso real exige.
 *
 * Lo que se prueba aquí no se puede probar con lógica pura ni con pgTAP,
 * porque son tres sistemas hablándose:
 *
 *   1 · el servidor calcula la ruta del bucket y firma el permiso de subida,
 *   2 · el NAVEGADOR sube el archivo contra esa ruta firmada,
 *   3 · el servidor registra la fila y devuelve una URL firmada de lectura,
 *   4 · el tile pinta esa URL.
 *
 * Si cualquiera de los cuatro se equivoca —la ruta, la política de Storage, el
 * CHECK de `asset_url`, el CSP— el síntoma es el mismo: un tile gris. Por eso
 * se verifica el resultado visible y además que sobreviva una recarga.
 *
 * Igual que `planner-arrastre.spec.ts`: motor de WebKit sí, tamaño de iPhone
 * no. A 390px el grid del Planner mide cero (bug PRO-9, ya reportado).
 */
test.describe.configure({ mode: 'serial' })
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

const CLIENTE = '/cliente/bar-ficticio?mes=2026-09'

/**
 * Un PNG de 1×1 rojo. No importa qué se ve: importa que el bucket lo acepte
 * como `image/png` y que llegue de vuelta con una firma que el navegador pueda
 * pedir.
 */
const PNG_ROJO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * Una pieza distinta por proyecto.
 *
 * Chromium y el proyecto móvil corren a la vez contra la MISMA base. Si los dos
 * subieran y quitaran la imagen de la misma pieza, uno borraría lo que el otro
 * acaba de afirmar, y el error apuntaría al código en vez de a la corrida
 * vecina. Ninguna de las dos está amarrada, así que `planner-arrastre` las
 * puede reordenar sin que a esta prueba le importe: aquí nadie mira las fechas.
 */
const PIEZA_POR_PROYECTO: Record<string, string> = {
  chromium: 'tres formas de arruinar un old fashioned',
  mobile: 'la barra a las 6 y a las 9:40',
}

function hookDePrueba(info: TestInfo): string {
  const hook = PIEZA_POR_PROYECTO[info.project.name]
  if (!hook) throw new Error(`Falta asignarle una pieza al proyecto ${info.project.name}`)
  return hook
}

type Galleta = Awaited<ReturnType<BrowserContext['cookies']>>[number]

let galletas: Galleta[] | null = null

/** Ver la nota de `planner-arrastre.spec.ts`: GoTrue limita los accesos por IP. */
async function abrirElPlanner(page: Page, info: TestInfo): Promise<void> {
  if (galletas) await page.context().addCookies(galletas)
  else {
    await entrarComoEstudio(page, info)
    galletas = await page.context().cookies()
  }

  await page.goto(CLIENTE)
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await expect(tile(page, hookDePrueba(info))).toBeVisible()
}

function grid(page: Page): Locator {
  return page.locator('section#planner')
}

function tile(page: Page, hook: string): Locator {
  return grid(page).getByRole('button', { name: hook })
}

function drawer(page: Page): Locator {
  return page.getByRole('dialog')
}

/** Abre el detalle de la pieza de este proyecto. */
async function abrirLaPieza(page: Page, info: TestInfo): Promise<void> {
  await tile(page, hookDePrueba(info)).click()
  await expect(drawer(page)).toBeVisible()
}

/**
 * Hace algo y espera a que el Server Action CONTESTE.
 *
 * La interfaz es optimista: el campo se ve guardado en cuanto se suelta, mucho
 * antes de que la base lo sepa. Recargar ahí aborta el POST en vuelo y la
 * escritura se pierde a veces — el clásico "pasa en mi máquina y falla una de
 * cada cinco". Sin esta espera, esta prueba mediría el estado de React y no lo
 * que quedó escrito, que es justo lo que vino a comprobar.
 *
 * `cuantos` porque un gesto puede disparar más de una escritura: crear un
 * sprint son dos, el sprint y la pieza que lo estrena.
 */
async function guardando(page: Page, accion: () => Promise<void>, cuantos = 1): Promise<void> {
  /*
   * Se CUENTAN las respuestas con un escucha, en vez de encadenar N
   * `waitForResponse`.
   *
   * Eso último fue el primer intento y es una trampa fina: dos esperas
   * idénticas no se reparten las respuestas, las DOS se resuelven con la
   * primera que llega. Así, "espera dos escrituras" regresaba en cuanto
   * contestaba la primera, la prueba recargaba, y el segundo Server Action se
   * abortaba en vuelo. El síntoma era un sprint que se creaba y no se le ponía
   * a la pieza — un bug de la prueba que se veía exactamente como uno de la app.
   */
  const respuestas: number[] = []
  const contar = (r: Response) => {
    if (r.request().method() === 'POST' && r.url().includes('/cliente/bar-ficticio')) {
      respuestas.push(r.status())
    }
  }

  page.on('response', contar)
  try {
    await accion()
    await expect
      .poll(() => respuestas.length, {
        message: `se esperaban ${cuantos} escrituras del planner`,
        timeout: 25_000,
      })
      .toBeGreaterThanOrEqual(cuantos)
  } finally {
    page.off('response', contar)
  }

  for (const status of respuestas) {
    expect(status, 'un Server Action del planner contestó con error').toBeLessThan(400)
  }

  /*
   * Un Server Action que se niega contesta 200 con `{ ok: false }` — así está
   * diseñado, para que la interfaz pueda revertir. O sea que el código HTTP no
   * alcanza para saber si se guardó: lo que lo dice es que NO haya aviso de
   * error. Sin esta línea, una prueba que falla dos pasos después manda a
   * buscar la causa al lugar equivocado.
   */
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
}

/**
 * Deja la pieza sin imagen antes de empezar.
 *
 * Es preparación, no aserción, y por eso puede ser condicional: una corrida
 * anterior que se murió a media prueba deja la imagen puesta, y con imagen la
 * pieza cuenta como ENTREGADA — la alarma de vencida se apaga y la primera
 * prueba falla acusando a un código que está bien.
 */
async function dejarSinImagen(page: Page): Promise<void> {
  const quitar = drawer(page).getByRole('button', { name: 'Quitar imagen' })
  if ((await quitar.count()) > 0) await guardando(page, () => quitar.click())
}

/** Un valor del select que no sea el que ya está puesto, y que no sea el vacío. */
async function otraOpcion(select: Locator): Promise<string> {
  const puesto = await select.inputValue()
  const valores = await select
    .locator('option')
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))

  const otro = valores.find((v) => v !== puesto)
  if (!otro) throw new Error('El select no trae dos opciones con las que trabajar')
  return otro
}

/* --- Las pruebas ----------------------------------------------------------- */

test('los tres campos nuevos se guardan y la entrega vencida se ve en el grid', async ({
  page,
}, info) => {
  await abrirElPlanner(page, info)
  await abrirLaPieza(page, info)
  await dejarSinImagen(page)

  /*
   * Los valores nuevos se eligen DISTINTOS a los que ya hay.
   *
   * El drawer solo guarda cuando el campo cambió de verdad — es lo que evita un
   * UPDATE por cada vez que el foco pasa por encima. Escribir siempre la misma
   * fecha haría que la segunda corrida no disparara nada y la prueba se
   * quedaría esperando un POST que nunca sale, culpando al código equivocado.
   */
  const campoEntrega = drawer(page).getByLabel('Fecha de entrega')
  const entrega = (await campoEntrega.inputValue()) === '2026-01-15' ? '2026-01-16' : '2026-01-15'

  // Una entrega en el pasado, sin material: el atraso que se persigue.
  await guardando(page, async () => {
    await campoEntrega.fill(entrega)
    await campoEntrega.blur()
  })
  await expect(drawer(page).getByText('Vencida hace')).toBeVisible()

  const responsable = drawer(page).getByLabel('Responsable')
  const elegido = await otraOpcion(responsable)
  await guardando(page, async () => {
    await responsable.selectOption(elegido)
  })
  expect(elegido, 'no se eligió a nadie del equipo').not.toBe('')

  // Sprint nuevo sin salir del cajón. El nombre es único por org, así que dos
  // corridas no pueden chocar entre ellas.
  const nombreSprint = `Sprint e2e ${Date.now()}`
  await drawer(page).getByRole('button', { name: 'Nuevo sprint' }).click()
  await drawer(page).getByLabel('Nombre del sprint').fill(nombreSprint)
  await drawer(page).locator('input[type="date"]').nth(1).fill('2026-09-01')
  await drawer(page).locator('input[type="date"]').nth(2).fill('2026-09-15')
  // Dos escrituras: el sprint y la pieza que lo estrena.
  await guardando(
    page,
    () => drawer(page).getByRole('button', { name: 'Crear y asignar' }).click(),
    2,
  )

  // Se afirma la opción SELECCIONADA por su nombre y no el `value` del select:
  // el id no dice nada al leer la prueba, y leer el `value` demasiado pronto
  // devuelve el sprint anterior, que también es un uuid y también pasa un
  // `/.+/`. Eso ya mandó a buscar un bug donde no había ninguno.
  const sprintPuesto = drawer(page).getByLabel('Sprint').locator('option:checked')
  await expect(sprintPuesto).toHaveText(nombreSprint)

  // El tile ya lo dice sin abrir nada: entrega vencida y sin material.
  await expect(tile(page, hookDePrueba(info)).getByText('Vencida')).toBeVisible()

  // La prueba de fuego: recargar. Si esto pasa, los tres UPDATE llegaron a la
  // base y ninguno se lo comió RLS en silencio.
  await page.reload()
  await abrirLaPieza(page, info)
  await expect(drawer(page).getByLabel('Fecha de entrega')).toHaveValue(entrega)
  await expect(drawer(page).getByLabel('Responsable')).toHaveValue(elegido)
  await expect(drawer(page).getByLabel('Sprint').locator('option:checked')).toHaveText(nombreSprint)
})

test('subir una imagen la pinta en el tile, apaga la alarma y sobrevive la recarga', async ({
  page,
}, info) => {
  await abrirElPlanner(page, info)
  await abrirLaPieza(page, info)

  await drawer(page)
    .getByLabel('Subir la imagen de la pieza')
    .setInputFiles({ name: 'arte-final.png', mimeType: 'image/png', buffer: PNG_ROJO })

  // Se espera a que la vista previa local (`blob:`) sea reemplazada por la URL
  // firmada: eso significa que el archivo llegó al bucket Y que la fila quedó.
  const preview = drawer(page).getByRole('img')
  await expect(preview).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/piezas\//, {
    timeout: 20_000,
  })

  /*
   * La convención de ruta `{client_id}/{piece_id}/{archivo}` no es estética:
   * el primer segmento es lo que las políticas de Storage leen para decidir.
   * Si alguien "simplifica" la ruta, RLS deja de proteger nada y el único
   * síntoma sería este.
   */
  const firmada = (await preview.getAttribute('src')) ?? ''
  const ruta = decodeURIComponent(firmada).split('/object/sign/piezas/')[1]?.split('?')[0] ?? ''
  const segmentos = ruta.split('/')
  expect(segmentos, `la ruta del bucket no es {cliente}/{pieza}/{archivo}: ${ruta}`).toHaveLength(3)
  expect(segmentos[0]).toMatch(/^[0-9a-f-]{36}$/)
  expect(segmentos[1]).toMatch(/^[0-9a-f-]{36}$/)

  await page.keyboard.press('Escape')

  // Y lo que motivó todo el cambio: el tile deja de ser una placa de color.
  const imagenDelTile = tile(page, hookDePrueba(info)).locator('img')
  await expect(imagenDelTile).toBeVisible()

  // Con material adentro, la alarma de entrega vencida se apaga. El compromiso
  // se cumplió, aunque haya llegado tarde.
  await expect(tile(page, hookDePrueba(info)).getByText('Vencida')).toHaveCount(0)

  await page.reload()
  await expect(tile(page, hookDePrueba(info)).locator('img')).toBeVisible()

  // La URL que se sirve después de recargar es una firma NUEVA, hecha en el
  // servidor: la de hace un momento vivía solo en la memoria del navegador.
  await expect(tile(page, hookDePrueba(info)).locator('img')).toHaveAttribute(
    'src',
    /\/storage\/v1\/object\/sign\/piezas\//,
  )
})

test('reemplazar borra el archivo viejo y quitar deja el tile en la placa', async ({
  page,
}, info) => {
  await abrirElPlanner(page, info)
  await abrirLaPieza(page, info)

  const preview = drawer(page).getByRole('img')
  // Se espera con `toHaveAttribute` en vez de leer el atributo de golpe: si la
  // imagen todavía no está, `getAttribute` se cuelga hasta que expira la prueba
  // completa y el reporte dice "timeout" sin decir de qué.
  await expect(preview, 'la prueba anterior tenía que dejar una imagen puesta').toHaveAttribute(
    'src',
    /\/object\/sign\/piezas\//,
    { timeout: 20_000 },
  )
  const urlVieja = (await preview.getAttribute('src')) ?? ''

  await drawer(page)
    .getByLabel('Reemplazar la imagen de la pieza')
    .setInputFiles({ name: 'arte-v2.png', mimeType: 'image/png', buffer: PNG_ROJO })

  await expect.poll(async () => preview.getAttribute('src'), { timeout: 20_000 }).not.toBe(urlVieja)
  await expect(preview).toHaveAttribute('src', /\/storage\/v1\/object\/sign\/piezas\//)

  /*
   * El archivo reemplazado se borra del bucket.
   *
   * Se comprueba pidiendo la firma VIEJA, que sigue siendo criptográficamente
   * válida por dos horas: si el objeto siguiera ahí, Storage lo devolvería con
   * 200. Sin esta limpieza, cada "cambiar imagen" deja un huérfano que nadie va
   * a ver nunca — hasta que alguien mire la factura.
   */
  await expect
    .poll(async () => (await page.request.get(urlVieja)).status(), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(400)

  // --- Y quitarla del todo ------------------------------------------------
  //
  // El cajón dice "Todavía no hay imagen" en cuanto se hace clic, mucho antes
  // de que la base lo sepa: es la mitad optimista del guardado. Recargar ahí
  // aborta el Server Action y la imagen reaparece.
  await guardando(page, () => drawer(page).getByRole('button', { name: 'Quitar imagen' }).click())
  await expect(drawer(page).getByText('Todavía no hay imagen')).toBeVisible({ timeout: 20_000 })

  await page.reload()
  // El tile PRIMERO. `toHaveCount(0)` se cumple de inmediato mientras el grid
  // todavía no se pinta, y entonces la aserción de abajo mide una página vacía.
  await expect(tile(page, hookDePrueba(info))).toBeVisible()

  // Sin material, la entrega vencida de la primera prueba vuelve a gritar.
  await expect(tile(page, hookDePrueba(info)).getByText('Vencida')).toBeVisible()
  await expect(tile(page, hookDePrueba(info)).locator('img')).toHaveCount(0)
})
