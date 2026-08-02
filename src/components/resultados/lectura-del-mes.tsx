import { CambiosDeMitadDeMes } from '@/components/resultados/cambios-mitad-de-mes'
import { Card, Chip, Display, Mono } from '@/components/ui/primitives'
import type { LecturaDelAnalista } from '@/lib/datos/resultados'
import { formatDate, formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Lectura del mes — lo que dice el Analista.
 *
 * Tres columnas —Quitar, Meter más, Mejorar— y un cuarto bloque para las piezas
 * que todavía no salen.
 *
 * **Ningún hallazgo se muestra sin su métrica.** El contrato del Analista la
 * exige (`evidence` es obligatorio) y aquí se pinta siempre, en mono, debajo de
 * la frase: sin el número la lista es un montón de opiniones bien redactadas, y
 * lo que hace accionable a un "quitar" es poder ver contra qué se comparó.
 */
export function LecturaDelMes({
  lectura,
  mes,
  clientId,
}: {
  lectura: LecturaDelAnalista | null
  mes: MonthKey
  clientId: string
}) {
  if (!lectura) {
    return (
      <Card className="mt-10">
        <Chip tone="agent">Analista</Chip>
        <Display as="h3" className="mt-4 text-base">
          Lectura del mes
        </Display>
        <p className="text-fg-muted mt-3 max-w-prose text-[13px]">
          El Analista todavía no lee {formatMonthKey(mes)}. Corre el día 3 con el mes cerrado y a
          mitad de mes en modo ligero; también lo puedes disparar desde Agentes. Necesita los
          números capturados para tener con qué comparar.
        </p>
      </Card>
    )
  }

  const { reporte } = lectura

  return (
    <Card className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip tone="agent">Analista</Chip>
        <Mono className="text-fg-muted">
          leído el {formatDate(new Date(lectura.corridaEn), { month: 'short', day: 'numeric' })}
        </Mono>
      </div>

      <Display as="h3" className="mt-4 text-base">
        Lectura del mes
      </Display>
      <p className="mt-3 max-w-prose text-[13px]">{reporte.lectura_del_mes}</p>

      <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
        <Columna titulo="Quitar" hallazgos={reporte.quitar} />
        <Columna titulo="Meter más" hallazgos={reporte.meter_mas} />
        <Columna titulo="Mejorar" hallazgos={reporte.mejorar} />
      </div>

      <CambiosDeMitadDeMes
        clientId={clientId}
        mes={mes}
        cambios={reporte.para_mitad_de_mes.changes}
        sinPublicar={reporte.para_mitad_de_mes.unpublished_count}
        hookPorPieza={lectura.hookPorPieza}
      />
    </Card>
  )
}

interface Hallazgo {
  finding: string
  evidence: { text: string }
  pieces_affected: number
  suggested_change?: string
}

function Columna({ titulo, hallazgos }: { titulo: string; hallazgos: readonly Hallazgo[] }) {
  return (
    <section>
      <h4 className="type-mono text-accent-hot border-line border-b pb-2">{titulo}</h4>

      {hallazgos.length === 0 ? (
        <p className="text-fg-muted mt-3 text-[13px]">Nada que señalar en este bloque.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-5">
          {hallazgos.map((h, i) => (
            <li key={`${h.finding}-${i}`}>
              <p className="text-[13px]">{h.finding}</p>
              <Mono as="p" className="text-fg-muted mt-1.5">
                {h.evidence.text}
              </Mono>
              {h.suggested_change && (
                <p className="text-fg-muted mt-1.5 text-[13px]">→ {h.suggested_change}</p>
              )}
              {h.pieces_affected > 0 && (
                <Mono as="p" className="text-fg-muted mt-1.5">
                  {h.pieces_affected} {h.pieces_affected === 1 ? 'pieza' : 'piezas'}
                </Mono>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
