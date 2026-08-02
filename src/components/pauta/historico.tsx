import type { ReactNode } from 'react'
import { Chip, EmptyState, Mono } from '@/components/ui/primitives'
import {
  CHIP_PLATAFORMA,
  formatearEntero,
  formatearMetrica,
  formatearPesos,
  formatearRango,
  type CampanaPauta,
} from '@/domain/pauta'

/**
 * Campañas cerradas.
 *
 * La columna que justifica la tabla es la última: "qué aprendimos". Sin ella
 * esto es un estado de cuenta, y el Pautero arranca cada campaña sin saber qué
 * estructura ya funcionó en esta cuenta. Cuando está vacía se dice, en vez de
 * dejar la celda en blanco.
 */
export function Historico({ campanas }: { campanas: CampanaPauta[] }) {
  if (campanas.length === 0) {
    return (
      <EmptyState
        title="Todavía no cierra ninguna campaña"
        body="Cuando una campaña termine, ciérrala y escribe qué aprendiste. Eso es lo que lee el Pautero para armar la siguiente."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-line border-b">
            <Th>Campaña</Th>
            <Th>Fechas</Th>
            <Th>Plataforma</Th>
            <Th numerica>Presupuesto</Th>
            <Th numerica>Gastado</Th>
            <Th numerica>Resultados</Th>
            <Th numerica>Costo por resultado</Th>
            <Th>Qué aprendimos</Th>
          </tr>
        </thead>
        <tbody>
          {campanas.map((c) => (
            <tr key={c.id} className="border-line border-b align-top last:border-b-0">
              <td className="py-3 pr-4">
                <span className="text-[13px]">{c.nombre}</span>
              </td>
              <Td>{formatearRango(c.inicio, c.fin)}</Td>
              <td className="py-3 pr-4">
                <Chip tone="neutral">{CHIP_PLATAFORMA[c.plataforma]}</Chip>
              </td>
              <Td numerica>{formatearPesos(c.presupuestoCents)}</Td>
              <Td numerica>{formatearPesos(c.gastadoCents)}</Td>
              <Td numerica>{formatearEntero(c.totales.resultados)}</Td>
              <Td numerica>
                {formatearMetrica('costoPorResultado', c.totales.costoPorResultadoCents)}
              </Td>
              <td className="max-w-[280px] py-3 text-[13px] leading-snug">
                {c.aprendizaje ?? (
                  <span className="text-fg-muted">
                    Nadie escribió qué se aprendió. Anótalo mientras se acuerda alguien.
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, numerica }: { children: string; numerica?: boolean }) {
  return (
    <th scope="col" className={`pr-4 pb-2 font-normal ${numerica ? 'text-right' : 'text-left'}`}>
      <Mono className="text-fg-muted">{children}</Mono>
    </th>
  )
}

function Td({ children, numerica }: { children: ReactNode; numerica?: boolean }) {
  return (
    <td className={`py-3 pr-4 ${numerica ? 'text-right' : 'text-left'}`}>
      <Mono className="text-fg-muted tabular-nums">{children}</Mono>
    </td>
  )
}
