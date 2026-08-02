import { AccionesPlan } from '@/components/volumen/acciones-plan'
import { DistribucionPilares } from '@/components/volumen/distribucion-pilares'
import { TablaConteos } from '@/components/volumen/tabla-conteos'
import { Card, Chip, Display, Divider, EmptyState, Mono } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import { planComoTexto, planDeVolumen } from '@/lib/datos/volumen'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Volumen del mes.
 *
 * Es el plan que se le presenta al cliente, así que el criterio de toda la
 * sección es uno: **ningún número sin su razón**. Un plan de volumen sin
 * razones es una lista de cantidades que nadie puede defender cuando el cliente
 * pregunta por qué bajaron los posts.
 *
 * Server Component completo salvo los dos botones del final. El plan se lee de
 * `volume_plans` y las razones de la última corrida del Estratega; ninguna de
 * las dos cosas necesita JavaScript en el navegador.
 */
export async function SeccionVolumen({ cliente, mes }: { cliente: Cliente; mes: MonthKey }) {
  const plan = await planDeVolumen(cliente.id, mes, cliente.pilares)

  if (!plan) {
    return (
      <>
        <Encabezado mes={mes} />
        <EmptyState
          title={`Sin plan para ${formatMonthKey(mes)}`}
          body={
            'Todavía no hay volumen definido para este mes. Declara tu capacidad y el objetivo por ' +
            'pilar, y el Estratega arma la propuesta con sus razones.'
          }
          action={
            <AccionesPlan
              clientId={cliente.id}
              mes={mes}
              pilares={cliente.pilares.map((p) => ({
                id: p.id,
                nombre: p.name,
                color: p.color,
                objetivoPct: p.targetPct,
              }))}
              capacidadDeclarada={null}
              totalPlaneado={0}
              textoParaPresentacion={`${cliente.name} · ${formatMonthKey(mes)}\nTodavía no hay plan de volumen.`}
            />
          }
        />
      </>
    )
  }

  const texto = planComoTexto(plan, cliente.name, formatMonthKey(mes))

  return (
    <>
      <Encabezado mes={mes} />

      {/* El titular del plan. Es lo que se lee primero en la junta. */}
      <Display className="text-3xl sm:text-5xl">
        {plan.total} piezas · {formatMonthKey(mes)}
      </Display>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        {plan.capacidadDeclarada !== null && (
          <Mono className="text-fg-muted">
            capacidad declarada {plan.capacidadDeclarada} piezas
          </Mono>
        )}
        {plan.aprobadoEn === null ? (
          <Chip tone="high">Sin aprobar</Chip>
        ) : (
          <Chip tone="ok">Aprobado</Chip>
        )}
      </div>

      {plan.notaDeCapacidad && (
        <p className="text-fg-muted mt-3 max-w-prose text-[13px]">{plan.notaDeCapacidad}</p>
      )}

      <div className="mt-6">
        <Divider />
        <TablaConteos
          titulo={`Feed (${plan.totalFeed})`}
          total={plan.totalFeed}
          renglones={plan.feed}
        />
        <Divider />
        <TablaConteos
          titulo={`Stories (${plan.totalStories})`}
          total={plan.totalStories}
          renglones={plan.stories}
        />
        <Divider />
        <DistribucionPilares pilares={plan.pilares} />
        <Divider />
      </div>

      <PorQueEstaMezcla bullets={plan.porque} />

      <AccionesPlan
        clientId={cliente.id}
        mes={mes}
        pilares={plan.pilares.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          color: p.color,
          objetivoPct: p.objetivoPct,
        }))}
        capacidadDeclarada={plan.capacidadDeclarada}
        totalPlaneado={plan.total}
        textoParaPresentacion={texto}
      />
    </>
  )
}

function Encabezado({ mes }: { mes: MonthKey }) {
  return (
    <header className="border-line mb-6 border-b pb-3">
      <Display as="h2" className="text-xl">
        Volumen del mes
      </Display>
      <p className="text-fg-muted mt-1 text-[13px]">
        Cuánto contenido va en {formatMonthKey(mes)} y por qué. Es el plan que se le presenta al
        cliente sin traducir.
      </p>
    </header>
  )
}

/**
 * El bloque del Estratega. Cada bullet lleva su dato duro debajo, en mono, y
 * ese dato es lo único que hace discutible la propuesta: sin él el bullet es
 * una opinión con formato de conclusión.
 */
function PorQueEstaMezcla({
  bullets,
}: {
  bullets: ReadonlyArray<{ cambio: string; porque: string; dato: string }>
}) {
  return (
    <Card className="mt-8">
      <Chip tone="agent">Estratega</Chip>
      <Display as="h3" className="mt-4 text-base">
        Por qué esta mezcla
      </Display>

      {bullets.length === 0 ? (
        <p className="text-fg-muted mt-3 max-w-prose text-[13px]">
          El Estratega no ha corrido para este mes, así que las cantidades de arriba no traen su
          razón. Recalcula el volumen para que las escriba antes de presentarlo.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {bullets.map((b, i) => (
            <li key={`${b.cambio}-${i}`} className="border-line border-l-[3px] pl-4">
              <p className="max-w-prose text-[13px]">
                <span className="text-fg">{b.cambio}</span>
                {b.cambio.endsWith('.') ? ' ' : ': '}
                <span className="text-fg-muted">{b.porque}</span>
              </p>
              {b.dato && (
                <Mono as="p" className="text-accent-hot mt-1.5">
                  {b.dato}
                </Mono>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
