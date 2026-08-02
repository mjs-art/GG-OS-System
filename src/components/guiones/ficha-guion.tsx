import { AccionesGuion } from '@/components/guiones/acciones-guion'
import { Card, Chip, Display, Mono } from '@/components/ui/primitives'
import { AGENT_LABEL, PIECE_FORMAT_LABEL } from '@/domain/labels'
import {
  describirMomentum,
  partesDeFecha,
  SCRIPT_STATUS_LABEL,
  TREND_KIND_LABEL,
} from '@/domain/tendencias'
import type { Pilar } from '@/lib/datos/clientes'
import type { Guion } from '@/lib/datos/guiones'

/**
 * Una ficha por guion propuesto.
 *
 * El orden de lectura no es decorativo: primero QUÉ se está copiando (la
 * tendencia que Ana registró), luego QUÉ TANTO le queda a la marca, y hasta
 * abajo el guion escena por escena. Un guion que se lee antes que su fit se
 * acepta por bonito.
 */
export function FichaGuion({
  guion,
  pilares,
  slug,
  hoy,
}: {
  guion: Guion
  pilares: Pilar[]
  slug: string
  hoy: string
}) {
  const pilar = pilares.find((p) => p.id === guion.pilarId)
  const descartado = guion.estado === 'descartado'

  return (
    <Card
      className={descartado ? 'opacity-50' : undefined}
      aria-label={`Guion ${guion.tendencia?.titulo ?? 'sin tendencia'}`}
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Mono className="text-fg">{encabezado(guion)}</Mono>

        {pilar && (
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: pilar.color }}
            />
            <Mono className="text-fg-muted">{pilar.name}</Mono>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {guion.estado !== 'propuesto' && (
            <Chip tone={guion.estado === 'descartado' ? 'neutral' : 'ok'}>
              {SCRIPT_STATUS_LABEL[guion.estado]}
            </Chip>
          )}
          {/* La procedencia nunca se oculta dentro del estudio. */}
          <Chip tone="agent">{AGENT_LABEL.guionista}</Chip>
        </div>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_auto]">
        <div>
          <Mono className="text-fg-muted" as="div">
            Tendencia base
          </Mono>
          {guion.tendencia ? (
            <>
              <p className="mt-2 text-[15px]">{guion.tendencia.titulo}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Mono className="text-fg-muted">
                  {TREND_KIND_LABEL[guion.tendencia.tipo]} ·{' '}
                  {describirMomentum(guion.tendencia.momentum, guion.tendencia.vistaEl, hoy)}
                </Mono>
                {(guion.tendencia.audioUrl ?? guion.tendencia.referenciaUrl) && (
                  <a
                    href={guion.tendencia.audioUrl ?? guion.tendencia.referenciaUrl ?? '#'}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="type-mono text-fg-muted hover:text-accent-hot underline underline-offset-4"
                  >
                    {guion.tendencia.audioUrl ? 'Abrir el audio' : 'Ver la referencia'} ↗
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="text-fg-muted mt-2 text-[13px]">
              Este guion no quedó amarrado a ninguna tendencia del radar. Registra la que copió para
              poder medirle el momentum.
            </p>
          )}
        </div>

        {/* El fit va en display y grande porque es el número con el que se
            decide. El /100 chico evita que se lea como un porcentaje de otra cosa. */}
        <div className="md:text-right">
          <Mono className="text-fg-muted" as="div">
            Fit de marca
          </Mono>
          <div className="mt-1 flex items-baseline gap-1 md:justify-end">
            <Display className="text-5xl">{guion.fitScore ?? '—'}</Display>
            <Mono className="text-fg-muted">/100</Mono>
          </div>
        </div>
      </div>

      {guion.fitReason && (
        <p className="text-fg-muted mt-3 max-w-prose text-[13px]">{guion.fitReason}</p>
      )}

      <div className="border-line mt-6 border-t pt-4">
        <div className="flex items-baseline justify-between gap-4">
          <Mono className="text-fg-muted">Guion por escenas</Mono>
          <Mono className="text-fg-muted">
            {guion.duracionS === null ? 'Sin duración' : `${guion.duracionS} s`}
          </Mono>
        </div>

        {guion.escenas.length > 0 ? (
          <TablaEscenas guion={guion} />
        ) : (
          <p className="text-fg-muted mt-3 text-[13px]">
            El guion no trae escenas. Vuelve a correr al Guionista o captúralas con Editar.
          </p>
        )}
      </div>

      <dl className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <Mono className="text-fg-muted" as="dt">
            Requiere
          </Mono>
          <dd className="mt-1.5 text-[13px]">{guion.requiere ?? 'Sin requerimientos anotados.'}</dd>
        </div>
        <div>
          <Mono className="text-fg-muted" as="dt">
            Alternativa
          </Mono>
          <dd className="mt-1.5 text-[13px]">
            {guion.alternativa ??
              'Sin versión simple. Pídesela al Guionista antes de agendar la grabación.'}
          </dd>
        </div>
      </dl>

      <AccionesGuion
        guionId={guion.id}
        slug={slug}
        estado={guion.estado}
        duracionS={guion.duracionS}
        requiere={guion.requiere}
        alternativa={guion.alternativa}
      />
    </Card>
  )
}

/** `REEL · 14 SEP`. Sin pieza todavía, dice qué falta en vez de dejar el hueco. */
function encabezado(guion: Guion): string {
  const formato = guion.formato ? PIECE_FORMAT_LABEL[guion.formato] : 'Sin pieza'
  if (!guion.publicaEl) return `${formato} · sin fecha`
  const { dia, mes } = partesDeFecha(guion.publicaEl)
  return `${formato} · ${dia} ${mes}`
}

/** Un segundo con un decimal: `0.0–2.5`. Es como se marca en el set. */
function segundos(valor: number): string {
  return valor.toFixed(1)
}

function TablaEscenas({ guion }: { guion: Guion }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="type-mono w-full min-w-[42rem] border-collapse text-left">
        <thead>
          <tr className="border-line text-fg-muted border-b">
            <th scope="col" className="py-2 pr-3 font-medium">
              Tiempo
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Plano
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Acción
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Texto en pantalla
            </th>
            <th scope="col" className="py-2 font-medium">
              Voz en off
            </th>
          </tr>
        </thead>
        <tbody>
          {guion.escenas.map((escena, i) => (
            <tr
              key={`${escena.desde}-${escena.hasta}-${i}`}
              className="border-line border-b align-top last:border-b-0"
            >
              <td className="text-fg-muted py-2 pr-3 whitespace-nowrap">
                {segundos(escena.desde)}–{segundos(escena.hasta)}
              </td>
              <td className="py-2 pr-3">{escena.plano}</td>
              <td className="py-2 pr-3 normal-case">{escena.accion}</td>
              <td className="py-2 pr-3 normal-case">
                {escena.textoEnPantalla ? `"${escena.textoEnPantalla}"` : '—'}
              </td>
              <td className="py-2 normal-case">{escena.voz ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
