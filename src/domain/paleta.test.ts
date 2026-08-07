import { describe, expect, it } from 'vitest'
import { construirComandos, filtrarComandos, type FuentePaleta } from './paleta'

const SECCIONES = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'planner', label: 'Planner' },
  { id: 'resultados', label: 'Resultados' },
]

const CLIENTES = [
  { slug: 'dry-express', name: 'Dry Express' },
  { slug: 'tower-bar', name: 'Tower Bar' },
]

const fuera: FuentePaleta = {
  clientes: CLIENTES,
  clienteActualSlug: null,
  clienteActualNombre: null,
  secciones: SECCIONES,
}

const dentro: FuentePaleta = {
  clientes: CLIENTES,
  clienteActualSlug: 'dry-express',
  clienteActualNombre: 'Dry Express',
  secciones: SECCIONES,
}

describe('construir comandos', () => {
  it('fuera de un cliente no ofrece secciones', () => {
    const comandos = construirComandos(fuera)
    expect(comandos.some((c) => c.icono === 'seccion')).toBe(false)
    // Sí trae los cinco destinos fijos y los dos clientes.
    expect(comandos.filter((c) => c.grupo === 'Ir a')).toHaveLength(5)
    expect(comandos.filter((c) => c.grupo === 'Cliente')).toHaveLength(2)
  })

  it('dentro de un cliente pone sus secciones primero', () => {
    const comandos = construirComandos(dentro)
    expect(comandos[0]?.icono).toBe('seccion')
    expect(comandos[0]?.href).toBe('/cliente/dry-express#resumen')
    expect(comandos[0]?.grupo).toBe('Sección · Dry Express')
  })
})

describe('filtrar comandos', () => {
  const comandos = construirComandos(fuera)

  it('sin query devuelve el inicio de la lista recortado', () => {
    expect(filtrarComandos(comandos, '', 3)).toHaveLength(3)
  })

  it('ignora el acento en ambos lados', () => {
    // El label lleva acento; la query no. Y al revés.
    const resultados = filtrarComandos(construirComandos(dentro), 'resu')
    expect(resultados.some((c) => c.label === 'Resumen')).toBe(true)
    expect(resultados.some((c) => c.label === 'Resultados')).toBe(true)
  })

  it('cruza palabras entre label y grupo', () => {
    // "dry" está en el nombre del cliente; "cliente" en el grupo.
    const resultados = filtrarComandos(comandos, 'dry cliente')
    expect(resultados).toHaveLength(1)
    expect(resultados[0]?.href).toBe('/cliente/dry-express')
  })

  it('pone primero lo que empieza con la query', () => {
    // "Calendario" (destino) debe ganarle a un cliente que solo lo contenga.
    const conCal = construirComandos({
      ...fuera,
      clientes: [{ slug: 'x', name: 'Bar del Calendario' }],
    })
    const resultados = filtrarComandos(conCal, 'calen')
    expect(resultados[0]?.label).toBe('Calendario')
  })

  it('no devuelve nada cuando ninguna palabra coincide', () => {
    expect(filtrarComandos(comandos, 'zzz')).toEqual([])
  })

  it('respeta el tope', () => {
    expect(filtrarComandos(comandos, '', 2)).toHaveLength(2)
  })
})
