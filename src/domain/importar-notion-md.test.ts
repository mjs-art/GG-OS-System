import { describe, expect, it } from 'vitest'
import { extraerDatosDeMarca } from './importar-notion-md'

const DOC = `# GRAND HOTEL TIJUANA

[Calendar](https://app.notion.com/p/calendar)

## 🏨 ¿Qué es Grand Hotel Tijuana?

Es un hotel icónico de Tijuana desde 1985.

## 📲 Pilares de Contenido

- **Pilar 1: 🏛️ Legado + Icono de Ciudad**
    - Construye preferencia de marca
- **Pilar 2: 🩺 Grand Care / Turismo de Salud**
    - Pilar de mayor oportunidad

## 🙎🏽‍♀️ Público Objetivo

- Viajeros de negocios
- Parejas planeando bodas

## 📢 Tono de Voz

Elegante, cálido y con peso histórico.

## 🫆 Identidad Visual

- **Colores:** Pantone 5545 C (HTML \`#FF6D22\`)

## 💡 Diferenciadores

- Ícono arquitectónico
- Único con turismo médico integrado
`

describe('extraerDatosDeMarca', () => {
  it('extrae el nombre del título H1', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.nombre).toBe('GRAND HOTEL TIJUANA')
  })

  it('extrae qué es la marca', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.queEs).toBe('Es un hotel icónico de Tijuana desde 1985.')
  })

  it('extrae pilares con nombres limpios (sin markdown ni prefijo)', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.pilares).toHaveLength(2)
    expect(r.pilares[0]?.nombre).toBe('🏛️ Legado + Icono de Ciudad')
    expect(r.pilares[1]?.nombre).toBe('🩺 Grand Care / Turismo de Salud')
  })

  it('extrae audiencia como array de strings', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.audiencia).toEqual(['Viajeros de negocios', 'Parejas planeando bodas'])
  })

  it('extrae tono cuando es una sola frase', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.tono).toEqual(['Elegante, cálido y con peso histórico.'])
  })

  it('extrae el color de marca de identidad visual', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.colorDeMarca).toBe('#FF6D22')
  })

  it('extrae diferenciadores', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.diferenciadores).toEqual([
      'Ícono arquitectónico',
      'Único con turismo médico integrado',
    ])
  })

  it('extrae links de Notion', () => {
    const r = extraerDatosDeMarca(DOC)
    expect(r.linksNotion).toEqual(['https://app.notion.com/p/calendar'])
  })

  it('devuelve arrays vacíos para secciones ausentes', () => {
    const r = extraerDatosDeMarca('# Solo título\n\nSin nada más.')
    expect(r.pilares).toEqual([])
    expect(r.audiencia).toEqual([])
    expect(r.tono).toEqual([])
    expect(r.diferenciadores).toEqual([])
    expect(r.palabrasProhibidas).toEqual([])
    expect(r.queEs).toBeNull()
    expect(r.colorDeMarca).toBeNull()
  })
})
