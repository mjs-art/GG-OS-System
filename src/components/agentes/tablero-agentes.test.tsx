import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TableroAgentes } from '@/components/agentes/tablero-agentes'
import { AGENT_KEYS } from '@/agents/contracts'
import type { MetricasAgente, PanelAgentes } from '@/lib/datos/agentes'

/**
 * Prueba de humo del tablero: que las ocho tarjetas salgan del registro y que
 * apagado se vea como estado normal y no como falla.
 */

// El Server Action no se ejecuta en jsdom y arrastraría el cliente de Supabase.
vi.mock('@/components/agentes/acciones', () => ({
  cambiarEstadoAgente: vi.fn(),
}))

function metricas(key: MetricasAgente['key'], extra: Partial<MetricasAgente> = {}): MetricasAgente {
  return {
    key,
    estado: 'inactivo',
    trabajosHoy: 0,
    escalamientosAbiertos: 0,
    tasaEdicionPct: null,
    corridasMedidas: 0,
    costoMesCents: 0,
    topeMesCents: 500,
    avisoPresupuesto: 'ok',
    encendidoEn: 0,
    clientesConPolitica: 1,
    sparkline: Array.from({ length: 14 }, () => 0),
    ultimaCorrida: null,
    ...extra,
  }
}

function panel(extra: Partial<PanelAgentes> = {}): PanelAgentes {
  const cliente = { id: 'c1', slug: 'bar-ficticio', nombre: 'Bar Ficticio' }
  return {
    agentes: AGENT_KEYS.map((key) => metricas(key)),
    clientes: [cliente],
    clienteActivo: cliente,
    ...extra,
  }
}

describe('el tablero de agentes', () => {
  it('pinta los ocho, con el nombre y la línea del registro', () => {
    render(<TableroAgentes panel={panel()} />)

    expect(screen.getAllByRole('article')).toHaveLength(8)
    expect(screen.getByRole('heading', { name: 'Editor de marca' })).toBeInTheDocument()
    expect(screen.getByText('escribe hook, copy y hashtags de cada pieza')).toBeInTheDocument()
  })

  it('los ocho apagados no son un problema, y lo dice', () => {
    render(<TableroAgentes panel={panel()} />)

    expect(screen.getByText(/Los ocho están apagados, y así se entregan/)).toBeInTheDocument()
    expect(screen.getAllByRole('switch', { name: /Encender para Bar Ficticio/ })).toHaveLength(8)
  })

  it('sin corridas, la tasa de edición no finge un 0%', () => {
    render(<TableroAgentes panel={panel()} />)

    expect(screen.getAllByText('Sin corridas que medir este mes.')).toHaveLength(8)
  })

  it('el link de cada tarjeta arrastra el cliente elegido', () => {
    render(<TableroAgentes panel={panel()} />)

    const enlaces = screen.getAllByRole('link', { name: 'Ver corridas' })
    expect(enlaces[0]).toHaveAttribute('href', '/agentes/estratega?cliente=bar-ficticio')
  })

  it('avisa cuando un agente cruza el 80% del tope, y cuando lo alcanza', () => {
    const agentes = AGENT_KEYS.map((key) => {
      if (key === 'estratega')
        return metricas(key, { avisoPresupuesto: 'aviso', costoMesCents: 410 })
      if (key === 'redactor')
        return metricas(key, { avisoPresupuesto: 'agotado', costoMesCents: 500 })
      return metricas(key)
    })
    render(<TableroAgentes panel={panel({ agentes })} />)

    expect(screen.getByText('80% del tope')).toBeInTheDocument()
    expect(screen.getByText('tope del mes alcanzado')).toBeInTheDocument()
    expect(
      screen.getByText(/no corre hasta el próximo mes o hasta subirle el tope/i),
    ).toBeInTheDocument()
  })

  it('un agente sin tope configurado no finge estar agotado', () => {
    // topeMesCents 0 = sin política. estadoDePresupuesto lo llamaría "agotado",
    // pero la tarjeta no debe pintar alarma donde no hay nada configurado.
    const agentes = AGENT_KEYS.map((key) =>
      metricas(key, { avisoPresupuesto: 'agotado', topeMesCents: 0, costoMesCents: 0 }),
    )
    render(<TableroAgentes panel={panel({ agentes })} />)

    expect(screen.queryByText('tope del mes alcanzado')).not.toBeInTheDocument()
  })
})
