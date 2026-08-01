/**
 * El tema de la interfaz del estudio: reglas puras, sin IO.
 *
 * La preferencia vive en una cookie y NO en localStorage, y esa decisión tiene
 * dos razones que conviene no olvidar cuando alguien proponga "moverlo a un
 * hook de cliente":
 *
 * 1. Con localStorage el servidor no sabe qué tema pintar, así que el HTML
 *    sale con el default y un script lo corrige después del primer pintado.
 *    Eso es el flashazo clásico. La forma normal de taparlo es un `<script>`
 *    bloqueante con `dangerouslySetInnerHTML`, prohibido por ESLint aquí.
 * 2. Con cookie el layout lee el valor en el servidor y el `<html>` ya sale
 *    con el tema correcto. Cero flashazo, cero JavaScript de cliente, cero
 *    regla rota. El switch es un Server Action.
 *
 * Costo: leer la cookie vuelve dinámico el layout raíz. Con RLS y sesión por
 * usuario esta app no era cacheable de forma estática de todos modos.
 */

export const TEMAS = ['oscuro', 'claro'] as const
export type Tema = (typeof TEMAS)[number]

/**
 * Oscuro es el default. Si algún día se quiere invertir, es esta línea.
 *
 * No se usa `prefers-color-scheme` como default a propósito: el estudio tiene
 * una identidad visual, no una preferencia de sistema operativo.
 */
export const TEMA_POR_DEFECTO: Tema = 'oscuro'

export const TEMA_COOKIE = 'studio-tema'

/** Un año: es una preferencia, no una sesión. */
const UN_ANO_EN_SEGUNDOS = 60 * 60 * 24 * 365

export const TEMA_COOKIE_OPTIONS = {
  path: '/',
  maxAge: UN_ANO_EN_SEGUNDOS,
  sameSite: 'lax',
  // No es httpOnly: no hay nada que proteger en saber si Ana usa tema claro, y
  // dejarla legible permite depurarla desde el navegador sin adivinar.
  httpOnly: false,
} as const

export function esTema(value: unknown): value is Tema {
  return typeof value === 'string' && (TEMAS as readonly string[]).includes(value)
}

/** El tema opuesto. El switch alterna, no elige de una lista. */
export function temaOpuesto(tema: Tema): Tema {
  return tema === 'oscuro' ? 'claro' : 'oscuro'
}

/**
 * Cualquier valor que no sea uno de los dos — cookie vieja, manipulada a mano,
 * truncada — cae al default en vez de escribirse tal cual en el atributo del
 * `<html>`. Es el mismo principio que el resto del repo: lo que viene de fuera
 * se valida en el límite, y un tipo de TypeScript no valida nada en runtime.
 */
export function resolverTema(value: unknown): Tema {
  return esTema(value) ? value : TEMA_POR_DEFECTO
}

/** El `color-scheme` del CSS que le toca a cada tema. */
export function colorSchemeDe(tema: Tema): 'dark' | 'light' {
  return tema === 'oscuro' ? 'dark' : 'light'
}

/**
 * El color del `<meta name="theme-color">`, que pinta la barra del navegador
 * en móvil.
 *
 * Es el único lugar donde un color de la paleta se repite fuera de
 * globals.css, y no hay manera de evitarlo: el navegador lee esa etiqueta
 * antes de que exista CSS, así que no puede tomar el valor de un token.
 * `tokens.test.ts` lo tiene en su lista de excepciones con esta razón.
 */
export function themeColorDe(tema: Tema): string {
  return tema === 'oscuro' ? '#1B1717' : '#EDEBDD'
}
