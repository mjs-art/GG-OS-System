'use client'

import { ArrowDown, ArrowUp, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Chip, EmptyState, Mono } from '@/components/ui/primitives'
import { partesDeFecha, SIN_FECHA } from '@/components/planner/fechas'
import type { Pieza, Pilar } from '@/components/planner/tipos'
import { ESTADOS } from '@/components/planner/tipos'
import {
  PIECE_FORMAT_LABEL,
  PIECE_STATUS_LABEL,
  PIECE_STATUS_ORDER,
  PLATFORM_LABEL,
  AGENT_LABEL,
  type AgentKey,
  type PieceStatus,
} from '@/domain/labels'
import {
  aCsv,
  esDelPipeline,
  ordenarFilas,
  type ColumnaTabla,
  type Direccion,
} from '@/domain/planner'
import { cn } from '@/lib/cn'

/**
 * § Planner · Tabla — todas las piezas del mes, con todo lo que se puede
 * ordenar y filtrar.
 *
 * Es la vista de trabajo, no la de presentación: aquí se corrigen veinte hooks
 * seguidos sin abrir veinte drawers. Por eso el hook y el estado se editan en
 * la propia celda.
 */

const COLUMNAS: readonly { id: ColumnaTabla; label: string; ancho?: string }[] = [
  { id: 'fecha', label: 'Fecha' },
  { id: 'formato', label: 'Formato' },
  { id: 'pilar', label: 'Pilar' },
  { id: 'hook', label: 'Hook' },
  { id: 'estado', label: 'Estado' },
  { id: 'plataformas', label: 'Plataformas' },
  { id: 'procedencia', label: 'Procedencia' },
  { id: 'aprobacion', label: 'Aprobación' },
]

/** La aprobación se deriva del estado: es la misma verdad, dicha en corto. */
function aprobacionDe(status: PieceStatus): string {
  if (status === 'aprobado' || status === 'publicado') return 'Aprobada'
  if (status === 'con_cliente') return 'Con el cliente'
  return 'Sin mandar'
}

function procedenciaDe(pieza: Pieza): string {
  if (!esDelPipeline(pieza)) return 'Editado por ti'
  const agentes = [...new Set(Object.values(pieza.authoredBy))]
    .map((a) => AGENT_LABEL[a as AgentKey] ?? a)
    .sort((a, b) => a.localeCompare(b, 'es-MX'))
  return agentes.join(', ')
}

export function VistaTabla({
  piezas,
  pilares,
  nombreArchivo,
  onEditarHook,
  onEditarEstado,
  onAbrir,
}: {
  piezas: readonly Pieza[]
  pilares: readonly Pilar[]
  nombreArchivo: string
  onEditarHook: (pieceId: string, hook: string) => void
  onEditarEstado: (pieceId: string, estado: PieceStatus) => void
  onAbrir: (id: string) => void
}) {
  const [columna, setColumna] = useState<ColumnaTabla>('fecha')
  const [direccion, setDireccion] = useState<Direccion>('desc')
  const [filtroPilar, setFiltroPilar] = useState<string | null>(null)
  const [filtroFormato, setFiltroFormato] = useState<string | null>(null)
  const [filtroEstado, setFiltroEstado] = useState<PieceStatus | null>(null)
  const [soloEditadas, setSoloEditadas] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)

  const porPilar = useMemo(() => new Map(pilares.map((p) => [p.id, p] as const)), [pilares])

  /** Color por pieza, para no buscar el pilar por nombre al pintar cada renglón. */
  const colorDe = useMemo(
    () =>
      new Map(
        piezas.map(
          (p) => [p.id, (p.pillarId ? porPilar.get(p.pillarId)?.color : null) ?? null] as const,
        ),
      ),
    [piezas, porPilar],
  )

  const visibles = useMemo(
    () =>
      piezas.filter((p) => {
        if (filtroPilar && p.pillarId !== filtroPilar) return false
        if (filtroFormato && p.format !== filtroFormato) return false
        if (filtroEstado && p.status !== filtroEstado) return false
        if (soloEditadas && esDelPipeline(p)) return false
        return true
      }),
    [piezas, filtroPilar, filtroFormato, filtroEstado, soloEditadas],
  )

  const filas = useMemo(() => {
    const crudas = visibles.map((p) => ({
      id: p.id,
      fecha: p.publishAt,
      formato: p.format,
      pilar: (p.pillarId ? porPilar.get(p.pillarId)?.name : null) ?? 'Sin pilar',
      hook: p.hook ?? '',
      estado: p.status,
      ordenEstado: PIECE_STATUS_ORDER.indexOf(p.status),
      plataformas: p.platforms,
      procedencia: procedenciaDe(p),
      aprobacion: aprobacionDe(p.status),
    }))
    return ordenarFilas(crudas, columna, direccion)
  }, [visibles, porPilar, columna, direccion])

  function ordenarPor(id: ColumnaTabla) {
    if (id === columna) setDireccion(direccion === 'asc' ? 'desc' : 'asc')
    else {
      setColumna(id)
      setDireccion(id === 'fecha' ? 'desc' : 'asc')
    }
  }

  function exportar() {
    const csv = aCsv(
      COLUMNAS.map((c) => c.label),
      filas.map((f) => [
        f.fecha ? (partesDeFecha(f.fecha)?.iso ?? '') : '',
        PIECE_FORMAT_LABEL[f.formato],
        f.pilar,
        f.hook,
        PIECE_STATUS_LABEL[f.estado],
        f.plataformas.map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p).join(' · '),
        f.procedencia,
        f.aprobacion,
      ]),
    )

    // El BOM es lo que hace que Excel en español abra los acentos bien. Sin él
    // "Coctelería" llega con caracteres de más y el reporte se ve roto.
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const enlace = document.createElement('a')
    enlace.href = url
    enlace.download = `${nombreArchivo}.csv`
    enlace.click()
    URL.revokeObjectURL(url)
  }

  const chip = (activo: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick} className="rounded-xs">
      <Chip tone={activo ? 'accent' : 'neutral'}>{label}</Chip>
    </button>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {chip(!filtroPilar && !filtroFormato && !filtroEstado && !soloEditadas, 'Todo', () => {
          setFiltroPilar(null)
          setFiltroFormato(null)
          setFiltroEstado(null)
          setSoloEditadas(false)
        })}
        {pilares.map((p) =>
          chip(filtroPilar === p.id, p.name, () =>
            setFiltroPilar(filtroPilar === p.id ? null : p.id),
          ),
        )}
        {(['post', 'carrusel', 'reel'] as const).map((f) =>
          chip(filtroFormato === f, PIECE_FORMAT_LABEL[f], () =>
            setFiltroFormato(filtroFormato === f ? null : f),
          ),
        )}
        {ESTADOS.map((e) =>
          chip(filtroEstado === e, PIECE_STATUS_LABEL[e], () =>
            setFiltroEstado(filtroEstado === e ? null : e),
          ),
        )}
        {chip(soloEditadas, 'Editado por ti', () => setSoloEditadas(!soloEditadas))}

        <Button variant="secondary" className="ml-auto" onClick={exportar}>
          <Download aria-hidden className="size-3.5" />
          Exportar CSV
        </Button>
      </div>

      {filas.length === 0 ? (
        <EmptyState
          title="Ningún filtro coincide"
          body="Ninguna pieza del mes cumple con lo que filtraste. Quita un filtro con el chip Todo para ver el mes completo."
        />
      ) : (
        <div className="border-line overflow-x-auto rounded-xs border">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-line border-b">
                {COLUMNAS.map((c) => (
                  <th
                    key={c.id}
                    scope="col"
                    className="p-0"
                    // `aria-sort` va en la celda de encabezado, no en el botón:
                    // el rol `button` no lo soporta y los lectores lo ignoran.
                    aria-sort={
                      columna === c.id ? (direccion === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.id)}
                      className="type-mono text-fg-muted hover:text-fg flex w-full items-center gap-1 px-3 py-2.5"
                    >
                      {c.label}
                      {columna === c.id &&
                        (direccion === 'asc' ? (
                          <ArrowUp aria-hidden className="text-accent-hot size-3" />
                        ) : (
                          <ArrowDown aria-hidden className="text-accent-hot size-3" />
                        ))}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const partes = partesDeFecha(f.fecha)
                return (
                  <tr key={f.id} className="border-line hover:bg-surface border-b last:border-b-0">
                    <td className="px-3 py-2 align-middle">
                      <button
                        type="button"
                        onClick={() => onAbrir(f.id)}
                        className="type-mono text-fg-muted hover:text-accent-hot"
                      >
                        {partes ? `${partes.dia} ${partes.diaSemana} ${partes.hora}` : SIN_FECHA}
                      </button>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Mono className="text-fg-muted">{PIECE_FORMAT_LABEL[f.formato]}</Mono>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="h-3 w-1 shrink-0"
                          style={{ backgroundColor: colorDe.get(f.id) ?? 'var(--color-line)' }}
                        />
                        <span className="text-[13px]">{f.pilar}</span>
                      </span>
                    </td>

                    {/* Edición en la celda: veinte hooks seguidos sin abrir el drawer. */}
                    <td className="min-w-64 px-3 py-2 align-middle">
                      {editando === f.id ? (
                        <input
                          autoFocus
                          defaultValue={f.hook}
                          className="border-line bg-bg w-full rounded-xs border px-2 py-1 text-[13px]"
                          onBlur={(e) => {
                            setEditando(null)
                            if (e.target.value !== f.hook) onEditarHook(f.id, e.target.value)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') {
                              e.currentTarget.value = f.hook
                              e.currentTarget.blur()
                            }
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditando(f.id)}
                          className="hover:text-accent-hot w-full text-left text-[13px]"
                        >
                          {f.hook || <span className="text-fg-muted">Sin hook todavía</span>}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-2 align-middle">
                      <select
                        value={f.estado}
                        onChange={(e) => onEditarEstado(f.id, e.target.value as PieceStatus)}
                        className="type-mono border-line bg-bg text-fg rounded-xs border px-2 py-1"
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>
                            {PIECE_STATUS_LABEL[e]}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-2 align-middle">
                      <Mono className="text-fg-muted">
                        {f.plataformas.length > 0
                          ? f.plataformas
                              .map((p) => PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p)
                              .join(' · ')
                          : '—'}
                      </Mono>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Chip tone={f.procedencia === 'Editado por ti' ? 'neutral' : 'agent'}>
                        {f.procedencia}
                      </Chip>
                    </td>
                    <td className="px-3 py-2 align-middle">
                      <Mono
                        className={cn(f.aprobacion === 'Aprobada' ? 'text-ok' : 'text-fg-muted')}
                      >
                        {f.aprobacion}
                      </Mono>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
