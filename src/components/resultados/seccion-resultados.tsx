import Link from 'next/link'
import { CapturaDeMetricas } from '@/components/resultados/captura-metricas'
import { GraficaSeguidores } from '@/components/resultados/grafica-seguidores'
import { LecturaDelMes } from '@/components/resultados/lectura-del-mes'
import { PiezasDestacadas } from '@/components/resultados/piezas-destacadas'
import { OrigenDeLosNumeros, RejillaMetricas } from '@/components/resultados/rejilla-metricas'
import { TablasRendimiento } from '@/components/resultados/tablas-rendimiento'
import { Display, Divider, EmptyState, Mono } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import { datosDeResultados } from '@/lib/datos/resultados'
import { addMonths, formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Resultados.
 *
 * Tiene **selector de mes propio**, separado del header. No es un capricho de
 * diseño: el planner se trabaja con un mes de adelanto y los resultados que se
 * leen son los del mes cerrado. Amarrar las dos vistas al mismo mes obliga a
 * saltar de septiembre a agosto y de regreso para escribir una sola pieza.
 *
 * El mes de la sección vive en la URL (`?mesResultados=`) y no en estado de
 * React: así se comparte por link, sobrevive al refresh y el botón de atrás
 * hace lo que uno espera. La página raíz es la que lee el query param y lo pasa
 * como prop, porque solo una página puede leer `searchParams`.
 */
export async function SeccionResultados({
  cliente,
  mes,
  mesResultados,
}: {
  cliente: Cliente
  /** El mes del header. Se conserva en los links para no perderlo al navegar. */
  mes: MonthKey
  /** El mes de esta sección. Sin él se muestra el mismo del header. */
  mesResultados?: MonthKey | undefined
}) {
  const mesVisible = mesResultados ?? mes
  const datos = await datosDeResultados(cliente.id, mesVisible)

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Resultados
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            Lo que rindió el mes. De aquí sale el plan de volumen del mes siguiente.
          </p>
        </div>
        <SelectorDeMes slug={cliente.slug} mesHeader={mes} mesVisible={mesVisible} />
      </header>

      {datos.actual === null ? (
        <EmptyState
          title={`Sin datos de ${formatMonthKey(mesVisible)}`}
          body={`Todavía no hay datos de ${formatMonthKey(mesVisible).split(' ')[0]}. Importa el CSV de Meta Business Suite o captura los números a mano.`}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Mono className="text-fg-muted">
              {formatMonthKey(mesVisible)}
              {datos.anterior && ` · comparado con ${formatMonthKey(datos.anterior.mes)}`}
            </Mono>
            <OrigenDeLosNumeros origen={datos.actual.origen} />
          </div>

          <div className="mt-6">
            <RejillaMetricas actual={datos.actual} anterior={datos.anterior} />
          </div>

          <div className="mt-10">
            <GraficaSeguidores serie={datos.seguidores} />
          </div>

          <Divider className="my-10" />

          <TablasRendimiento porFormato={datos.porFormato} porPilar={datos.porPilar} />

          <Divider className="my-10" />

          <PiezasDestacadas top={datos.top} ultimas={datos.ultimas} />
        </>
      )}

      <LecturaDelMes lectura={datos.lectura} mes={mesVisible} clientId={cliente.id} />

      <CapturaDeMetricas clientId={cliente.id} mes={mesVisible} actual={datos.actual} />
    </>
  )
}

/**
 * Dos links, no botones con estado. El mes del header viaja en el mismo query
 * para que moverse en resultados no reinicie el resto de la página, y el ancla
 * `#resultados` devuelve el scroll a esta sección después de navegar.
 */
function SelectorDeMes({
  slug,
  mesHeader,
  mesVisible,
}: {
  slug: string
  mesHeader: MonthKey
  mesVisible: MonthKey
}) {
  const href = (destino: MonthKey) =>
    `/cliente/${slug}?mes=${mesHeader}&mesResultados=${destino}#resultados`

  const anterior = addMonths(mesVisible, -1)
  const siguiente = addMonths(mesVisible, 1)

  return (
    <div className="border-line flex items-center rounded-xs border" data-print="hide">
      <Link
        href={href(anterior)}
        aria-label={`Ver resultados de ${formatMonthKey(anterior)}`}
        className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
      >
        ‹
      </Link>
      <Mono className="min-w-[9rem] px-2 text-center">{formatMonthKey(mesVisible)}</Mono>
      <Link
        href={href(siguiente)}
        aria-label={`Ver resultados de ${formatMonthKey(siguiente)}`}
        className="type-mono text-fg-muted hover:text-fg px-2.5 py-2"
      >
        ›
      </Link>
    </div>
  )
}
