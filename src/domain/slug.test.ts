import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('baja a minúsculas y une palabras con guion', () => {
    expect(slugify('Bar Ficticio')).toBe('bar-ficticio')
  })

  it('pliega acentos y ñ a ASCII en vez de borrarlos', () => {
    expect(slugify('Café Río')).toBe('cafe-rio')
    expect(slugify('Piña Colada')).toBe('pina-colada')
    expect(slugify('Señor Búho')).toBe('senor-buho')
  })

  it('colapsa símbolos y espacios repetidos en un solo guion', () => {
    expect(slugify('Hotel  &  Spa')).toBe('hotel-spa')
    expect(slugify('A/B — Testing!!!')).toBe('a-b-testing')
  })

  it('no deja guion colgando en las orillas', () => {
    expect(slugify('  Hola  ')).toBe('hola')
    expect(slugify('¡Órale!')).toBe('orale')
  })

  it('conserva los dígitos', () => {
    expect(slugify('Studio 54')).toBe('studio-54')
  })

  it('devuelve cadena vacía cuando no hay nada aprovechable', () => {
    // Lo atrapa la validación de arriba con un mensaje humano; aquí no se
    // inventa un slug de la nada.
    expect(slugify('···')).toBe('')
    expect(slugify('   ')).toBe('')
  })

  it('deja intacto lo que ya es un slug válido', () => {
    expect(slugify('bar-ficticio')).toBe('bar-ficticio')
  })
})
