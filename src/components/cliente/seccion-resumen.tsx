import { Card, Chip, Display, Mono, Stat } from '@/components/ui/primitives'
import { PIECE_STATUS_LABEL, PIECE_STATUS_ORDER } from '@/domain/labels'
import type { Cliente, Pieza, Story } from '@/lib/datos/clientes'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Resumen — lo que se lee de un vistazo antes de decidir nada.
 *
 * Todos los números salen de las piezas del mes, no de columnas guardadas. Un
 * contador persistido se desincroniza en cuanto alguien mueve una pieza, y
 * entonces el número que ves y la realidad dejan de coincidir sin aviso.
 */
export function SeccionResumen({
  cliente,
  mes,
  piezas,
  stories,
}: {
  cliente: Cliente
  mes: MonthKey
  piezas: Pieza[]
  stories: Story[]
}) {
  const pipeline = PIECE_STATUS_ORDER.map((estado) => ({
    estado,
    label: PIECE_STATUS_LABEL[estado],
    conteo: piezas.filter((p) => p.status === estado).length,
  }))

  const total = piezas.length + stories.length
  const aprobadas = piezas.filter((p) => p.status === 'aprobado' || p.status === 'publicado').length
  const pctAprobado = piezas.length > 0 ? Math.round((aprobadas / piezas.length) * 100) : 0
  const mayor = Math.max(...pipeline.map((p) => p.conteo), 1)

  const alertas = construirAlertas(piezas, stories)

  return (
    <>
      <header className="border-line mb-6 border-b pb-3">
        <Display as="h2" className="text-xl">
          Resumen
        </Display>
        <p className="text-fg-muted mt-1 text-[13px]">{formatMonthKey(mes)}</p>
      </header>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={total} label="Piezas del mes" />
        <Stat value={`${pctAprobado}%`} label="Aprobado" />
        <Stat value={stories.length} label="Stories" />
        <Stat value={cliente.pilares.length} label="Pilares" />
      </div>

      {/* Barra de pipeline: seis segmentos con hairline entre ellos. */}
      <div className="mt-8">
        <div className="border-line flex overflow-hidden rounded-xs border">
          {pipeline.map(({ estado, conteo }, i) => (
            <div
              key={estado}
              className="border-line flex-1 border-r last:border-r-0"
              style={{
                backgroundColor:
                  conteo === mayor && conteo > 0 ? 'var(--color-accent)' : 'transparent',
                opacity: conteo === 0 ? 0.35 : 1,
              }}
              aria-hidden={i > 0 ? undefined : undefined}
            >
              <div className="px-2 py-3 text-center">
                <Display className="text-lg">{conteo}</Display>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex">
          {pipeline.map(({ estado, label }) => (
            <Mono key={estado} className="text-fg-muted flex-1 text-center">
              {label}
            </Mono>
          ))}
        </div>
      </div>

      {alertas.length > 0 && (
        <ul className="mt-8 flex flex-col gap-2">
          {alertas.map((a) => (
            <li
              key={a.texto}
              className="bg-surface flex items-start gap-3 border-l-[3px] px-4 py-3"
              style={{ borderLeftColor: a.color }}
            >
              <p className="text-[13px]">{a.texto}</p>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8">
        <Chip tone="agent">Analista</Chip>
        <p className="text-fg-muted mt-4 text-[13px]">
          La lectura del mes aparece aquí en cuanto haya resultados capturados. Importa el CSV de
          Meta Business Suite en la sección Resultados o captura los números a mano.
        </p>
      </Card>
    </>
  )
}

interface Alerta {
  texto: string
  color: string
}

/**
 * Máximo tres alertas, y solo las accionables.
 *
 * El tope no es estético: una lista de quince avisos se deja de leer completa,
 * y entonces la alerta que sí importaba se pierde entre las otras catorce.
 */
function construirAlertas(piezas: Pieza[], stories: Story[]): Alerta[] {
  const alertas: Alerta[] = []

  const conCliente = piezas.filter((p) => p.status === 'con_cliente').length
  if (conCliente > 0) {
    alertas.push({
      texto: `${conCliente} ${conCliente === 1 ? 'pieza espera' : 'piezas esperan'} aprobación del cliente.`,
      color: 'var(--color-high)',
    })
  }

  const sinFecha = piezas.filter((p) => !p.publishAt).length
  if (sinFecha > 0) {
    alertas.push({
      texto: `${sinFecha} ${sinFecha === 1 ? 'pieza no tiene' : 'piezas no tienen'} fecha de publicación asignada.`,
      color: 'var(--color-accent-hot)',
    })
  }

  if (stories.length === 0 && piezas.length > 0) {
    alertas.push({
      texto: 'No hay stories planeadas este mes. La permanencia depende de la constancia diaria.',
      color: 'var(--color-medium)',
    })
  }

  return alertas.slice(0, 3)
}
