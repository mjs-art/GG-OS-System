'use client'

import { useActionState, type ReactNode } from 'react'
import { decidirPropuesta, marcarAplicada } from '@/components/pauta/acciones'
import { AvisoNoEjecutamos } from '@/components/pauta/aviso-no-ejecutamos'
import { Entrada } from '@/components/pauta/campos'
import { ACCION_INICIAL, type EstadoAccion } from '@/components/pauta/estado-accion'
import { Button, Chip, Display, EmptyState, Mono } from '@/components/ui/primitives'
import {
  estaPorAplicar,
  instruccionesVigentes,
  pasosDeInstrucciones,
  PROPUESTA_ESTADO_LABEL,
  PROPUESTA_TIPO_LABEL,
  type PropuestaPauta,
} from '@/domain/pauta'
import { cn } from '@/lib/cn'
import { formatDate, formatTime } from '@/lib/time'

/**
 * § Propuestas del Pautero.
 *
 * El flujo completo del trato con el sistema vive en este archivo: el agente
 * propone, la persona decide, y al aprobar aparecen los pasos que esa persona
 * va a ejecutar **en el ads manager**. La app no ejecuta nada, y eso se dice
 * dos veces en pantalla a propósito.
 *
 * Es `'use client'` porque los tres botones necesitan estado de envío y el
 * mensaje de error tiene que aparecer sin perder el scroll de una sección que
 * mide dos pantallas. Los Server Actions viven en `acciones.ts`.
 */
export function Propuestas({ propuestas, slug }: { propuestas: PropuestaPauta[]; slug: string }) {
  if (propuestas.length === 0) {
    return (
      <EmptyState
        title="El Pautero no tiene nada que proponer"
        body="Las propuestas aparecen cuando hay al menos tres días de métricas capturadas y dos ad sets que comparar. Importa el CSV del ads manager abajo para darle con qué trabajar."
      />
    )
  }

  // Lo que espera decisión va primero: es lo único de esta lista que cuesta
  // dinero dejar sin ver.
  const orden = { propuesta: 0, aprobada: 1, aprobada_alternativa: 1, aplicada: 2, rechazada: 3 }
  const ordenadas = [...propuestas].sort((a, b) => orden[a.estado] - orden[b.estado])

  return (
    <div className="flex flex-col gap-4">
      {ordenadas.map((p) => (
        <Propuesta key={p.id} propuesta={p} slug={slug} />
      ))}
    </div>
  )
}

function Propuesta({ propuesta, slug }: { propuesta: PropuestaPauta; slug: string }) {
  const [estado, decidir, decidiendo] = useActionState<EstadoAccion, FormData>(
    decidirPropuesta,
    ACCION_INICIAL,
  )

  const sinDecidir = propuesta.estado === 'propuesta'
  const porAplicar = estaPorAplicar(propuesta.estado)

  return (
    <article
      className={cn(
        'bg-surface rounded-xs border',
        // El hairline más marcado es lo que separa este bloque del resto de la
        // sección: aquí es donde se decide sobre dinero.
        sinDecidir ? 'border-accent' : 'border-line',
      )}
    >
      <header className="border-line flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="agent">Pautero</Chip>
          <Mono className="text-fg-muted">
            Propuesta · Día {propuesta.dia.dia} de {propuesta.dia.total} · {propuesta.campanaNombre}
          </Mono>
        </div>
        <Chip tone={sinDecidir ? 'accent' : porAplicar ? 'high' : 'neutral'}>
          {PROPUESTA_ESTADO_LABEL[propuesta.estado]}
        </Chip>
      </header>

      <div className="flex flex-col gap-5 p-5">
        <p className="max-w-prose text-[14px] leading-relaxed">{propuesta.razonamiento}</p>

        <Renglon label="Sugiero">
          <Display className="text-sm">
            {PROPUESTA_TIPO_LABEL[propuesta.tipo]}
            {propuesta.adSetNombre ? ` · ${propuesta.adSetNombre}` : ''}
          </Display>
        </Renglon>

        {propuesta.impacto && (
          <Renglon label="Impacto estimado">
            <Mono className="text-fg">{propuesta.impacto}</Mono>
          </Renglon>
        )}

        {propuesta.riesgo && (
          <Renglon label="Riesgo">
            <Mono className="text-fg">{propuesta.riesgo}</Mono>
            {propuesta.alternativa.razonamiento && (
              <Mono className="text-fg-muted mt-1.5 block">
                Alternativa: {propuesta.alternativa.razonamiento}
              </Mono>
            )}
          </Renglon>
        )}

        {sinDecidir && (
          <form action={decidir} className="flex flex-col gap-3">
            <input type="hidden" name="propuestaId" value={propuesta.id} />
            <input type="hidden" name="slug" value={slug} />

            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                name="decision"
                value="aprobar"
                variant="primary"
                disabled={decidiendo}
              >
                Aprobar
              </Button>
              <Button
                type="submit"
                name="decision"
                value="aprobar_alternativa"
                disabled={decidiendo || !propuesta.alternativa.instrucciones}
                {...(propuesta.alternativa.instrucciones
                  ? {}
                  : { title: 'Esta propuesta no trae una alternativa con pasos concretos.' })}
              >
                Aprobar la alternativa
              </Button>
              <Button type="submit" name="decision" value="rechazar" disabled={decidiendo}>
                Rechazar
              </Button>
            </div>

            <Mono className="text-fg-muted">
              Aprobar solo guarda tu decisión y te entrega los pasos. No mueve un peso.
            </Mono>

            {estado.estado === 'error' && <Mono className="text-accent-hot">{estado.mensaje}</Mono>}
          </form>
        )}

        {porAplicar && <PorAplicar propuesta={propuesta} slug={slug} />}

        {propuesta.estado === 'aplicada' && <YaAplicada propuesta={propuesta} />}

        {propuesta.estado === 'rechazada' && (
          <Mono className="text-fg-muted">
            Rechazada. El Pautero la vuelve a evaluar con las métricas del día siguiente.
          </Mono>
        )}
      </div>
    </article>
  )
}

function Renglon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
      <Mono className="text-fg-muted shrink-0 sm:w-40">{label}</Mono>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/**
 * El estado que hace visible la regla: aprobada aquí, pendiente allá.
 *
 * Los pasos van numerados y no en un párrafo corrido porque se leen con el ads
 * manager abierto en la otra mano, y ahí sí importa poder perder el renglón y
 * volver a encontrarlo.
 */
function PorAplicar({ propuesta, slug }: { propuesta: PropuestaPauta; slug: string }) {
  const [estado, aplicar, aplicando] = useActionState<EstadoAccion, FormData>(
    marcarAplicada,
    ACCION_INICIAL,
  )

  const pasos = pasosDeInstrucciones(instruccionesVigentes(propuesta) ?? '')

  return (
    <div className="border-line border-l-accent-hot bg-surface-2 rounded-xs border border-l-[3px] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Mono className="text-accent-hot">Te toca a ti · en el ads manager</Mono>
        {propuesta.estado === 'aprobada_alternativa' && (
          <Mono className="text-fg-muted">Se aprobó la alternativa</Mono>
        )}
      </div>

      <AvisoNoEjecutamos variante="breve" className="mt-2" />

      {pasos.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {pasos.map((paso, i) => (
            <li key={paso} className="flex gap-3">
              <Mono className="text-fg-muted shrink-0 tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </Mono>
              <span className="text-[13px] leading-relaxed">{paso}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-fg-muted mt-4 text-[13px]">
          Esta propuesta quedó aprobada sin pasos escritos. Pídele al Pautero que los genere antes
          de tocar la campaña.
        </p>
      )}

      <form action={aplicar} className="mt-5 flex flex-col gap-3">
        <input type="hidden" name="propuestaId" value={propuesta.id} />
        <input type="hidden" name="slug" value={slug} />
        <Entrada
          name="nota"
          placeholder="Nota opcional: qué quedó exactamente (ej. B pausado, A a $130/día)"
          maxLength={1000}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={aplicando}>
            {aplicando ? 'Guardando…' : 'Marcar como aplicada'}
          </Button>
          {estado.estado === 'error' && <Mono className="text-accent-hot">{estado.mensaje}</Mono>}
        </div>
      </form>
    </div>
  )
}

function YaAplicada({ propuesta }: { propuesta: PropuestaPauta }) {
  const cuando = propuesta.aplicadaEn ? new Date(propuesta.aplicadaEn) : null

  return (
    <div className="border-line rounded-xs border border-dashed p-4">
      <Mono className="text-ok">
        Aplicada en el ads manager
        {cuando ? ` · ${formatDate(cuando)} a las ${formatTime(cuando)}` : ''}
      </Mono>
      {propuesta.notaAplicacion && (
        <p className="text-fg-muted mt-2 text-[13px]">{propuesta.notaAplicacion}</p>
      )}
    </div>
  )
}
