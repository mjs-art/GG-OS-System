import { Chip, Display, Mono, ProgressBar } from '@/components/ui/primitives'
import {
  AD_SET_ESTADO_LABEL,
  esMejor,
  formatearMetrica,
  formatearPesos,
  METRICAS,
  pctPresupuestoGastado,
  PUBLICO_LABEL,
  valorDeMetrica,
  type AdSetPauta,
} from '@/domain/pauta'
import { cn } from '@/lib/cn'

/**
 * Los ad sets uno junto a otro, con el mejor valor de cada métrica en accent.
 *
 * La comparación es el único motivo por el que se corren dos públicos con el
 * mismo presupuesto, así que la tabla tiene que contestar "¿cuál va mejor?" sin
 * que nadie divida nada mentalmente.
 *
 * El resalte no es "el número más grande": en CPM, CPC y costo por resultado lo
 * bueno es el número chico. Esa asimetría vive en `@/domain/pauta` y está
 * probada, porque invertirla pintaría de accent justo el ad set al que hay que
 * quitarle dinero.
 */
export function ComparacionAdSets({ adSets }: { adSets: AdSetPauta[] }) {
  if (adSets.length === 0) {
    return (
      <p className="text-fg-muted text-[13px]">
        Esta campaña no tiene ad sets todavía. Créalos en el ads manager y captúralos aquí para
        poder comparar públicos.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <caption className="sr-only">
          Métricas por ad set. El mejor valor de cada métrica está resaltado.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="border-line w-40 border-b pb-3 align-bottom">
              <Mono className="text-fg-muted">Métrica</Mono>
            </th>
            {adSets.map((a) => (
              <th
                key={a.id}
                scope="col"
                className="border-line min-w-[180px] border-b border-l pb-3 pl-4 align-bottom"
              >
                <EncabezadoAdSet adSet={a} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICAS.map((metrica) => {
            const valores = adSets.map((a) => valorDeMetrica(a.totales, metrica.clave))

            return (
              <tr key={metrica.clave} className="border-line border-b last:border-b-0">
                <th scope="row" className="py-2.5 pr-4 font-normal">
                  <Mono className="text-fg-muted">{metrica.label}</Mono>
                </th>
                {adSets.map((a, i) => {
                  const valor = valores[i] ?? null
                  const ganador = esMejor(metrica.clave, valor, valores)
                  return (
                    <td key={a.id} className="border-line border-l py-2.5 pl-4">
                      <Mono
                        className={cn(
                          'tabular-nums',
                          ganador ? 'text-accent-hot' : 'text-fg',
                          valor === null && 'text-fg-muted',
                        )}
                      >
                        {formatearMetrica(metrica.clave, valor)}
                      </Mono>
                      {/* El color solo no es accesible: quien no lo distingue
                          necesita leer por qué ese número está marcado. */}
                      {ganador && (
                        <span className="sr-only">
                          {' '}
                          — mejor {metrica.label.toLowerCase()} de la campaña
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function EncabezadoAdSet({ adSet }: { adSet: AdSetPauta }) {
  const pct = pctPresupuestoGastado(adSet.gastadoCents, adSet.presupuestoCents)

  return (
    <div className="flex flex-col gap-2">
      <Display className="text-sm">{adSet.nombre}</Display>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone="neutral">{PUBLICO_LABEL[adSet.tipoPublico]}</Chip>
        <Chip tone={adSet.estado === 'activo' ? 'ok' : 'neutral'}>
          {AD_SET_ESTADO_LABEL[adSet.estado]}
        </Chip>
      </div>
      <p className="text-fg-muted max-w-[220px] text-[12px] leading-snug normal-case">
        {describirPublico(adSet.publico)}
      </p>
      <div className="flex flex-col gap-1">
        <Mono className="text-fg-muted tabular-nums">
          {formatearPesos(adSet.gastadoCents)} de {formatearPesos(adSet.presupuestoCents)} · {pct}%
        </Mono>
        <ProgressBar value={adSet.gastadoCents} max={adSet.presupuestoCents} />
      </div>
    </div>
  )
}

/**
 * `audience_def` es jsonb libre: lo escribe el Pautero y su forma cambia según
 * el tipo de público. Se recorre en vez de esperar llaves fijas, y los valores
 * se aplanan a texto — un `[25, 45]` crudo en la pantalla no dice "de 25 a 45".
 */
export function describirPublico(publico: Record<string, unknown>): string {
  const partes: string[] = []

  for (const [llave, valor] of Object.entries(publico)) {
    const texto = Array.isArray(valor)
      ? valor.map((v) => String(v)).join(', ')
      : typeof valor === 'object' && valor !== null
        ? JSON.stringify(valor)
        : String(valor)

    if (texto.trim() === '') continue
    partes.push(`${llave}: ${texto}`)
  }

  return partes.length > 0 ? partes.join(' · ') : 'Sin definición de público capturada.'
}
