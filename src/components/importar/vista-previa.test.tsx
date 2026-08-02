import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VistaPrevia } from '@/components/importar/vista-previa'
import { construirPlanDeImportacion } from '@/domain/importar-notion'

/**
 * La vista previa es lo único que hay entre un CSV mal exportado y 200 piezas
 * mal mapeadas en la base. Si esta pantalla truena, o se calla algo, la promesa
 * de "nada se escribe sin que lo hayas visto" deja de valer.
 *
 * Por eso lo que se prueba es que PINTE lo incómodo: lo que se queda fuera, los
 * meses que ya tienen piezas y los errores con su número de línea.
 */
describe('VistaPrevia', () => {
  it('pinta el plan completo sin tronar', () => {
    const plan = construirPlanDeImportacion(
      'Tarea,Canal,Formato,Estado,Fecha de Entrega,Fecha de publicación,Responsable,Sprint,Transición-Teaser\n' +
        'Tips de coctelería,Instagram,Carrusel,Guión,2026-09-10,2026-09-15,Ana Gómez,Sprint 12,Yes\n' +
        'Story diaria,,Story,Diseñado,,2026-09-16,,,No\n' +
        'Rechazada,Instagram,Video,Rechazado,,2026-09-17,,,No',
    )
    expect(plan.ok).toBe(true)

    render(<VistaPrevia plan={plan} sprintsExistentes={[]} piezasPorMes={{ '2026-09': 4 }} />)

    expect(screen.getByText('Piezas de feed')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /se queda en Notion/i })).toBeInTheDocument()
    expect(screen.getByText(/Estos meses ya tienen piezas/)).toBeInTheDocument()
    expect(screen.getByText('Se crea')).toBeInTheDocument()
    expect(screen.getByText(/Sprint 12/)).toBeInTheDocument()
    expect(screen.getByText('Tips de coctelería')).toBeInTheDocument()
    expect(screen.getByText(/Transición-Teaser/)).toBeInTheDocument()
    expect(screen.getByText(/septiembre 2026 · ya hay 4/)).toBeInTheDocument()
  })

  it('pinta los errores con su número de línea', () => {
    const plan = construirPlanDeImportacion(
      'Tarea,Formato,Estado,Fecha de publicación\nBuena,Carrusel,Guión,2026-09-15\nMala,Podcast,Guión,2026-09-16',
    )
    render(<VistaPrevia plan={plan} sprintsExistentes={[]} piezasPorMes={{}} />)

    expect(screen.getByText(/Un renglón no se puede mapear/)).toBeInTheDocument()
    expect(screen.getByText('línea 3')).toBeInTheDocument()
  })
})
