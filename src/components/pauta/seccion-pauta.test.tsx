import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TarjetaCampana } from './tarjeta-campana'
import { Historico } from './historico'
import { totalizar, type CampanaPauta, type MetricaDiaria } from '@/domain/pauta'

function dias(base: number[]): MetricaDiaria[] {
  return base.map((res, i) => ({
    fecha: `2026-07-${26 + i}`.slice(0, 10),
    gastoCents: 7000,
    impresiones: 4380 + i * 100,
    alcance: 3510 + i * 100,
    clics: 79 + i,
    resultados: res,
  }))
}

const A = dias([3, 3, 2, 3, 3])
const B = dias([1, 1, 1, 1, 1])

const campana: CampanaPauta = {
  id: 'c1',
  nombre: 'Noche de Jazz',
  objetivo: 'Tráfico a reservas',
  plataforma: 'instagram',
  presupuestoCents: 200000,
  gastadoCents: 98000,
  inicio: '2026-07-26',
  fin: '2026-08-08',
  estado: 'activa',
  objetivoAprendizaje: 'Si el interés frío rinde mejor que los similares.',
  metricaResultado: 'reservas',
  aprendizaje: null,
  adSets: [
    {
      id: 'a',
      nombre: 'A · Interés',
      tipoPublico: 'interes',
      publico: { intereses: ['jazz'], edad: [25, 45] },
      presupuestoCents: 100000,
      gastadoCents: 35000,
      estado: 'activo',
      diarias: A,
      totales: totalizar(A),
    },
    {
      id: 'b',
      nombre: 'B · Similares',
      tipoPublico: 'similares',
      publico: { fuente: 'visitantes web 90 dias' },
      presupuestoCents: 100000,
      gastadoCents: 35000,
      estado: 'activo',
      diarias: B,
      totales: totalizar(B),
    },
  ],
  creativos: [
    {
      id: 'cr1',
      adSetId: 'a',
      adSetNombre: 'A · Interés',
      piezaId: 'p1',
      formato: 'reel',
      titulo: 'jueves de jazz, otra vez',
      publicarEl: '2026-07-30T02:00:00Z',
      estado: 'activo',
      color: '#810100',
    },
  ],
  propuestas: [],
  totales: totalizar([...A, ...B]),
}

describe('la sección Pauta se pinta', () => {
  it('la tarjeta trae la barra de presupuesto, los días y el resultado principal', () => {
    render(<TarjetaCampana campana={campana} hoy="2026-08-07" />)
    expect(screen.getByText(/\$980 de \$2,000/)).toBeInTheDocument()
    expect(screen.getByText('Queda 1 día')).toBeInTheDocument()
    expect(screen.getAllByText('META').length).toBeGreaterThan(0)
    // 14 + 5 resultados.
    expect(screen.getByText('19')).toBeInTheDocument()
  })

  it('resalta el mejor valor de cada métrica en accent', () => {
    const { container } = render(<TarjetaCampana campana={campana} hoy="2026-08-01" />)
    const resaltados = [...container.querySelectorAll('.text-accent-hot')].map((n) => n.textContent)
    // A gana en resultados (14 vs 5) y en costo por resultado ($25 vs $70).
    expect(resaltados).toContain('14')
    expect(resaltados.some((t) => t?.startsWith('$25'))).toBe(true)
    // Y nunca gana el gasto: los dos gastaron lo mismo y no se compara.
    expect(resaltados.filter((t) => t === '$350')).toHaveLength(0)
  })

  it('dibuja una línea por ad set sin inventar puntos', () => {
    const { container } = render(<TarjetaCampana campana={campana} hoy="2026-08-01" />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
    expect(container.querySelectorAll('circle')).toHaveLength(10)
  })

  it('el histórico dice cuando falta el aprendizaje en vez de dejar la celda vacía', () => {
    render(<Historico campanas={[{ ...campana, estado: 'cerrada' }]} />)
    expect(screen.getByText(/Nadie escribió qué se aprendió/)).toBeInTheDocument()
  })
})
