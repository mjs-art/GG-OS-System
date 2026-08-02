import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Bandeja } from '@/components/bandeja/bandeja'
import type { Escalamiento } from '@/domain/bandeja'

/**
 * Los atajos tienen que funcionar de verdad, y "de verdad" incluye el caso que
 * los rompe: escribirle al agente en el input sin que la primera `a` apruebe la
 * tarjeta. Eso no se prueba leyendo el código, se prueba tecleando.
 */

const resolverEscalamiento = vi.fn(async () => ({ ok: true }) as const)
const push = vi.fn()

vi.mock('@/components/bandeja/acciones', () => ({
  resolverEscalamiento: (...args: unknown[]) => resolverEscalamiento(...(args as [])),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}))

const AHORA = '2026-08-14T18:00:00.000Z'

function escalamiento(id: string, extra: Partial<Escalamiento> = {}): Escalamiento {
  return {
    id,
    agente: 'editor_marca',
    severidad: 'media',
    pregunta: `Pregunta de ${id}`,
    opciones: [
      { key: 'confirmar', label: 'Confirmar' },
      { key: 'elegir', label: 'Elegir yo cuáles' },
    ],
    creadoEn: '2026-08-10T10:00:00.000Z',
    cliente: { id: 'c1', nombre: 'Dry Express', slug: 'dry-express' },
    pieza: null,
    ...extra,
  }
}

function pintar(escalamientos: Escalamiento[]) {
  return render(<Bandeja escalamientos={escalamientos} piezasAvanzadasHoy={47} ahora={AHORA} />)
}

/** Las tarjetas en el orden en que se ven. */
function tarjetas() {
  return screen.getAllByRole('article')
}

beforeEach(() => {
  resolverEscalamiento.mockClear()
  push.mockClear()
  // jsdom no implementa scrollIntoView y el cursor del teclado lo usa para
  // arrastrar la tarjeta activa a la vista.
  Element.prototype.scrollIntoView = vi.fn()
})

describe('la bandeja', () => {
  it('cuenta lo que hay y arranca con la primera tarjeta seleccionada', () => {
    pintar([escalamiento('a'), escalamiento('b', { severidad: 'critica' })])

    expect(screen.getByText('2 escalamientos · 1 crítico')).toBeInTheDocument()
    // La crítica manda, así que va arriba y es la que trae el cursor.
    expect(tarjetas()[0]).toHaveAttribute('aria-current', 'true')
    expect(within(tarjetas()[0] as HTMLElement).getByText('Pregunta de b')).toBeInTheDocument()
  })

  it('J y K mueven el cursor y no se salen de la lista', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a'), escalamiento('b'), escalamiento('c')])

    await usuario.keyboard('j')
    expect(tarjetas()[1]).toHaveAttribute('aria-current', 'true')

    // Hasta abajo y una de más: se queda en la última.
    await usuario.keyboard('jj')
    expect(tarjetas()[2]).toHaveAttribute('aria-current', 'true')

    await usuario.keyboard('kkkk')
    expect(tarjetas()[0]).toHaveAttribute('aria-current', 'true')
  })

  it('A aprueba con la primera opción que propuso el agente', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a')])

    await usuario.keyboard('a')

    expect(resolverEscalamiento).toHaveBeenCalledWith({
      escalamientoId: 'a',
      opcion: 'Confirmar',
      respuesta: null,
    })
  })

  it('las teclas 1 y 2 eligen la opción de ese lugar', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a')])

    await usuario.keyboard('2')

    expect(resolverEscalamiento).toHaveBeenCalledWith({
      escalamientoId: 'a',
      opcion: 'Elegir yo cuáles',
      respuesta: null,
    })
  })

  it('escribirle al agente NO dispara los atajos', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a'), escalamiento('b')])

    const input = screen.getAllByPlaceholderText('Responder al agente…')[0] as HTMLInputElement
    await usuario.click(input)
    // Trae 'a' (aprobar), 'j' (mover), 's' (posponer) y un '3'.
    await usuario.keyboard('ajusta el hook, son 3')

    expect(resolverEscalamiento).not.toHaveBeenCalled()
    expect(input.value).toBe('ajusta el hook, son 3')
  })

  it('al resolver, la tarjeta se va y el contador baja', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a'), escalamiento('b')])

    expect(screen.getByText('2 escalamientos · 0 críticos')).toBeInTheDocument()

    await usuario.click(screen.getAllByRole('button', { name: /Confirmar/ })[0] as HTMLElement)

    // El contador baja de inmediato, sin esperar a que termine el colapso.
    expect(screen.getByText('1 escalamiento · 0 críticos')).toBeInTheDocument()
    await waitFor(() => expect(tarjetas()).toHaveLength(1))
  })

  it('si el servidor rechaza, la tarjeta regresa y dice por qué', async () => {
    resolverEscalamiento.mockResolvedValueOnce({
      ok: false,
      mensaje: 'Ese escalamiento ya lo resolvió alguien más.',
    } as never)

    const usuario = userEvent.setup()
    pintar([escalamiento('a')])

    await usuario.click(screen.getByRole('button', { name: /Confirmar/ }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('ya lo resolvió alguien más'),
    )
    expect(tarjetas()).toHaveLength(1)
  })

  it('S manda la tarjeta al final sin resolverla', async () => {
    const usuario = userEvent.setup()
    pintar([escalamiento('a'), escalamiento('b')])

    expect(within(tarjetas()[0] as HTMLElement).getByText('Pregunta de a')).toBeInTheDocument()

    await usuario.keyboard('s')

    expect(within(tarjetas()[1] as HTMLElement).getByText('Pregunta de a')).toBeInTheDocument()
    expect(resolverEscalamiento).not.toHaveBeenCalled()
  })

  it('E abre la pieza cuando la hay', async () => {
    const usuario = userEvent.setup()
    pintar([
      escalamiento('a', {
        pieza: {
          id: 'p1',
          formato: 'reel',
          hook: 'nadie limpia hielo así',
          publishAt: '2026-08-14T19:00:00.000Z',
          color: 'var(--color-pillar-1)',
          href: '/cliente/dry-express?mes=2026-08#planner',
        },
      }),
    ])

    await usuario.keyboard('e')

    expect(push).toHaveBeenCalledWith('/cliente/dry-express?mes=2026-08#planner')
  })

  it('la bandeja vacía cuenta lo que avanzó sin ti', () => {
    pintar([])

    expect(screen.getByText('Bandeja limpia')).toBeInTheDocument()
    expect(
      screen.getByText('Los agentes están trabajando. 47 piezas avanzaron hoy sin ti.'),
    ).toBeInTheDocument()
  })
})
