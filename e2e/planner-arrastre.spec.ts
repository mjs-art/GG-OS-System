import { rmSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { entrarComoEstudio } from './sesion'
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test'

/**
 * El drag & drop del Planner, en el navegador y contra la base de verdad.
 *
 * Es el elemento firma del producto y era lo único importante sin cobertura.
 * `src/domain/planner.ts` ya prueba el cálculo del reacomodo con 28 casos; esto
 * NO lo vuelve a probar. Lo que se prueba aquí es la otra mitad, la que la
 * lógica pura no puede ver:
 *
 *   1 · que el gesto llegue a dnd-kit y produzca un `onDragEnd`,
 *   2 · que el Server Action y la función transaccional de Postgres escriban,
 *   3 · que lo escrito siga ahí después de recargar.
 *
 * El punto 3 es el que separa "React se ve bien" de "el mes cambió". Por eso
 * cada movimiento se verifica dos veces: en el estado optimista y otra vez con
 * la página recargada desde el servidor.
 *
 * Lo que quedó FUERA, y hay que decirlo: el grid a 390px. En un iPhone la barra
 * lateral del estudio no colapsa y al Planner le quedan ~200px, que se los come
 * enteros el riel de fechas: los tiles miden 0×0 y no hay nada que arrastrar.
 * Es un bug del producto, no de la prueba, y está reportado. Mientras exista,
 * este archivo corre WebKit en tamaño de escritorio — probar el arrastre contra
 * tiles de cero píxeles no probaría nada.
 */

/**
 * Serial, y además con turno exclusivo (ver `tomarElTurno`).
 *
 * Estas pruebas ESCRIBEN en la base: mueven las fechas de las piezas de
 * septiembre de Bar Ficticio. Dos que corran a la vez se pisan las fechas y las
 * aserciones fallan por la corrida vecina, no por un bug.
 */
test.describe.configure({ mode: 'serial' })

/**
 * El motor de WebKit sí, el tamaño de iPhone no. Ver la nota de arriba: a 390px
 * el grid del Planner mide cero.
 */
test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })

/* --- Turno exclusivo entre proyectos --------------------------------------- */

/**
 * Un candado en disco, porque el conflicto es entre PROCESOS.
 *
 * `mode: 'serial'` ordena las pruebas de este archivo dentro de un worker, pero
 * Playwright corre los proyectos (chromium y mobile) en workers distintos y los
 * dos abren el mismo archivo contra la MISMA base. Sin esto, el intercambio de
 * chromium se cruza con el "insertar y correr" de webkit y las dos corridas
 * fallan de forma intermitente.
 *
 * `mkdir` sin recursive es atómico en POSIX: o lo crea o falla. Eso es todo lo
 * que hace falta para un mutex entre procesos de la misma máquina.
 */
const CANDADO = join(tmpdir(), 'studio-os-planner-arrastre.candado')
/**
 * Un candado más viejo que esto es un worker que se murió, no un turno vivo.
 * El archivo completo tarda ~15s; noventa segundos es holgura de sobra y evita
 * que un candado huérfano atore la siguiente corrida.
 */
const CANDADO_RANCIO_MS = 90_000
const ESPERA_MAX_MS = 180_000

let turnoTomado = false

async function tomarElTurno(): Promise<void> {
  const limite = Date.now() + ESPERA_MAX_MS
  for (;;) {
    try {
      await mkdir(CANDADO)
      turnoTomado = true
      return
    } catch {
      const info = await stat(CANDADO).catch(() => null)
      if (info && Date.now() - info.mtimeMs > CANDADO_RANCIO_MS) {
        await rm(CANDADO, { recursive: true, force: true })
        continue
      }
      if (Date.now() > limite) {
        throw new Error(
          `No se liberó el turno del Planner en ${ESPERA_MAX_MS / 1000}s. ` +
            `Si nadie está corriendo pruebas, borra ${CANDADO}.`,
        )
      }
      await new Promise((r) => setTimeout(r, 200))
    }
  }
}

async function soltarElTurno(): Promise<void> {
  if (!turnoTomado) return
  turnoTomado = false
  await rm(CANDADO, { recursive: true, force: true })
}

// Red de seguridad: si el worker se muere sin llegar al `afterAll` —pasa cuando
// el servidor se cae a media prueba— el candado se queda puesto y la siguiente
// corrida espera de gratis. `exit` solo admite trabajo síncrono.
process.once('exit', () => {
  if (turnoTomado) rmSync(CANDADO, { recursive: true, force: true })
})

test.beforeAll(tomarElTurno)
test.afterAll(soltarElTurno)

/* --- Sesión ---------------------------------------------------------------- */

const CLIENTE = '/cliente/bar-ficticio?mes=2026-09'

/**
 * La sesión se abre UNA vez por archivo y las tres pruebas la reusan.
 *
 * Cada `page` trae su propio contexto, así que la sesión se pasa como cookies.
 * No es por velocidad: GoTrue limita los accesos por IP en ventanas de cinco
 * minutos (`sign_in_sign_ups` en config.toml) y tres magic links por proyecto y
 * por corrida acercan la suite entera al tope. Al llegar, GoTrue deja de mandar
 * correo, la prueba lee el link anterior —ya usado— y falla con `otp_expired`,
 * que parece bug de la app y no lo es.
 *
 * Las pruebas de este archivo corren en serie y en el mismo worker, así que esta
 * variable vive lo que vive el archivo.
 */
type Galleta = Awaited<ReturnType<BrowserContext['cookies']>>[number]

let sesion: Galleta[] | null = null

/** Entra con sesión real y deja la página del cliente lista para interactuar. */
async function abrirElPlanner(page: Page, info: TestInfo): Promise<void> {
  if (sesion) {
    await page.context().addCookies(sesion)
  } else {
    // El correo sale de `sesion.ts`: uno por worker de Playwright, para que dos
    // pruebas concurrentes nunca se consuman el magic link entre ellas.
    await entrarComoEstudio(page, info)
    sesion = await page.context().cookies()
  }

  await page.goto(CLIENTE)

  // Sin hidratar, un pointerdown no llega a dnd-kit: el HTML ya se pintó pero
  // React todavía no tomó control. WebKit hidrata más lento y ahí es donde el
  // arrastre "no hacía nada".
  await page.waitForFunction(() => document.body.dataset['hidratado'] === '1')
  await expect(tiles(page).first()).toBeVisible()
}

/* --- Leer el grid ---------------------------------------------------------- */

interface Tile {
  /** El hook identifica la pieza: es lo único que no cambia al moverla. */
  hook: string
  /** `18 sep · 7:00 p.m.`, tal como la lee Ana en el tile. */
  fecha: string
  amarrada: boolean
}

const ETIQUETA_TILE = /^(?:Post|Carrusel|Reel) del /

function grid(page: Page): Locator {
  return page.locator('section#planner')
}

function tiles(page: Page): Locator {
  return grid(page).getByRole('button', { name: ETIQUETA_TILE })
}

/** El tile de una pieza, por su hook. Sobrevive a que la pieza cambie de lugar. */
function tilePorHook(page: Page, hook: string): Locator {
  return grid(page).getByRole('button', { name: hook })
}

/**
 * Una foto del grid completo, en el orden en el que se ve.
 *
 * Se lee en UNA evaluación y no tile por tile: entre dos consultas separadas el
 * grid puede re-renderizar y la foto saldría mezclada, mitad de antes y mitad
 * de después.
 *
 * La fecha sale del `aria-label` del tile, que es el mismo texto que el usuario
 * ve al pasar el cursor. El riel de la derecha no sirve para esto: sus entradas
 * viven en otro contenedor y no dicen a qué pieza pertenecen.
 */
async function leerGrid(page: Page): Promise<Tile[]> {
  return page.evaluate(() => {
    const seccion = document.querySelector('section#planner')
    if (!seccion) return []
    return [...seccion.querySelectorAll('button[aria-label]')].flatMap((b) => {
      const etiqueta = b.getAttribute('aria-label') ?? ''
      const partes = /^(?:Post|Carrusel|Reel) del (.+?): ([\s\S]+)$/.exec(etiqueta)
      const fecha = partes?.[1]
      const hook = partes?.[2]
      if (!fecha || !hook) return []
      // El candado se anuncia con un texto para lectores de pantalla; el icono
      // solo no se puede afirmar.
      return [{ fecha, hook, amarrada: (b.textContent ?? '').includes('Fecha fija') }]
    })
  })
}

/** `{ hook: fecha }` — lo que de verdad se afirma: qué pieza quedó en qué día. */
function fechasPorPieza(tiles: readonly Tile[]): Record<string, string> {
  return Object.fromEntries(tiles.map((t) => [t.hook, t.fecha]))
}

async function esperarFechas(page: Page, esperado: Record<string, string>, mensaje: string) {
  await expect
    .poll(async () => fechasPorPieza(await leerGrid(page)), { message: mensaje, timeout: 15_000 })
    .toEqual(esperado)
}

/**
 * El grid que el seed garantiza: la pieza amarrada hasta arriba y cuatro libres
 * seguidas debajo.
 *
 * Se afirma en vez de darse por hecho. Si alguien mueve el candado a media
 * cuadrícula, "insertar y correr" se queda sin tramo sobre el cual correr y la
 * prueba fallaría con un mensaje incomprensible tres aserciones más abajo.
 */
function verificarLaForma(tiles: readonly Tile[]): void {
  expect(
    tiles.length,
    'el mes de la prueba necesita al menos cuatro piezas',
  ).toBeGreaterThanOrEqual(4)
  expect(
    tiles.map((t) => t.amarrada),
    'el seed pone la pieza amarrada hasta arriba (la más nueva) y las libres debajo',
  ).toEqual([true, ...tiles.slice(1).map(() => false)])
  expect(
    new Set(tiles.map((t) => t.fecha)).size,
    'las fechas del mes tienen que ser distintas',
  ).toBe(tiles.length)
}

/* --- El arrastre ----------------------------------------------------------- */

async function centroDe(loc: Locator): Promise<{ x: number; y: number }> {
  const caja = await loc.boundingBox()
  if (!caja) throw new Error('El tile no tiene caja: ¿el grid está colapsado?')
  if (caja.width < 8) throw new Error(`El tile mide ${caja.width}px de ancho; no hay qué arrastrar`)
  return { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 }
}

/**
 * Arrastrar una pieza sobre otra, como lo haría una mano.
 *
 * `page.dragAndDrop()` NO sirve aquí: manda un mousedown, un mousemove y un
 * mouseup, y el `PointerSensor` de dnd-kit necesita ver una secuencia de
 * `pointermove` que supere su distancia de activación (6px) antes de aceptar
 * que esto es un arrastre. Con eventos de ratón sueltos el tile ni se levanta.
 *
 * Las dos cajas se miden DESPUÉS de terminar de desplazar la página. Medir el
 * origen, desplazar para alcanzar el destino y luego usar la medida vieja fue
 * el primer intento: el desplazamiento invalida las coordenadas y las dos caen
 * casi en el mismo punto. El arrastre ocurre, no falla, y no mueve nada — que
 * es exactamente el síntoma que hace pensar que dnd-kit es imposible de probar.
 */
async function arrastrar(page: Page, origen: Locator, destino: Locator): Promise<void> {
  await origen.scrollIntoViewIfNeeded()
  await destino.scrollIntoViewIfNeeded()
  const a = await centroDe(origen)
  const b = await centroDe(destino)

  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  // Primero se supera la distancia de activación con pasos cortos, y hasta
  // entonces se viaja al destino. Un solo salto se puede procesar como un
  // movimiento único y el sensor lo descarta.
  await page.mouse.move(a.x + 12, a.y + 8, { steps: 5 })
  await page.mouse.move(b.x, b.y, { steps: 15 })

  // Condición real antes de soltar, no una espera a ciegas: el tile de destino
  // se marca con el outline en cuanto dnd-kit lo reconoce como zona de caída.
  // Si esto falla, soltar habría caído en el vacío o en el tile equivocado.
  await expect(destino, 'dnd-kit no marcó el tile de destino').toHaveClass(/outline-accent-hot/)

  await page.mouse.up()
}

/**
 * Suelta y espera a que el Server Action CONTESTE.
 *
 * Sin esta espera, recargar la página aborta el POST en vuelo y la escritura se
 * pierde a veces — el clásico "pasa en mi máquina y falla una de cada cinco".
 * La respuesta del action también significa que la transacción de Postgres ya
 * cerró, así que a partir de aquí recargar lee lo que quedó escrito.
 */
async function arrastrarYGuardar(page: Page, origen: Locator, destino: Locator): Promise<void> {
  const guardado = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/cliente/bar-ficticio'),
    { timeout: 20_000 },
  )
  await arrastrar(page, origen, destino)
  const respuesta = await guardado
  expect(respuesta.status(), 'el Server Action del planner contestó con error').toBeLessThan(400)
}

/** Los avisos de sonner. Uno solo en toda la app, montado en el layout raíz. */
function aviso(page: Page): Locator {
  return page.locator('[data-sonner-toast]')
}

/* --- Las pruebas ----------------------------------------------------------- */

test('intercambiar: dos piezas cambian de fecha y nadie más se mueve', async ({ page }, info) => {
  await abrirElPlanner(page, info)

  const antes = await leerGrid(page)
  verificarLaForma(antes)

  // Dos libres que no son vecinas: si el reacomodo arrastrara de más, las
  // piezas de en medio lo delatan.
  const a = antes[1]
  const b = antes[3]
  if (!a || !b) throw new Error('El grid no trae las piezas que la prueba necesita')

  // "Intercambiar" es el modo por default; se afirma para que la prueba no
  // dependa de un default que alguien puede cambiar sin darse cuenta.
  await expect(
    grid(page)
      .getByRole('group', { name: 'Qué pasa al soltar una pieza sobre otra' })
      .getByRole('button', { name: 'Intercambiar' }),
  ).toHaveAttribute('aria-pressed', 'true')

  await arrastrarYGuardar(page, tilePorHook(page, a.hook), tilePorHook(page, b.hook))

  // Las FECHAS no se mueven: se intercambian las piezas que cuelgan de ellas.
  const esperado = { ...fechasPorPieza(antes), [a.hook]: b.fecha, [b.hook]: a.fecha }
  await esperarFechas(page, esperado, 'el intercambio no se reflejó en el grid')

  // Y la prueba de fuego: recargar. Si esto pasa, `swap_piece_slots` escribió
  // de verdad y no fue nada más estado de React.
  await page.reload()
  await expect(tiles(page).first()).toBeVisible()
  await esperarFechas(page, esperado, 'el intercambio no sobrevivió la recarga')
})

test('candado: soltar sobre una pieza amarrada no mueve nada y dice la fecha', async ({
  page,
}, info) => {
  await abrirElPlanner(page, info)

  const antes = await leerGrid(page)
  verificarLaForma(antes)

  const amarrada = antes[0]
  const suelta = antes[1]
  if (!amarrada || !suelta) throw new Error('El grid no trae las piezas que la prueba necesita')

  // El día sale del tile, no de una constante: lo que se prueba es que el aviso
  // trae la fecha DE ESA pieza. El mes lo fija la URL (`mes=2026-09`).
  const dia = amarrada.fecha.split(' ')[0]

  await arrastrar(page, tilePorHook(page, suelta.hook), tilePorHook(page, amarrada.hook))

  await expect(aviso(page)).toContainText(`Esta pieza está amarrada al ${dia} de septiembre.`)
  await expect(aviso(page)).toContainText('Quita el candado para moverla.')

  // Nada se movió: ni la amarrada ni la que se soltó encima.
  await esperarFechas(page, fechasPorPieza(antes), 'el candado dejó pasar un movimiento')

  // Ni siquiera a medias en la base: el grid se niega antes de llamar al
  // servidor, y después de recargar el mes está igual.
  await page.reload()
  await expect(tiles(page).first()).toBeVisible()
  await esperarFechas(page, fechasPorPieza(antes), 'algo se escribió pese al candado')
})

test('insertar y correr: el tramo se recorre un slot y lo de afuera se queda', async ({
  page,
}, info) => {
  await abrirElPlanner(page, info)

  const modo = grid(page).getByRole('group', { name: 'Qué pasa al soltar una pieza sobre otra' })
  await modo.getByRole('button', { name: 'Insertar y correr' }).click()
  await expect(modo.getByRole('button', { name: 'Insertar y correr' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const antes = await leerGrid(page)
  verificarLaForma(antes)

  // De la primera libre hasta la última: recorre todo el tramo movible y deja
  // fuera a la amarrada, que es justo lo que hay que comprobar.
  const desde = 1
  const hasta = antes.length - 1
  const origen = antes[desde]
  const destino = antes[hasta]
  if (!origen || !destino) throw new Error('El grid no trae las piezas que la prueba necesita')

  await arrastrarYGuardar(page, tilePorHook(page, origen.hook), tilePorHook(page, destino.hook))

  // La que se arrastró toma la fecha del destino; todas las de en medio suben
  // un slot (cada una se queda con la fecha de la que tenía arriba).
  const esperado = fechasPorPieza(antes)
  esperado[origen.hook] = destino.fecha
  for (let i = desde + 1; i <= hasta; i++) {
    const pieza = antes[i]
    const slotDeArriba = antes[i - 1]
    if (!pieza || !slotDeArriba) throw new Error('Hueco en el grid')
    esperado[pieza.hook] = slotDeArriba.fecha
  }

  await esperarFechas(page, esperado, 'el mes no se recorrió como debía')

  // La amarrada sigue en su día: estaba fuera del tramo y nadie la tocó.
  expect(esperado[antes[0]?.hook ?? ''], 'la pieza amarrada quedó fuera del tramo').toBe(
    antes[0]?.fecha,
  )

  await page.reload()
  await expect(tiles(page).first()).toBeVisible()
  await esperarFechas(page, esperado, 'el reacomodo no sobrevivió la recarga')
})
