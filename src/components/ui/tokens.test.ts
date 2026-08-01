import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guardián del sistema de diseño.
 *
 * Los colores oficiales de Ana Gz Studio todavía no están definidos: la paleta
 * actual es la del plan v4 y es PROVISIONAL. Cambiarla tiene que costar diez
 * minutos, no dos días.
 *
 * Eso solo es cierto si los colores viven en un único archivo. En el momento
 * en que alguien escribe `bg-[#8E2B1E]` en el componente 40, cambiar la marca
 * se convierte en una cacería. Esta prueba es lo que mantiene la promesa:
 * falla si un color literal se escapa de globals.css.
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
 * layout.tsx necesita el color en `themeColor` porque es una etiqueta meta que
 * el navegador lee antes de que exista CSS. No hay forma de tomarlo del token.
 */
const ALLOWED_WITH_REASON = new Map([
  ['src/app/layout.tsx', 'themeColor de la meta tag: el navegador la lee antes del CSS'],
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
      'Los colores van en src/app/globals.css y se usan por token (bg-ink-2, text-burnt-hot). ' +
        'Si necesitas un color nuevo, agrégalo al @theme, no al componente.',
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
        'Usa los tokens: ink, ink-2, ink-3, line, bone, muted, burnt, burnt-hot.',
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
