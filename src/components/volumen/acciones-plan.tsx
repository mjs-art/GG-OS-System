'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { recalcularVolumen, type EstadoVolumen } from '@/components/volumen/acciones'
import { Button, Chip, Display, Mono } from '@/components/ui/primitives'
import type { MonthKey } from '@/lib/time'

/**
 * Los dos botones del plan: recalcular y copiar.
 *
 * Es el único `'use client'` de la sección y está lo más abajo posible del
 * árbol: todo lo demás del volumen se arma en el servidor.
 *
 * El texto para presentación llega **ya armado desde el servidor** en
 * `textoParaPresentacion`. Rearmarlo aquí significaría dos formatos que se
 * separan solos, y el que se le manda al cliente sería el que nadie revisa.
 */
export function AccionesPlan({
  clientId,
  mes,
  pilares,
  capacidadDeclarada,
  totalPlaneado,
  textoParaPresentacion,
}: {
  clientId: string
  mes: MonthKey
  pilares: ReadonlyArray<{ id: string; nombre: string; color: string; objetivoPct: number }>
  capacidadDeclarada: number | null
  totalPlaneado: number
  textoParaPresentacion: string
}) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3" data-print="hide">
      <Button variant="agent" type="button" onClick={() => setAbierto(true)}>
        Recalcular volumen
      </Button>

      <BotonCopiar texto={textoParaPresentacion} />

      {abierto && (
        <ModalRecalcular
          clientId={clientId}
          mes={mes}
          pilares={pilares}
          capacidadDeclarada={capacidadDeclarada ?? Math.max(totalPlaneado, 1)}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </div>
  )
}

function BotonCopiar({ texto }: { texto: string }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      toast('Copiado. Ya lo puedes pegar en la presentación.')
    } catch {
      // El portapapeles falla en contexto no seguro y cuando el navegador
      // niega el permiso. Decir qué pasó es más útil que un toast de éxito
      // mentiroso sobre un portapapeles vacío.
      toast('El navegador no dejó copiar. Selecciona el plan y cópialo a mano.')
    }
  }

  return (
    <Button variant="secondary" type="button" onClick={copiar}>
      Copiar para presentación
    </Button>
  )
}

const ESTADO_INICIAL: EstadoVolumen = { status: 'inicial' }

function ModalRecalcular({
  clientId,
  mes,
  pilares,
  capacidadDeclarada,
  onCerrar,
}: {
  clientId: string
  mes: MonthKey
  pilares: ReadonlyArray<{ id: string; nombre: string; color: string; objetivoPct: number }>
  capacidadDeclarada: number
  onCerrar: () => void
}) {
  const [estado, formAction, pendiente] = useActionState(recalcularVolumen, ESTADO_INICIAL)
  const [capacidad, setCapacidad] = useState(capacidadDeclarada)
  const [objetivos, setObjetivos] = useState<Record<string, number>>(() =>
    Object.fromEntries(pilares.map((p) => [p.id, Math.round(p.objetivoPct)])),
  )
  const dialogo = useRef<HTMLDivElement>(null)

  // El foco entra al modal al abrirlo. Sin esto, quien navega con teclado sigue
  // parado en el botón de atrás y no se entera de que se abrió nada.
  useEffect(() => {
    dialogo.current?.focus()
  }, [])

  useEffect(() => {
    if (estado.status === 'guardado') {
      toast(estado.message ?? 'Plan guardado.')
      onCerrar()
    }
  }, [estado, onCerrar])

  const suma = Object.values(objetivos).reduce((a, b) => a + b, 0)
  const cuadra = Math.abs(suma - 100) <= 1

  return (
    <div
      className="bg-bg/90 fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCerrar()
      }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-recalcular"
        tabIndex={-1}
        className="border-line bg-surface w-full max-w-lg rounded-xs border p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <Chip tone="agent">Estratega</Chip>
            <Display as="h2" id="titulo-recalcular" className="mt-3 text-lg">
              Recalcular volumen
            </Display>
          </div>
          <Button variant="ghost" type="button" onClick={onCerrar} aria-label="Cerrar">
            Cerrar
          </Button>
        </div>

        <form action={formAction} className="flex flex-col gap-6">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="mes" value={mes} />

          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="capacidad" className="type-mono text-fg-muted">
                Capacidad del mes
              </label>
              <Mono>{capacidad} piezas</Mono>
            </div>
            <input
              id="capacidad"
              name="capacidad"
              type="range"
              min={0}
              max={200}
              step={1}
              value={capacidad}
              onChange={(e) => setCapacidad(Number(e.target.value))}
              className="accent-accent-hot mt-3 w-full"
            />
            <p className="text-fg-muted mt-1.5 text-[13px]">
              Lo que de verdad puedes producir, no lo que te gustaría. El Estratega no propone más
              que esto.
            </p>
          </div>

          <fieldset>
            <legend className="type-mono text-fg-muted mb-3">Objetivo por pilar</legend>
            <div className="flex flex-col gap-4">
              {pilares.map((pilar) => (
                <div key={pilar.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <label
                      htmlFor={`objetivo-${pilar.id}`}
                      className="flex min-w-0 items-center gap-2 text-[13px]"
                    >
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: pilar.color }}
                      />
                      <span className="truncate">{pilar.nombre}</span>
                    </label>
                    <Mono>{objetivos[pilar.id] ?? 0}%</Mono>
                  </div>
                  <input
                    id={`objetivo-${pilar.id}`}
                    name={`objetivo:${pilar.id}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={objetivos[pilar.id] ?? 0}
                    onChange={(e) =>
                      setObjetivos((prev) => ({ ...prev, [pilar.id]: Number(e.target.value) }))
                    }
                    className="accent-accent-hot mt-2 w-full"
                  />
                </div>
              ))}
            </div>
            <Mono as="p" className={cuadra ? 'text-fg-muted mt-3' : 'text-accent-hot mt-3'}>
              suman {Math.round(suma)}% de 100%
            </Mono>
          </fieldset>

          <div>
            <label htmlFor="notas" className="type-mono text-fg-muted">
              Notas para el Estratega
            </label>
            <textarea
              id="notas"
              name="notas"
              rows={3}
              maxLength={2000}
              placeholder="Ej. En septiembre no hay equipo la última semana."
              className="border-line bg-bg text-fg mt-2 w-full rounded-xs border p-3 text-[13px]"
            />
            <p className="text-fg-muted mt-1.5 text-[13px]">
              Las notas viajan con la corrida del Estratega. Todavía no se guardan en el plan.
            </p>
          </div>

          {estado.status === 'error' && (
            <p className="border-accent-hot bg-surface-2 border-l-[3px] px-4 py-3 text-[13px]">
              {estado.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" type="submit" disabled={pendiente || !cuadra}>
              {pendiente ? 'Guardando…' : 'Guardar restricciones'}
            </Button>
            <Button variant="ghost" type="button" onClick={onCerrar}>
              Cancelar
            </Button>
          </div>

          <p className="text-fg-muted text-[13px]">
            Esto guarda tu capacidad y tus objetivos. La propuesta con sus razones la escribe el
            Estratega; la app no inventa un plan.
          </p>
        </form>
      </div>
    </div>
  )
}
