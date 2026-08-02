import { ComparacionAdSets } from '@/components/pauta/comparacion-ad-sets'
import { CreativosImpulsados } from '@/components/pauta/creativos-impulsados'
import { GraficaCostoPorResultado } from '@/components/pauta/grafica-costo'
import { Mono } from '@/components/ui/primitives'
import {
  CHIP_PLATAFORMA,
  diasEntre,
  formatearPesos,
  formatearRango,
  type CampanaPauta,
} from '@/domain/pauta'
import { cn } from '@/lib/cn'

/**
 * El detalle de una campaña: qué se está probando y cómo va cada público.
 *
 * "Qué vamos a aprender" va arriba de las métricas y no al final. Es la
 * pregunta que la campaña vino a contestar, y leerla antes que los números
 * cambia lo que se busca en la tabla: sin ella, la lectura por default es
 * "cuál gastó más".
 */
export function DetalleCampana({ campana }: { campana: CampanaPauta }) {
  const diario = presupuestoDiario(campana)

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Dato label="Fechas" valor={formatearRango(campana.inicio, campana.fin)} />
        <Dato label="Objetivo" valor={campana.objetivo} />
        <Dato
          label="Presupuesto"
          valor={`${formatearPesos(campana.presupuestoCents)}${diario ? ` · ${formatearPesos(diario)}/día` : ''}`}
        />
        <Dato label="Plataforma" valor={CHIP_PLATAFORMA[campana.plataforma]} />
      </dl>

      <section className="border-line border-l-accent bg-surface-2 rounded-xs border border-l-[3px] p-4">
        <Mono className="text-fg-muted">Qué vamos a aprender</Mono>
        <p className="mt-2 max-w-prose text-[13px]">
          {campana.objetivoAprendizaje ??
            'Nadie escribió qué se busca aprender con esta campaña. Anótalo antes de que cierre: ' +
              'sin eso, la campaña que sigue arranca de cero.'}
        </p>
      </section>

      <section>
        <Encabezado titulo="Ad sets" nota={`${campana.adSets.length} públicos comparables`} />
        <ComparacionAdSets adSets={campana.adSets} />
      </section>

      <section>
        <Encabezado titulo="Creativos" nota="Piezas del planner que se impulsan" />
        <CreativosImpulsados creativos={campana.creativos} adSets={campana.adSets} />
      </section>

      <section>
        <Encabezado titulo="Costo por resultado por día" nota="Una línea por ad set" />
        <GraficaCostoPorResultado adSets={campana.adSets} />
      </section>
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Mono as="dt" className="text-fg-muted">
        {label}
      </Mono>
      <dd className="text-[13px]">{valor}</dd>
    </div>
  )
}

export function Encabezado({
  titulo,
  nota,
  className,
}: {
  titulo: string
  nota?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-line mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b pb-2',
        className,
      )}
    >
      <Mono className="text-fg">{titulo}</Mono>
      {nota && <Mono className="text-fg-muted">{nota}</Mono>}
    </div>
  )
}

/**
 * Presupuesto por día, en centavos enteros.
 *
 * Se reparte con división entera y no con `/`: $2,000 entre 7 días da
 * 28571.428… centavos, y arrastrar esa fracción a la pantalla produce un
 * "$285.71428571428573/día" que además no suma el total.
 */
function presupuestoDiario(campana: CampanaPauta): number | null {
  if (campana.presupuestoCents <= 0) return null
  const dias = Math.max(1, diasEntre(campana.inicio, campana.fin) + 1)
  return Math.round(campana.presupuestoCents / dias)
}
