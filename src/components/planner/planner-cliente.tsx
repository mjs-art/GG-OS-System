'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RejillaMes, type EntradaCalendario } from '@/components/calendario/rejilla-mes'
import { Display, Mono } from '@/components/ui/primitives'
import {
  editarPieza,
  intercambiarFechas,
  reacomodarSlots,
  type ResultadoAccion,
} from '@/components/planner/acciones'
import { SegmentedControl } from '@/components/planner/controles'
import { DrawerPieza, type CambioDePieza } from '@/components/planner/drawer-pieza'
import type { AccionDeAgente, Cliente, Pieza, Story, SubVista } from '@/components/planner/tipos'
import { SUB_VISTAS } from '@/components/planner/tipos'
import { VistaGrid, type ResultadoSoltar } from '@/components/planner/vista-grid'
import { VistaStories } from '@/components/planner/vista-stories'
import { VistaTabla } from '@/components/planner/vista-tabla'
import type { FechaClavePlanner } from '@/lib/datos/planner'
import type { CodeRule } from '@/domain/brand-rules'
import {
  AGENT_LABEL,
  PIECE_FORMAT_LABEL,
  STORY_KIND_LABEL,
  type PieceStatus,
} from '@/domain/labels'
import {
  aplicarCambios,
  balancePilares,
  ordenarParaGrid,
  reordenar,
  type ModoArrastre,
} from '@/domain/planner'
import { formatDate, formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * § Planner — el estado y las mutaciones de las cuatro sub-vistas.
 *
 * Aquí vive la mitad optimista del guardado. El patrón es siempre el mismo:
 *
 *   1 · se calcula el cambio con la lógica pura de `domain/planner`
 *   2 · se aplica en memoria para que la interfaz responda de inmediato
 *   3 · se manda al Server Action
 *   4 · si el servidor dice que no, se REVIERTE y se dice por qué
 *
 * El paso 4 es el que importa. Una interfaz optimista que se calla cuando falla
 * es peor que una lenta: se ve correcta y está mintiendo, y la mentira se
 * descubre cuando el cliente abre el calendario.
 */
export function PlannerCliente({
  cliente,
  mes,
  piezasIniciales,
  storiesIniciales,
  reglas,
  fechasClave,
  hoy,
}: {
  cliente: Cliente
  mes: MonthKey
  piezasIniciales: readonly Pieza[]
  storiesIniciales: readonly Story[]
  reglas: readonly CodeRule[]
  fechasClave: readonly FechaClavePlanner[]
  /** `2026-09-14` en la zona del estudio. Inyectado: los componentes no crean fechas. */
  hoy: string
}) {
  const [piezas, setPiezas] = useState<readonly Pieza[]>(piezasIniciales)
  const [vista, setVista] = useState<SubVista>('grid')
  const [columnas, setColumnas] = useState(3)
  const [contentMap, setContentMap] = useState(false)
  const [modo, setModo] = useState<ModoArrastre>('intercambiar')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [, empezarTransicion] = useTransition()

  // El servidor es la verdad. Cuando un Server Action revalida, la página llega
  // con piezas nuevas y el estado optimista se rinde ante ellas.
  //
  // El ajuste se hace DURANTE el render y no en un efecto: en un efecto, React
  // pinta primero el estado viejo y luego el nuevo, y el grid parpadea en cada
  // guardado. Este es el patrón oficial para "derivar estado de props".
  const [semilla, setSemilla] = useState(piezasIniciales)
  if (semilla !== piezasIniciales) {
    setSemilla(piezasIniciales)
    setPiezas(piezasIniciales)
  }

  const ordenadas = useMemo(() => ordenarParaGrid(piezas), [piezas])
  const segmentos = useMemo(
    () =>
      balancePilares(
        piezas,
        cliente.pilares.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          targetPct: p.targetPct,
        })),
      ),
    [piezas, cliente.pilares],
  )

  /** Un fallo del servidor siempre deja la interfaz donde estaba, y lo dice. */
  const revertirSiFalla = useCallback(
    (previas: readonly Pieza[], promesa: Promise<ResultadoAccion>, queFallo: string) => {
      empezarTransicion(async () => {
        const r = await promesa
        if (!r.ok) {
          setPiezas(previas)
          toast.error(queFallo, { description: r.mensaje })
        }
      })
    },
    [],
  )

  /* --- Arrastrar en el grid ------------------------------------------------ */

  const alSoltar = useCallback(
    (origenId: string, destinoId: string): ResultadoSoltar => {
      const resultado = reordenar({ piezas: ordenadas, origenId, destinoId, modo })

      if (!resultado.ok) {
        if (resultado.motivo === 'bloqueada') {
          const cuando = resultado.fecha
            ? `al ${formatDate(new Date(resultado.fecha), { day: 'numeric', month: 'long' })}`
            : 'a su lugar'
          toast.error(`Esta pieza está amarrada ${cuando}.`, {
            description: 'Quita el candado para moverla.',
          })
          return { movido: false, bloqueadaId: resultado.piezaId }
        }
        return { movido: false, bloqueadaId: null }
      }

      const previas = piezas
      setPiezas(aplicarCambios(piezas, resultado.cambios))

      revertirSiFalla(
        previas,
        modo === 'intercambiar'
          ? intercambiarFechas({ slug: cliente.slug, aId: origenId, bId: destinoId })
          : reacomodarSlots({
              slug: cliente.slug,
              clientId: cliente.id,
              cambios: resultado.cambios,
            }),
        modo === 'intercambiar'
          ? 'No se intercambiaron las fechas. Las piezas regresaron a su lugar.'
          : 'No se recorrió el mes. Las piezas regresaron a su lugar.',
      )

      return { movido: true, bloqueadaId: null }
    },
    [ordenadas, piezas, modo, cliente.slug, cliente.id, revertirSiFalla],
  )

  /* --- Editar una pieza ---------------------------------------------------- */

  const alGuardar = useCallback(
    (pieceId: string, cambio: CambioDePieza) => {
      const previas = piezas
      setPiezas(piezas.map((p) => (p.id === pieceId ? aplicarEdicion(p, cambio) : p)))

      revertirSiFalla(
        previas,
        editarPieza({ slug: cliente.slug, pieceId, cambio }),
        'No se guardó el cambio. El campo volvió a como estaba.',
      )
    },
    [piezas, cliente.slug, revertirSiFalla],
  )

  /* --- Calendario ---------------------------------------------------------- */

  const entradas = useMemo<EntradaCalendario[]>(() => {
    const colorPilar = new Map(cliente.pilares.map((p) => [p.id, p.color] as const))
    const lista: EntradaCalendario[] = []

    for (const p of piezas) {
      if (!p.publishAt) continue
      lista.push({
        id: p.id,
        fecha: p.publishAt,
        titulo: p.hook ?? p.idea ?? 'Sin hook todavía',
        tipo: 'pieza',
        color: colorPilar.get(p.pillarId ?? '') ?? 'var(--color-line)',
        etiqueta: PIECE_FORMAT_LABEL[p.format],
      })
    }
    for (const s of storiesIniciales) {
      lista.push({
        id: s.id,
        fecha: s.scheduledOn,
        titulo: STORY_KIND_LABEL[s.kind],
        tipo: 'story',
        color: 'var(--color-fg-muted)',
      })
    }
    for (const f of fechasClave) {
      lista.push({
        id: f.id,
        fecha: f.date,
        titulo: f.title,
        tipo: 'fecha-clave',
        color: 'var(--color-accent)',
        etiqueta: f.kind,
      })
    }
    return lista
  }, [piezas, storiesIniciales, fechasClave, cliente.pilares])

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Planner
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            {piezas.length} piezas de feed y {storiesIniciales.length} stories en{' '}
            {formatMonthKey(mes)}
          </p>
        </div>
        <SegmentedControl
          etiqueta="Sub-vista del planner"
          valor={vista}
          onCambio={setVista}
          opciones={SUB_VISTAS.map((v) => ({
            id: v.id,
            label: v.label,
            ...(v.id === 'stories' ? { contador: storiesIniciales.length } : {}),
            ...(v.id === 'grid' || v.id === 'tabla' ? { contador: piezas.length } : {}),
          }))}
        />
      </header>

      {vista === 'grid' && (
        <VistaGrid
          piezas={ordenadas}
          pilares={cliente.pilares}
          segmentos={segmentos}
          columnas={columnas}
          onColumnas={setColumnas}
          contentMap={contentMap}
          onContentMap={setContentMap}
          modo={modo}
          onModo={setModo}
          onAbrir={setAbierta}
          onSoltar={alSoltar}
        />
      )}

      {vista === 'calendario' && (
        <>
          <Mono className="text-fg-muted mb-3 block">
            Las fechas se cambian arrastrando en el grid. Aquí el mes se lee, no se mueve.
          </Mono>
          <RejillaMes mes={mes} hoy={hoy} entradas={entradas} />
        </>
      )}

      {vista === 'tabla' && (
        <VistaTabla
          piezas={ordenadas}
          pilares={cliente.pilares}
          nombreArchivo={`${cliente.slug}-${mes}-planner`}
          onEditarHook={(id, hook) => alGuardar(id, { campo: 'hook', valor: hook || null })}
          onEditarEstado={(id, estado: PieceStatus) =>
            alGuardar(id, { campo: 'status', valor: estado })
          }
          onAbrir={setAbierta}
        />
      )}

      {vista === 'stories' && <VistaStories stories={storiesIniciales} mes={mes} hoy={hoy} />}

      <DrawerPieza
        pieza={abierta ? piezas.find((p) => p.id === abierta) : undefined}
        cliente={cliente}
        reglas={reglas}
        onCerrar={() => setAbierta(null)}
        onGuardar={alGuardar}
        onAccionDeAgente={anunciarAgente}
      />
    </>
  )
}

/**
 * El agente propone, la persona ejecuta — y en esta etapa el agente todavía no
 * corre. Se dice con nombre y con el siguiente paso, en vez de rellenar los
 * campos con texto inventado: un borrador falso guardado en la base es
 * indistinguible de uno real tres semanas después.
 */
function anunciarAgente(accion: AccionDeAgente) {
  toast(`${AGENT_LABEL[accion.agente]} todavía no está encendido para este cliente.`, {
    description:
      'Enciéndelo en Agentes. Cuando corra, su propuesta llega a la Bandeja y tú decides si entra.',
  })
}

/** Espeja en memoria lo que el Server Action va a hacer en la base. */
function aplicarEdicion(pieza: Pieza, cambio: CambioDePieza): Pieza {
  const sinProcedencia = (campo: string) => {
    const resto = { ...pieza.authoredBy }
    delete resto[campo]
    return resto
  }

  switch (cambio.campo) {
    case 'pillar_id':
      return { ...pieza, pillarId: cambio.valor as string | null }
    case 'format':
      return { ...pieza, format: cambio.valor as Pieza['format'] }
    case 'platforms':
      return { ...pieza, platforms: cambio.valor as string[] }
    case 'status':
      return { ...pieza, status: cambio.valor as PieceStatus }
    case 'fecha':
      return {
        ...pieza,
        publishAt: cambio.valor as string | null,
        dateLocked: cambio.dateLocked ?? pieza.dateLocked,
      }
    case 'asset_status':
      return { ...pieza, assetStatus: cambio.valor as Pieza['assetStatus'] }
    case 'boosted':
      return { ...pieza, boosted: cambio.valor as boolean }
    case 'hashtags':
      return {
        ...pieza,
        hashtags: cambio.valor as string[],
        authoredBy: sinProcedencia('hashtags'),
      }
    case 'idea':
    case 'hook':
    case 'script':
    case 'cta':
      return {
        ...pieza,
        [cambio.campo]: cambio.valor as string | null,
        authoredBy: sinProcedencia(cambio.campo),
      }
    case 'copy_in':
      return {
        ...pieza,
        copyIn: cambio.valor as string | null,
        authoredBy: sinProcedencia('copy_in'),
      }
    case 'copy_out':
      return {
        ...pieza,
        copyOut: cambio.valor as string | null,
        authoredBy: sinProcedencia('copy_out'),
      }
    default:
      return pieza
  }
}
