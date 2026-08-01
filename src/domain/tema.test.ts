import { describe, expect, it } from 'vitest'
import {
  colorSchemeDe,
  esTema,
  resolverTema,
  TEMA_COOKIE_OPTIONS,
  TEMA_POR_DEFECTO,
  temaOpuesto,
  themeColorDe,
} from './tema'

describe('resolverTema', () => {
  it('acepta los dos temas', () => {
    expect(resolverTema('oscuro')).toBe('oscuro')
    expect(resolverTema('claro')).toBe('claro')
  })

  it('cae al default con cualquier basura', () => {
    // El valor viene de una cookie, o sea del cliente. Sin este colador
    // terminaría escrito tal cual en data-tema del <html>.
    for (const basura of [undefined, null, '', 'Oscuro', 'dark', 'claro ', 42, {}, ['claro']]) {
      expect(resolverTema(basura), `${JSON.stringify(basura)} debería caer al default`).toBe(
        TEMA_POR_DEFECTO,
      )
    }
  })
})

describe('esTema', () => {
  it('distingue tema de no-tema', () => {
    expect(esTema('claro')).toBe(true)
    expect(esTema('sepia')).toBe(false)
  })
})

describe('temaOpuesto', () => {
  it('alterna', () => {
    expect(temaOpuesto('oscuro')).toBe('claro')
    expect(temaOpuesto('claro')).toBe('oscuro')
  })

  it('aplicado dos veces regresa al mismo', () => {
    expect(temaOpuesto(temaOpuesto('oscuro'))).toBe('oscuro')
  })
})

describe('lo que se le dice al navegador', () => {
  it('el color-scheme corresponde al tema', () => {
    expect(colorSchemeDe('oscuro')).toBe('dark')
    expect(colorSchemeDe('claro')).toBe('light')
  })

  it('el theme-color es el fondo de cada tema', () => {
    // Si esto se desincroniza de globals.css, la barra del navegador en móvil
    // sale de un color y la página de otro.
    expect(themeColorDe('oscuro')).toBe('#1B1717')
    expect(themeColorDe('claro')).toBe('#EDEBDD')
  })
})

describe('la cookie', () => {
  it('dura un año: es preferencia, no sesión', () => {
    expect(TEMA_COOKIE_OPTIONS.maxAge).toBe(60 * 60 * 24 * 365)
  })

  it('es sameSite lax y de todo el sitio', () => {
    expect(TEMA_COOKIE_OPTIONS.sameSite).toBe('lax')
    expect(TEMA_COOKIE_OPTIONS.path).toBe('/')
  })
})
