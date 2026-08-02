import { AvisoNoEjecutamos } from '@/components/pauta/aviso-no-ejecutamos'
import { CapturaMetricas } from '@/components/pauta/captura-metricas'
import { Encabezado } from '@/components/pauta/detalle-campana'
import { Historico } from '@/components/pauta/historico'
import { Propuestas } from '@/components/pauta/propuestas'
import { TarjetaCampana } from '@/components/pauta/tarjeta-campana'
import { Display, EmptyState, Mono } from '@/components/ui/primitives'
import { adSetsCapturables, formatearPesos, type DatosPauta } from '@/domain/pauta'

/**
 * § Pauta.
 *
 * El orden de los bloques no es decorativo: campañas → propuestas → histórico →
 * captura. Se lee de arriba abajo como "cómo va, qué hay que decidir, qué ya
 * aprendimos, con qué se alimenta". Las propuestas van arriba del histórico
 * porque son lo único de esta pantalla que cuesta dinero dejar sin ver.
 *
 * Server Component. Lo único que baja como JavaScript al navegador son las
 * propuestas y el bloque de captura, que sí necesitan formularios con estado;
 * las tarjetas se abren con `<details>` nativo.
 */
export function SeccionPauta({
  datos,
  slug,
  hoy,
}: {
  /** Sale de `datosPauta(cliente.id)` en `@/lib/datos/pauta`. */
  datos: DatosPauta
  /** Slug del cliente. Los formularios lo mandan para invalidar su dashboard. */
  slug: string
  /** `2026-08-01` en la zona del estudio: `fechaLocal(systemClock.now())`. */
  hoy: string
}) {
  const { activas, historico } = datos
  const propuestas = activas.flatMap((c) => c.propuestas)
  const sinDecidir = propuestas.filter((p) => p.estado === 'propuesta').length
  const presupuestoVivo = activas.reduce((suma, c) => suma + c.presupuestoCents, 0)

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Pauta
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            {activas.length === 0
              ? 'Ninguna campaña corriendo.'
              : `${activas.length} ${activas.length === 1 ? 'campaña abierta' : 'campañas abiertas'} · ${formatearPesos(presupuestoVivo)} comprometidos`}
          </p>
        </div>
        {sinDecidir > 0 && (
          <Mono className="text-accent-hot">
            {sinDecidir} {sinDecidir === 1 ? 'propuesta espera' : 'propuestas esperan'} tu decisión
          </Mono>
        )}
      </header>

      <AvisoNoEjecutamos className="mb-10" />

      <section>
        <Encabezado titulo="Campañas activas" />
        {activas.length === 0 ? (
          <EmptyState
            title="No hay pauta corriendo"
            body="Arma la campaña en Meta o TikTok Ads y captúrala aquí con sus ad sets. El Pautero la empieza a leer en cuanto haya tres días de métricas."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {activas.map((c) => (
              <TarjetaCampana key={c.id} campana={c} hoy={hoy} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <Encabezado
          titulo="Propuestas del Pautero"
          nota={sinDecidir > 0 ? `${sinDecidir} sin decidir` : 'Todo decidido'}
        />
        <Propuestas propuestas={propuestas} slug={slug} />
      </section>

      <section className="mt-12">
        <Encabezado titulo="Histórico" nota="Campañas cerradas" />
        <Historico campanas={historico} />
      </section>

      <section className="mt-12">
        <Encabezado titulo="Captura de métricas" />
        <CapturaMetricas
          campanas={activas.map((c) => ({ id: c.id, nombre: c.nombre }))}
          adSets={adSetsCapturables(datos)}
          slug={slug}
          hoy={hoy}
        />
      </section>
    </>
  )
}
