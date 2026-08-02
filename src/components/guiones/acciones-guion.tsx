'use client'

import { useState, useTransition } from 'react'
import { cambiarEstadoGuion, editarGuion } from '@/components/guiones/acciones'
import { Button, Mono } from '@/components/ui/primitives'
import type { ScriptStatus } from '@/domain/tendencias'

/**
 * Los tres botones de la ficha. Cliente porque el panel de edición se abre y se
 * cierra sin recargar, y porque el error de una acción tiene que aparecer junto
 * al botón que se apretó y no arriba de la página.
 *
 * Ningún botón publica ni manda nada: aceptar un guion lo marca como aceptado
 * para que entre a producción, y ahí sigue mandando una persona.
 */
export function AccionesGuion({
  guionId,
  slug,
  estado,
  duracionS,
  requiere,
  alternativa,
}: {
  guionId: string
  slug: string
  estado: ScriptStatus
  duracionS: number | null
  requiere: string | null
  alternativa: string | null
}) {
  const [pendiente, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [duracion, setDuracion] = useState(duracionS === null ? '' : String(duracionS))
  const [requerimientos, setRequerimientos] = useState(requiere ?? '')
  const [versionSimple, setVersionSimple] = useState(alternativa ?? '')

  function cambiar(nuevo: 'aceptado' | 'descartado') {
    setError(null)
    startTransition(async () => {
      const resultado = await cambiarEstadoGuion({ guionId, slug, estado: nuevo })
      if (!resultado.ok) setError(resultado.mensaje)
    })
  }

  function guardar() {
    setError(null)
    startTransition(async () => {
      const resultado = await editarGuion({
        guionId,
        slug,
        // Cadena vacía es "lo borré", no "no lo mandé". El schema espera número
        // o nulo, así que la conversión se hace aquí y no en el servidor.
        duracionS: duracion.trim() === '' ? null : Number(duracion),
        requiere: requerimientos,
        alternativa: versionSimple,
      })
      if (resultado.ok) setEditando(false)
      else setError(resultado.mensaje)
    })
  }

  return (
    <div className="border-line mt-6 border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => cambiar('aceptado')}
          disabled={pendiente || estado === 'aceptado'}
        >
          {estado === 'aceptado' ? 'Aceptado' : 'Aceptar'}
        </Button>
        <Button onClick={() => setEditando((abierto) => !abierto)} disabled={pendiente}>
          {editando ? 'Cerrar edición' : 'Editar'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => cambiar('descartado')}
          disabled={pendiente || estado === 'descartado'}
        >
          {estado === 'descartado' ? 'Descartado' : 'Descartar'}
        </Button>
        {pendiente && <Mono className="text-fg-muted">Guardando…</Mono>}
      </div>

      {error && <p className="text-accent-hot mt-3 text-[13px]">{error}</p>}

      {editando && (
        <div className="border-line mt-4 grid gap-4 border-t pt-4">
          <p className="text-fg-muted text-[13px]">
            Lo que corrijas aquí queda registrado como edición humana. Esa lista es lo que después
            evita que el Guionista repita el mismo error.
          </p>

          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Duración en segundos
            </Mono>
            <input
              type="number"
              min={1}
              max={3600}
              value={duracion}
              onChange={(e) => setDuracion(e.target.value)}
              className="border-line bg-surface-2 text-fg w-32 rounded-xs border px-3 py-2 text-[13px]"
            />
          </label>

          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Requiere
            </Mono>
            <textarea
              rows={2}
              value={requerimientos}
              onChange={(e) => setRequerimientos(e.target.value)}
              placeholder="Dos tomas, mismo encuadre, con tripié."
              className="border-line bg-surface-2 text-fg placeholder:text-fg-muted w-full rounded-xs border px-3 py-2 text-[13px]"
            />
          </label>

          <label className="grid gap-1.5">
            <Mono className="text-fg-muted" as="span">
              Alternativa
            </Mono>
            <textarea
              rows={2}
              value={versionSimple}
              onChange={(e) => setVersionSimple(e.target.value)}
              placeholder="La versión que sí se puede grabar un martes."
              className="border-line bg-surface-2 text-fg placeholder:text-fg-muted w-full rounded-xs border px-3 py-2 text-[13px]"
            />
          </label>

          <div className="flex gap-2">
            <Button variant="primary" onClick={guardar} disabled={pendiente}>
              Guardar cambios
            </Button>
            <Button variant="ghost" onClick={() => setEditando(false)} disabled={pendiente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
