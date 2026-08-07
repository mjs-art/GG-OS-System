'use client'

import { useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button, Card, Chip, Mono } from '@/components/ui/primitives'
import type { SugerenciaPalabra } from '@/domain/aprendizaje'
import { AGENT_LABEL } from '@/domain/labels'
import { promoverPalabraProhibida } from './acciones'

/**
 * Aprendizaje que se propone solo.
 *
 * `human_edits` deja de ser una lista que alguien tiene que leer y recordar: si
 * una palabra ya se borró dos o más veces, esta tarjeta la ofrece como regla
 * dura de un clic. Es la mitad accionable del bloque de Aprendizaje, y por eso
 * vive arriba de la lista pasiva de correcciones.
 *
 * Solo se renderiza cuando hay algo que proponer — una tarjeta vacía que dice
 * "sin patrones" sería ruido. Al promover, la palabra se quita en el acto: el
 * servidor revalida y la detección ya no la vuelve a sugerir porque pasa a
 * estar cubierta, pero el quitado optimista hace que se sienta resuelto.
 */

export function SugerenciasAprendizaje({
  sugerencias,
  clientId,
  orgId,
  slug,
}: {
  sugerencias: SugerenciaPalabra[]
  clientId: string
  orgId: string
  slug: string
}) {
  const [items, setItems] = useState(sugerencias)
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmadas, setConfirmadas] = useState<string[]>([])

  if (items.length === 0 && confirmadas.length === 0) return null

  async function promover(palabra: string) {
    setPendiente(palabra)
    setError(null)

    const fd = new FormData()
    fd.set('clientId', clientId)
    fd.set('orgId', orgId)
    fd.set('slug', slug)
    fd.set('palabra', palabra)

    const resultado = await promoverPalabraProhibida(fd)
    setPendiente(null)

    if (resultado.status === 'error') {
      setError(resultado.message)
      return
    }

    setItems((previos) => previos.filter((s) => s.palabra !== palabra))
    setConfirmadas((previas) => [...previas, palabra])
  }

  return (
    <Card className="mt-12 flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Sparkles aria-hidden className="text-accent-hot size-4" />
          <Mono className="text-fg">Correcciones que ya son patrón</Mono>
        </span>
        <Mono className="text-fg-muted">{items.length} por revisar</Mono>
      </div>

      <p className="text-fg-muted max-w-prose text-[13px]">
        Estas palabras las has borrado más de una vez de lo que escriben los agentes. Vuélvelas
        regla dura y el Editor de marca las marca sin volver a preguntar — así el agente deja de
        meterlas el mes que entra.
      </p>

      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((s) => (
            <li
              key={s.palabra}
              className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
            >
              <span className="text-fg min-w-[8rem] flex-1 text-[15px] italic">
                &ldquo;{s.palabra}&rdquo;
              </span>

              <Mono className="text-fg-muted">borrada {s.veces} veces</Mono>

              {s.agentes.length > 0 && (
                <span className="flex flex-wrap gap-1.5">
                  {s.agentes.map((a) => (
                    <Chip key={a} tone="agent">
                      {AGENT_LABEL[a]}
                    </Chip>
                  ))}
                </span>
              )}

              <Button
                variant="secondary"
                disabled={pendiente === s.palabra}
                onClick={() => promover(s.palabra)}
              >
                {pendiente === s.palabra ? 'Agregando' : 'Agregar a palabras prohibidas'}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}

      {confirmadas.length > 0 && (
        <div className="border-line flex flex-col gap-1.5 border-t pt-4">
          {confirmadas.map((palabra) => (
            <span key={palabra} className="text-ok flex items-center gap-2">
              <ArrowRight aria-hidden className="size-3.5" />
              <Mono className="text-ok">
                &ldquo;{palabra}&rdquo; ahora es regla dura. Aplica desde la próxima revisión.
              </Mono>
            </span>
          ))}
        </div>
      )}
    </Card>
  )
}
