import { describe, expect, it } from 'vitest'
import { componerCaption } from './post-preview'

const vacia = { hook: null, copyIn: null, copyOut: null, cta: null, hashtags: [] as string[] }

describe('componerCaption', () => {
  it('arma el caption en el orden de Instagram: hook, copys, cta, hashtags', () => {
    expect(
      componerCaption({
        hook: 'Menos es más',
        copyIn: 'Una cadena. Un anillo.',
        copyOut: 'A veces la joya que no se ve es la que más impacta.',
        cta: 'Guárdate este post',
        hashtags: ['minimalismo', 'joyeria'],
      }),
    ).toBe(
      'Menos es más\n\n' +
        'Una cadena. Un anillo.\n\n' +
        'A veces la joya que no se ve es la que más impacta.\n\n' +
        'Guárdate este post\n\n' +
        '#minimalismo #joyeria',
    )
  })

  it('con solo hook devuelve el hook, sin líneas vacías', () => {
    expect(componerCaption({ ...vacia, hook: 'Solo el gancho' })).toBe('Solo el gancho')
  })

  it('salta los campos nulos o en blanco sin dejar huecos', () => {
    expect(componerCaption({ ...vacia, hook: 'Gancho', copyIn: '   ', cta: 'Llamado' })).toBe(
      'Gancho\n\nLlamado',
    )
  })

  it('sin hashtags no agrega la línea en blanco final', () => {
    expect(componerCaption({ ...vacia, hook: 'Gancho' })).toBe('Gancho')
  })

  it('un caption de puros hashtags no empieza con salto de línea', () => {
    expect(componerCaption({ ...vacia, hashtags: ['uno', 'dos'] })).toBe('#uno #dos')
  })

  it('no duplica el numeral cuando el hashtag ya lo trae', () => {
    expect(componerCaption({ ...vacia, hashtags: ['#yaTiene', 'sinNumeral'] })).toBe(
      '#yaTiene #sinNumeral',
    )
  })

  it('una pieza completamente vacía da un caption vacío', () => {
    expect(componerCaption(vacia)).toBe('')
  })
})
