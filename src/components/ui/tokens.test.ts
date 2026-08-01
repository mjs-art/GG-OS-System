import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardián del sistema de diseño.
 *
 * La paleta oficial de Ana Gz Studio son cuatro colores, y hay DOS temas
 * construidos sobre ellos. Cambiar un color tiene que costar diez minutos, no
 * dos días.
 *
 * Eso solo es cierto si los colores viven en un único archivo. En el momento
 * en que alguien escribe `bg-[#810100]` en el componente 40, cambiar la marca
 * se convierte en una cacería — y con dos temas es peor: ese hex se queda
 * idéntico cuando el fondo se vuelve crema, y nadie lo nota hasta que un
 * cliente ve la captura. Esta prueba es lo que mantiene la promesa.
 *
 * Los colores que SÍ pueden ser literales en runtime son los de pilar y los de
 * marca del cliente, porque vienen de la base como dato, no del diseño. Por eso
 * la prueba mira el código fuente y no los valores en ejecución.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..')
const SRC = join(ROOT, 'src')

/** globals.css es el único lugar donde un color puede estar escrito. */
const ALLOWED = new Set(['src/app/globals.css'])

/**
 * `themeColor` es una etiqueta meta que el navegador lee antes de que exista
 * CSS, así que ese color no puede salir de un token. Es la única excepción.
 */
const ALLOWED_WITH_REASON = new Map([
  ['src/domain/tema.ts', 'themeColor de la meta tag: el navegador la lee antes del CSS'],
])

const IGNORED_DIRS = new Set(['node_modules', '.next'])
const IGNORED_FILES = new Set(['database.types.ts'])

/**
 * Las pruebas quedan fuera del barrido, incluida esta.
 *
 * Una prueba de color legítimamente menciona colores: esta misma trae
 * `bg-gray-800` en su mensaje de error, y la de Playwright afirma sobre
 * `rgb(18, 17, 16)`. Nada de eso se le envía a nadie.
 */
const isTestFile = (name: string) => /\.(test|spec)\.tsx?$/.test(name)

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walk(full, out)
    } else if (/\.(ts|tsx|css)$/.test(entry) && !IGNORED_FILES.has(entry) && !isTestFile(entry)) {
      out.push(full)
    }
  }
  return out
}

const HEX = /#[0-9a-fA-F]{6}\b/g
/** Utilidades tipo bg-gray-800 o text-slate-500 que se saltan la paleta. */
const TAILWIND_DEFAULT_PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g

describe('el sistema de diseño vive en un solo archivo', () => {
  const files = walk(SRC).map((f) => ({ path: f, rel: relative(ROOT, f).replaceAll('\\', '/') }))

  it('encuentra archivos que revisar', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('ningún color literal fuera de globals.css', () => {
    const offenders: string[] = []

    for (const { path, rel } of files) {
      if (ALLOWED.has(rel) || ALLOWED_WITH_REASON.has(rel)) continue
      const matches = readFileSync(path, 'utf8').match(HEX)
      if (matches) {
        offenders.push(`${rel} → ${[...new Set(matches)].join(', ')}`)
      }
    }

    expect(
      offenders,
      'Los colores van en src/app/globals.css y se usan por token (bg-surface, text-accent-hot). ' +
        'Si necesitas un color nuevo, agrégalo a los DOS temas del CSS, no al componente.',
    ).toEqual([])
  })

  it('ninguna utilidad de la paleta default de Tailwind', () => {
    const offenders: string[] = []

    for (const { path, rel } of files) {
      if (ALLOWED.has(rel)) continue
      const matches = readFileSync(path, 'utf8').match(TAILWIND_DEFAULT_PALETTE)
      if (matches) {
        offenders.push(`${rel} → ${[...new Set(matches)].join(', ')}`)
      }
    }

    expect(
      offenders,
      'bg-gray-800 y sus primos se saltan la paleta y no cambian cuando cambie la marca. ' +
        'Usa los tokens de rol: bg, surface, surface-2, line, fg, fg-muted, accent, accent-hot.',
    ).toEqual([])
  })

  it('cero sombras: la jerarquía se construye con espacio y peso', () => {
    const offenders: string[] = []

    for (const { path, rel } of files) {
      if (ALLOWED.has(rel)) continue
      const matches = readFileSync(path, 'utf8').match(/\bshadow-(?!none\b)[a-z0-9[\]/-]+/g)
      if (matches) {
        offenders.push(`${rel} → ${[...new Set(matches)].join(', ')}`)
      }
    }

    expect(
      offenders,
      'El brief dice cero sombras. Si algo necesita separarse del fondo, usa un hairline o espacio.',
    ).toEqual([])
  })
})

/* ==========================================================================
   Los dos temas tienen que moverse juntos.

   El modo de falla que estas pruebas atrapan es silencioso y feo: alguien
   agrega `--color-warning` al tema oscuro, se le olvida el claro, y en claro
   ese token cae al valor oscuro. No truena nada. Solo hay un chip ilegible en
   una pantalla que casi nadie abre, hasta que la abre un cliente.
   ========================================================================== */

/**
 * Sin comentarios: los comentarios de globals.css explican justamente estas
 * reglas, y citar `html[data-tema]` para decir "no hagas esto" hacía fallar la
 * prueba que lo prohíbe.
 */
const CSS = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8').replaceAll(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Tokens de rol que TIENEN que existir en los dos temas. */
const ROLES_OBLIGATORIOS = [
  'bg',
  'surface',
  'surface-2',
  'line',
  'fg',
  'fg-muted',
  'accent',
  'accent-hot',
  'on-accent',
  'critical',
  'high',
  'medium',
  'ok',
]

/** Los `--color-*` declarados dentro de un bloque `{ … }` que empieza en `start`. */
function tokensDelBloque(css: string, start: number): Set<string> {
  const abre = css.indexOf('{', start)
  let depth = 0
  let end = abre
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const cuerpo = css.slice(abre, end)
  return new Set([...cuerpo.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1] as string))
}

describe('los dos temas están sincronizados', () => {
  const inicioOscuro = CSS.indexOf('@theme')
  const inicioClaro = CSS.indexOf("[data-tema='claro']")

  const oscuro = tokensDelBloque(CSS, inicioOscuro)
  const claro = tokensDelBloque(CSS, inicioClaro)

  it('los dos bloques existen', () => {
    expect(inicioOscuro, 'falta el bloque @theme').toBeGreaterThanOrEqual(0)
    expect(inicioClaro, "falta el bloque [data-tema='claro']").toBeGreaterThanOrEqual(0)
    expect(oscuro.size).toBeGreaterThan(8)
    expect(claro.size).toBeGreaterThan(8)
  })

  it('todos los roles obligatorios están en los dos temas', () => {
    const faltanEnOscuro = ROLES_OBLIGATORIOS.filter((t) => !oscuro.has(t))
    const faltanEnClaro = ROLES_OBLIGATORIOS.filter((t) => !claro.has(t))

    expect(faltanEnOscuro, 'roles sin definir en @theme (tema oscuro)').toEqual([])
    expect(faltanEnClaro, "roles sin definir en [data-tema='claro']").toEqual([])
  })

  it('el tema claro no inventa tokens que el oscuro no tiene', () => {
    const huerfanos = [...claro].filter((t) => !oscuro.has(t))

    expect(
      huerfanos,
      'Un token que solo existe en el tema claro no tiene valor por defecto: en oscuro ' +
        'la utilidad ni siquiera se genera. Decláralo primero en @theme.',
    ).toEqual([])
  })

  it('el selector del tema claro no está escopado a html', () => {
    // El portal de cliente va a envolver su árbol en un <div data-tema="claro">
    // para quedar fijo en claro sin importar la cookie del estudio. Con
    // `html[data-tema='claro']` esa anidación deja de funcionar y el cliente
    // termina viendo el tema de Ana.
    expect(
      CSS,
      'El tema claro debe seleccionarse solo por atributo, sin `html` adelante, para que /aprobar pueda anidarlo.',
    ).not.toMatch(/html\[data-tema/)
  })

  it('@theme es static, para que ningún token se caiga del bundle', () => {
    // Sin `static`, Tailwind solo emite las variables cuyas utilidades detecta
    // en el código. Un token que únicamente se lee desde CSS desaparece, y el
    // override del tema claro se queda apuntando a la nada.
    expect(CSS).toMatch(/@theme\s+static\s*\{/)
  })
})
