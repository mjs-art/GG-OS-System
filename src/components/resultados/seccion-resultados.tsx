import Link from 'next/link'
import { CapturaDeMetricas } from '@/components/resultados/captura-metricas'
import { GraficaSeguidores } from '@/components/resultados/grafica-seguidores'
import { LecturaDelMes } from '@/components/resultados/lectura-del-mes'
import { PiezasDestacadas } from '@/components/resultados/piezas-destacadas'
import { OrigenDeLosNumeros, RejillaMetricas } from '@/components/resultados/rejilla-metricas'
import { TablasRendimiento } from '@/components/resultados/tablas-rendimiento'
import { Display, Divider, Mono } from '@/components/ui/primitives'
import type { Cliente } from '@/lib/datos/clientes'
import { datosDeResultados } from '@/lib/datos/resultados'
import { addMonths, formatMonthKey, type MonthKey } from '@/lib/time'

export async function SeccionResultados({
  cliente,
  mes,
  mesResultados,
}: {
  cliente: Cliente
  mes: MonthKey
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
        <CapturaDeMetricas
          clientId={cliente.id}
          mes={mesVisible}
          actual={null}
          abiertoPorDefault={true}
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

      {datos.actual !== null && (
        <CapturaDeMetricas
          clientId={cliente.id}
          mes={mesVisible}
          actual={datos.actual}
          abiertoPorDefault={false}
        />
      )}
    </>
  )
}

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
