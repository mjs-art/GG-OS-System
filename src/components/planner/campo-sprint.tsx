'use client'

import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Button, Mono } from '@/components/ui/primitives'
import { LabelCampo } from '@/components/planner/controles'
import type { SprintPlanner } from '@/components/planner/tipos'

/**
 * § Planner · Sprint de la pieza.
 *
 * El sprint se puede crear sin salir del drawer. Mandarla a otra pantalla a dar
 * de alta el bloque y regresar es la forma más confiable de que este campo se
 * quede vacío para siempre — y un campo que nadie llena es peor que no tenerlo,
 * porque los reportes lo cuentan como si significara algo.
 *
 * Los sprints son del ESTUDIO, no del cliente: un bloque de trabajo cruza
 * cuentas. Por eso el select trae los mismos en todos los clientes.
 */
export function CampoSprint({
  pieceId,
  sprintId,
  sprints,
  creando,
  onElegir,
  onCrear,
}: {
  pieceId: string
  sprintId: string | null
  sprints: readonly SprintPlanner[]
  creando: boolean
  onElegir: (sprintId: string | null) => void
  onCrear: (sprint: { name: string; startsOn: string; endsOn: string }) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [inicia, setInicia] = useState('')
  const [termina, setTermina] = useState('')
  const [problema, setProblema] = useState<string | null>(null)

  const completo = nombre.trim() !== '' && inicia !== '' && termina !== ''

  function crear() {
    if (!completo) return
    if (termina < inicia) {
      setProblema('El sprint no puede terminar antes de empezar.')
      return
    }
    setProblema(null)
    onCrear({ name: nombre.trim(), startsOn: inicia, endsOn: termina })
    setNombre('')
    setInicia('')
    setTermina('')
    setAbierto(false)
  }

  return (
    <section>
      <LabelCampo htmlFor={`sprint-${pieceId}`}>Sprint</LabelCampo>

      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`sprint-${pieceId}`}
          value={sprintId ?? ''}
          onChange={(e) => onElegir(e.target.value || null)}
          className="border-line bg-bg text-fg min-w-0 flex-1 rounded-xs border px-3 py-2 text-[13px]"
        >
          <option value="">Sin sprint</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <Button
          variant="secondary"
          aria-expanded={abierto}
          onClick={() => {
            setAbierto(!abierto)
            setProblema(null)
          }}
        >
          {abierto ? (
            <X aria-hidden className="size-3.5" />
          ) : (
            <Plus aria-hidden className="size-3.5" />
          )}
          {abierto ? 'Cancelar' : 'Nuevo sprint'}
        </Button>
      </div>

      {sprints.length === 0 && !abierto && (
        <p className="text-fg-muted mt-1.5 text-[12px]">
          Todavía no hay sprints en el estudio. Crea el primero con el botón de arriba: el trabajo
          se organiza en bloques, no solo por mes.
        </p>
      )}

      {abierto && (
        <div className="border-line mt-2 flex flex-col gap-2 rounded-xs border p-3">
          <input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Sprint 12 · quincena de septiembre"
            maxLength={120}
            className="border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px]"
            aria-label="Nombre del sprint"
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Mono className="text-fg-muted shrink-0">Del</Mono>
              <input
                type="date"
                value={inicia}
                onChange={(e) => setInicia(e.target.value)}
                className="border-line bg-bg text-fg min-w-0 flex-1 rounded-xs border px-2 py-1.5 text-[13px]"
              />
            </label>
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <Mono className="text-fg-muted shrink-0">Al</Mono>
              <input
                type="date"
                value={termina}
                onChange={(e) => setTermina(e.target.value)}
                className="border-line bg-bg text-fg min-w-0 flex-1 rounded-xs border px-2 py-1.5 text-[13px]"
              />
            </label>
          </div>
          {problema && <p className="text-accent-hot text-[12px]">{problema}</p>}
          <div>
            <Button variant="primary" disabled={!completo || creando} onClick={crear}>
              {creando ? 'Creando…' : 'Crear y asignar'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
