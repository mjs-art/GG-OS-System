import { describe, expect, it } from 'vitest'
import { idDeDrive, miniaturaDeDrive, urlMostrableDeEnlace } from './drive'

describe('extraer el id de un enlace de Drive', () => {
  it('lo saca de la forma /file/d/ID/view', () => {
    expect(idDeDrive('https://drive.google.com/file/d/1A2b3C_d-EF/view?usp=sharing')).toBe(
      '1A2b3C_d-EF',
    )
  })

  it('lo saca de ?id= (open, uc)', () => {
    expect(idDeDrive('https://drive.google.com/open?id=1A2b3C_d-EF')).toBe('1A2b3C_d-EF')
    expect(idDeDrive('https://drive.google.com/uc?id=1A2b3C_d-EF&export=download')).toBe(
      '1A2b3C_d-EF',
    )
  })

  it('acepta docs.google.com', () => {
    expect(idDeDrive('https://docs.google.com/document/d/1A2b3C_d-EF/edit')).toBe('1A2b3C_d-EF')
  })

  it('devuelve null para algo que no es de Drive', () => {
    expect(idDeDrive('https://www.canva.com/design/DA123/view')).toBeNull()
    expect(idDeDrive('https://ejemplo.com/imagen.jpg')).toBeNull()
  })

  it('no truena con una cadena que no es URL', () => {
    expect(idDeDrive('no soy una url')).toBeNull()
    expect(idDeDrive('')).toBeNull()
  })
})

describe('armar la miniatura', () => {
  it('convierte un link de compartir en una URL de imagen', () => {
    expect(miniaturaDeDrive('https://drive.google.com/file/d/ABC123/view')).toBe(
      'https://drive.google.com/thumbnail?id=ABC123&sz=w1000',
    )
  })

  it('es idempotente sobre una URL de miniatura', () => {
    // Re-pintar lo ya transformado no debe romperlo: el id sale del ?id=.
    const thumb = 'https://drive.google.com/thumbnail?id=ABC123&sz=w1000'
    expect(miniaturaDeDrive(thumb)).toBe(thumb)
  })

  it('devuelve null para un enlace que no es de Drive', () => {
    expect(miniaturaDeDrive('https://www.canva.com/design/DA123/view')).toBeNull()
  })
})

describe('url mostrable de un enlace externo', () => {
  it('transforma Drive y deja lo demás igual', () => {
    expect(urlMostrableDeEnlace('https://drive.google.com/file/d/ABC123/view')).toBe(
      'https://drive.google.com/thumbnail?id=ABC123&sz=w1000',
    )
    const canva = 'https://www.canva.com/design/DA123/view'
    expect(urlMostrableDeEnlace(canva)).toBe(canva)
  })
})
