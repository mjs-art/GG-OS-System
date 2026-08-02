'use client'

import { useActionState, useState } from 'react'
import { aplicarCambioDelAnalista, type EstadoResultados } from '@/components/resultados/acciones'
import { Button, Mono } from '@/components/ui/primitives'

/**
 * "Para mitad de mes": las piezas que todavía no salen y que el Analista sugiere
 * cambiar, cada una con su cambio propuesto y sus botones.
 *
 * Este bloque es la razón de correr al Analista a mitad de mes. Con un mes de
 * adelanto los resultados no alcanzan para replanear, pero sí para corregir tres
 * piezas que aún no se publican.
 *
 * **Ignorar es local.** No hay tabla donde guardar "esta sugerencia ya la vi", y
 * agregarla es una migración que no puedo escribir desde aquí. Se descarta de la
 * lista mientras dura la sesión y regresa al recargar. Es un límite real y por
 * eso está escrito, no escondido.
 */

const INICIAL: EstadoResultados = { status: 'inicial' }

export interface CambioPropuesto {
  piece_id: string
  scheduled_on: string
  field: 'format' | 'publish_at' | 'hook' | 'cta' | 'pillar'
  from: string
  to: string
  reason: string
}

const LABEL_CAMPO: Record<CambioPropuesto['field'], string> = {
  format: 'Formato',
  publish_at: 'Fecha y hora',
  hook: 'Hook',
  cta: 'CTA',
  pillar: 'Pilar',
}

export function CambiosDeMitadDeMes({
  clientId,
  cambios,
  sinPublicar,
  hookPorPieza,
}: {
  clientId: string
  cambios: readonly CambioPropuesto[]
  sinPublicar: number
  hookPorPieza: Record<string, string>
}) {
  const [ignorados, setIgnorados] = useState<ReadonlySet<string>>(new Set())
  const visibles = cambios.filter((c) => !ignorados.has(claveDe(c)))

  if (cambios.length === 0) {
    return (
      <section className="border-line mt-8 border-t pt-6">
        <h4 className="type-display text-base">Para mitad de mes</h4>
        <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
          {sinPublicar > 0
            ? `Faltan ${sinPublicar} piezas por publicar y ninguna necesita cambio. El mes va como se planeó.`
            : 'No quedan piezas sin publicar este mes.'}
        </p>
      </section>
    )
  }

  return (
    <section className="border-line mt-8 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h4 className="type-display text-base">Para mitad de mes</h4>
        <Mono className="text-fg-muted">
          {sinPublicar} sin publicar · sugiere cambiar {cambios.length}
        </Mono>
      </div>

      {visibles.length === 0 ? (
        <p className="text-fg-muted mt-3 text-[13px]">
          Ignoraste todas las sugerencias. Vuelven a aparecer si recargas la página.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {visibles.map((cambio) => (
            <RenglonDeCambio
              key={claveDe(cambio)}
              clientId={clientId}
              cambio={cambio}
              hook={hookPorPieza[cambio.piece_id] ?? 'Pieza sin hook'}
              onIgnorar={() => setIgnorados((prev) => new Set(prev).add(claveDe(cambio)))}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Una pieza puede traer dos cambios de campos distintos; la llave junta ambos. */
function claveDe(cambio: CambioPropuesto): string {
  return `${cambio.piece_id}:${cambio.field}`
}

function RenglonDeCambio({
  clientId,
  cambio,
  hook,
  onIgnorar,
}: {
  clientId: string
  cambio: CambioPropuesto
  hook: string
  onIgnorar: () => void
}) {
  const [estado, action, pendiente] = useActionState(aplicarCambioDelAnalista, INICIAL)
  const aplicado = estado.status === 'guardado'

  return (
    <li className="border-line bg-surface-2 border-l-[3px] px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <Mono className="text-accent-hot">{cambio.scheduled_on}</Mono>
        <Mono className="text-fg-muted">{LABEL_CAMPO[cambio.field]}</Mono>
      </div>

      <p className="mt-2 text-[13px]">{hook}</p>

      <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
        De <span className="text-fg">{cambio.from}</span> a{' '}
        <span className="text-fg">{cambio.to}</span>. {cambio.reason}
      </p>

      {estado.status !== 'inicial' && (
        <p
          className="mt-3 text-[13px]"
          style={{ color: aplicado ? 'var(--color-ok)' : 'var(--color-accent-hot)' }}
          role="status"
          aria-live="polite"
        >
          {estado.message}
        </p>
      )}

      {!aplicado && (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="pieceId" value={cambio.piece_id} />
          <input type="hidden" name="campo" value={cambio.field} />
          <input type="hidden" name="valor" value={cambio.to} />

          <Button variant="primary" type="submit" disabled={pendiente}>
            {pendiente ? 'Aplicando…' : 'Aplicar'}
          </Button>
          <Button variant="ghost" type="button" onClick={onIgnorar}>
            Ignorar
          </Button>
        </form>
      )}
    </li>
  )
}
