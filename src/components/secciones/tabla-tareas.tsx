'use client'

import { useState } from 'react'
import { Chip, EmptyState, Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import {
  DEPENDE_LABEL,
  DEPENDE_TONE,
  TAREA_ESTADO_LABEL,
  TAREA_ESTADO_TONE,
  type DependeDe,
  type EstadoTarea,
} from './etiquetas'

/**
 * La tabla de pendientes, con el filtro rápido.
 *
 * Es cliente solo por el filtro. Las fechas ya vienen formateadas del servidor:
 * si se formatearan aquí, el render del servidor y el del navegador podrían
 * caer en husos distintos y React marcaría un error de hidratación en una
 * pantalla que nadie estaba tocando.
 */

export interface FilaTarea {
  id: string
  title: string
  dependsOn: DependeDe
  status: EstadoTarea
  /** Ya formateada, o `null` si la tarea no tiene fecha límite. */
  textoFecha: string | null
  /** Pasada de fecha y todavía sin cerrar. */
  vencida: boolean
}

export function TablaTareas({ tareas }: { tareas: FilaTarea[] }) {
  const [soloCliente, setSoloCliente] = useState(false)

  const visibles = soloCliente ? tareas.filter((t) => t.dependsOn === 'cliente') : tareas
  const delCliente = tareas.filter((t) => t.dependsOn === 'cliente').length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={soloCliente}
            onChange={(e) => setSoloCliente(e.target.checked)}
            className="accent-accent size-3.5"
          />
          <Mono className="text-fg-muted">Solo lo que depende del cliente</Mono>
        </label>
        <Mono className="text-fg-muted">
          {delCliente} de {tareas.length} en cancha del cliente
        </Mono>
      </div>

      {visibles.length === 0 ? (
        <EmptyState
          title={soloCliente ? 'Nada atorado con el cliente' : 'Sin pendientes'}
          body={
            soloCliente
              ? 'Todo lo que falta depende de ti o de un agente. Quita el filtro para verlo.'
              : 'Cuando algo dependa de ti, del cliente o de un agente, anótalo aquí y aparece con su fecha límite.'
          }
        />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-line border-b">
              <th className="type-mono text-fg-muted pb-2 font-medium">Pendiente</th>
              <th className="type-mono text-fg-muted w-28 pb-2 font-medium">Depende de</th>
              <th className="type-mono text-fg-muted w-28 pb-2 font-medium">Estado</th>
              <th className="type-mono text-fg-muted w-28 pb-2 text-right font-medium">Límite</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => (
              <tr key={t.id} className="border-line border-b last:border-b-0">
                <td
                  className={cn('py-3 pr-4 text-[13px]', t.status === 'hecha' && 'text-fg-muted')}
                >
                  {t.title}
                </td>
                <td className="py-3 pr-4">
                  <Chip tone={DEPENDE_TONE[t.dependsOn]}>{DEPENDE_LABEL[t.dependsOn]}</Chip>
                </td>
                <td className="py-3 pr-4">
                  <Chip tone={TAREA_ESTADO_TONE[t.status]}>{TAREA_ESTADO_LABEL[t.status]}</Chip>
                </td>
                <td className="py-3 text-right">
                  <Mono className={t.vencida ? 'text-accent-hot' : 'text-fg-muted'}>
                    {t.textoFecha ?? 'sin fecha'}
                  </Mono>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
