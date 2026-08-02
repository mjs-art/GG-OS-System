'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { RejillaMes, type EntradaCalendario } from '@/components/calendario/rejilla-mes'
import { Display, Mono } from '@/components/ui/primitives'
import {
  crearSprint,
  editarPieza,
  guardarAssetEnlace,
  guardarAssetSubido,
  intercambiarFechas,
  prepararSubidaDeAsset,
  quitarAsset,
  reacomodarSlots,
  type ResultadoAccion,
  type ResultadoAsset,
} from '@/components/planner/acciones'
import { SegmentedControl } from '@/components/planner/controles'
import {
  DrawerPieza,
  type CambioDePieza,
  type ContextoDePieza,
} from '@/components/planner/drawer-pieza'
import type {
  AccionDeAgente,
  Cliente,
  MiembroDelEstudio,
  Pieza,
  SprintPlanner,
  Story,
  SubVista,
  UrlsDeAssets,
} from '@/components/planner/tipos'
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
  BUCKET_PIEZAS,
  ordenarParaGrid,
  reordenar,
  type ModoArrastre,
} from '@/domain/planner'
import { createClient as createSupabaseNavegador } from '@/lib/supabase/browser'
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
  equipo,
  sprintsIniciales,
  urlsIniciales,
  hoy,
}: {
  cliente: Cliente
  mes: MonthKey
  piezasIniciales: readonly Pieza[]
  storiesIniciales: readonly Story[]
  reglas: readonly CodeRule[]
  fechasClave: readonly FechaClavePlanner[]
  equipo: readonly MiembroDelEstudio[]
  sprintsIniciales: readonly SprintPlanner[]
  /** URLs ya firmadas por el servidor, por id de pieza. El bucket es privado. */
  urlsIniciales: UrlsDeAssets
  /** `2026-09-14` en la zona del estudio. Inyectado: los componentes no crean fechas. */
  hoy: string
}) {
  const [piezas, setPiezas] = useState<readonly Pieza[]>(piezasIniciales)
  const [urlsAssets, setUrlsAssets] = useState<UrlsDeAssets>(urlsIniciales)
  const [sprints, setSprints] = useState<readonly SprintPlanner[]>(sprintsIniciales)
  const [subiendo, setSubiendo] = useState<ReadonlySet<string>>(new Set())
  const [creandoSprint, setCreandoSprint] = useState(false)
  const [vista, setVista] = useState<SubVista>('grid')
  const [columnas, setColumnas] = useState(3)
  const [contentMap, setContentMap] = useState(false)
  const [modo, setModo] = useState<ModoArrastre>('intercambiar')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [corriendo, setCorriendo] = useState(false)
  const router = useRouter()

  /**
   * Correr un agente sobre la pieza abierta. Hoy solo el Redactor está enchufado
   * a Claude; los demás siguen anunciando "todavía no está encendido" en vez de
   * rellenar campos con texto inventado. La corrida propone un borrador y lo
   * escribe con su marca de procedencia; la persona lo revisa y aprueba.
   */
  const alAccionDeAgente = useCallback(
    async (accion: AccionDeAgente) => {
      if (accion.agente !== 'redactor') {
        toast(`${AGENT_LABEL[accion.agente]} todavía no está encendido para este cliente.`, {
          description:
            'Enciéndelo en Agentes. Cuando corra, su propuesta llega a la Bandeja y tú decides si entra.',
        })
        return
      }
      if (!abierta || corriendo) return
      setCorriendo(true)
      const pieceId = abierta
      try {
        const res = await fetch('/api/jobs/redactor', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pieceId }),
        })
        const r = (await res.json()) as
          | { ok: true; tipo: 'escrito' }
          | { ok: true; tipo: 'escalado'; pregunta: string }
          | { ok: false; message: string }
        if (r.ok && r.tipo === 'escrito') {
          toast.success('El Redactor escribió el hook y el copy.', {
            description: 'Ábrela de nuevo para revisar y aprobar.',
          })
          setAbierta(null)
          router.refresh()
        } else if (r.ok && r.tipo === 'escalado') {
          toast('El Redactor tiene una pregunta', {
            description: `${r.pregunta} — la respondes en la Bandeja.`,
          })
        } else if (!r.ok) {
          toast.error('No se pudo correr el Redactor', { description: r.message })
        }
      } catch {
        toast.error('No se pudo correr el Redactor', {
          description: 'Falló la conexión. Inténtalo de nuevo.',
        })
      } finally {
        setCorriendo(false)
      }
    },
    [abierta, corriendo, router],
  )
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
    // Las firmas también se rinden: vienen recién hechas del servidor y las
    // que había en memoria ya empezaron a caducar.
    setUrlsAssets(urlsIniciales)
    setSprints(sprintsIniciales)
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

  /* --- La imagen de la pieza ----------------------------------------------- */

  /** Marca la pieza como ocupada mientras el archivo viaja. */
  const marcarSubiendo = useCallback((pieceId: string, activo: boolean) => {
    setSubiendo((previas) => {
      const siguiente = new Set(previas)
      if (activo) siguiente.add(pieceId)
      else siguiente.delete(pieceId)
      return siguiente
    })
  }, [])

  const aplicarAssetEnMemoria = useCallback(
    (
      pieceId: string,
      assetUrl: string | null,
      fuente: Pieza['assetSource'],
      url: string | null,
    ) => {
      setPiezas((previas) =>
        previas.map((p) =>
          p.id === pieceId
            ? {
                ...p,
                assetUrl,
                assetSource: fuente,
                // Lo mismo que hace el Server Action: tener archivo ES tenerlo
                // recibido, y las dos pantallas tienen que decir lo mismo.
                assetStatus: assetUrl ? 'recibido' : 'pendiente',
              }
            : p,
        ),
      )
      setUrlsAssets((previas) => {
        const siguiente = { ...previas }
        if (url) siguiente[pieceId] = url
        else delete siguiente[pieceId]
        return siguiente
      })
    },
    [],
  )

  /**
   * Subir, enlazar y quitar comparten el mismo esqueleto: se pinta el resultado
   * antes de tiempo, y si el servidor dice que no, se revierte y se dice por
   * qué. Igual que el arrastre — con la diferencia de que aquí la interfaz no
   * puede inventar la URL firmada, así que la espera es visible.
   */
  const cambiarAsset = useCallback(
    (
      pieceId: string,
      trabajo: () => Promise<ResultadoAsset | ResultadoAccion>,
      queFallo: string,
    ) => {
      const previas = piezas
      const urlesPrevias = urlsAssets

      marcarSubiendo(pieceId, true)
      empezarTransicion(async () => {
        try {
          const r = await trabajo()
          if (!r.ok) {
            setPiezas(previas)
            setUrlsAssets(urlesPrevias)
            toast.error(queFallo, { description: r.mensaje })
          }
        } catch (error) {
          /*
           * A diferencia del resto de las mutaciones, esta pasa por la red DOS
           * veces y una de ellas no es un Server Action: el PUT del archivo al
           * bucket lo hace el navegador. Un fallo ahí LANZA en vez de devolver
           * `{ ok: false }`, y sin este catch la vista previa local se quedaba
           * puesta para siempre — la imagen se veía subida y no existía. Ese es
           * exactamente el estado que esta app no se puede permitir.
           */
          setPiezas(previas)
          setUrlsAssets(urlesPrevias)
          toast.error(queFallo, {
            description:
              error instanceof Error
                ? error.message
                : 'Se cortó la conexión con el almacenamiento. Vuelve a intentarlo.',
          })
        } finally {
          marcarSubiendo(pieceId, false)
        }
      })
    },
    [piezas, urlsAssets, marcarSubiendo],
  )

  const alSubirAsset = useCallback(
    (pieceId: string, archivo: File) => {
      // Vista previa local mientras el archivo viaja. `blob:` está permitido en
      // el CSP y evita que el tile se quede en la placa del pilar veinte
      // segundos con una imagen que ya se eligió.
      const previa = URL.createObjectURL(archivo)
      aplicarAssetEnMemoria(pieceId, previa, 'subido', previa)

      cambiarAsset(
        pieceId,
        async () => {
          const preparado = await prepararSubidaDeAsset({
            slug: cliente.slug,
            pieceId,
            nombre: archivo.name,
            tipo: archivo.type,
            tamano: archivo.size,
          })
          if (!preparado.ok) return preparado

          // La subida SÍ va desde el navegador —es un archivo— pero contra una
          // ruta que ya venía firmada por el servidor. El navegador no elige
          // dónde escribe: en este bucket la ruta es el permiso.
          const supabase = createSupabaseNavegador()
          const { error } = await supabase.storage
            .from(BUCKET_PIEZAS)
            .uploadToSignedUrl(preparado.ruta, preparado.token, archivo, {
              contentType: archivo.type,
            })

          if (error) {
            return { ok: false as const, mensaje: error.message }
          }

          const guardado = await guardarAssetSubido({
            slug: cliente.slug,
            pieceId,
            ruta: preparado.ruta,
          })
          if (guardado.ok) {
            aplicarAssetEnMemoria(pieceId, guardado.assetUrl, 'subido', guardado.url)
          }
          return guardado
        },
        'No se subió la imagen. La pieza quedó como estaba.',
      )

      // Revocar en cuanto la transición termine no es posible desde aquí sin
      // encadenar promesas; el objeto se libera solo al salir de la página y
      // pesa lo que pesa una referencia, no la imagen.
    },
    [cliente.slug, aplicarAssetEnMemoria, cambiarAsset],
  )

  const alEnlazarAsset = useCallback(
    (pieceId: string, url: string) => {
      aplicarAssetEnMemoria(pieceId, url, 'enlace', url)
      cambiarAsset(
        pieceId,
        () => guardarAssetEnlace({ slug: cliente.slug, pieceId, url }),
        'No se guardó el enlace. La pieza quedó como estaba.',
      )
    },
    [cliente.slug, aplicarAssetEnMemoria, cambiarAsset],
  )

  const alQuitarAsset = useCallback(
    (pieceId: string) => {
      aplicarAssetEnMemoria(pieceId, null, null, null)
      cambiarAsset(
        pieceId,
        () => quitarAsset({ slug: cliente.slug, pieceId }),
        'No se quitó la imagen. La pieza quedó como estaba.',
      )
    },
    [cliente.slug, aplicarAssetEnMemoria, cambiarAsset],
  )

  /* --- Sprints -------------------------------------------------------------- */

  /**
   * Crear un sprint son DOS escrituras seguidas: el sprint y la pieza que lo
   * estrena. Crear uno y dejarlo sin asignar es hacer la mitad del gesto.
   *
   * Las dos van en la MISMA transición, una tras otra, y no delegando la
   * segunda en `alGuardar`. Ese era el primer intento y falla de forma
   * intermitente: `alGuardar` abre su propia transición, y abrir una transición
   * dentro de la continuación asíncrona de otra deja el segundo Server Action a
   * merced de cómo el motor programe las microtareas. En WebKit se perdía —
   * el sprint quedaba creado, la interfaz lo mostraba puesto, y al recargar la
   * pieza aparecía sin sprint. Optimista y mentirosa, que es el peor resultado.
   */
  const alCrearSprint = useCallback(
    (pieceId: string, datos: { name: string; startsOn: string; endsOn: string }) => {
      const sprintPrevio = piezas.find((p) => p.id === pieceId)?.sprintId ?? null

      setCreandoSprint(true)
      empezarTransicion(async () => {
        try {
          const creado = await crearSprint({ slug: cliente.slug, orgId: cliente.orgId, ...datos })
          if (!creado.ok) {
            toast.error('No se creó el sprint.', { description: creado.mensaje })
            return
          }

          setSprints((previos) => [creado.sprint, ...previos])
          setPiezas((previas) =>
            previas.map((p) => (p.id === pieceId ? { ...p, sprintId: creado.sprint.id } : p)),
          )

          const asignado = await editarPieza({
            slug: cliente.slug,
            pieceId,
            cambio: { campo: 'sprint_id', valor: creado.sprint.id },
          })

          if (!asignado.ok) {
            // El sprint SÍ quedó — no se deshace, sirve igual. Lo que se
            // revierte es la pieza, que es lo que no se guardó.
            setPiezas((previas) =>
              previas.map((p) => (p.id === pieceId ? { ...p, sprintId: sprintPrevio } : p)),
            )
            toast.error('El sprint se creó, pero no se le pudo poner a esta pieza.', {
              description: asignado.mensaje,
            })
          }
        } finally {
          setCreandoSprint(false)
        }
      })
    },
    [cliente.slug, cliente.orgId, piezas],
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

  const contexto: ContextoDePieza = {
    equipo,
    sprints,
    hoy,
    urlAsset: abierta ? (urlsAssets[abierta] ?? null) : null,
    subiendoAsset: abierta ? subiendo.has(abierta) : false,
    creandoSprint,
    onSubirAsset: alSubirAsset,
    onEnlazarAsset: alEnlazarAsset,
    onQuitarAsset: alQuitarAsset,
    onCrearSprint: alCrearSprint,
  }

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
          urlsAssets={urlsAssets}
          hoy={hoy}
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
          equipo={equipo}
          sprints={sprints}
          hoy={hoy}
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
        pilares={cliente.pilares}
        reglas={reglas}
        contexto={contexto}
        onCerrar={() => setAbierta(null)}
        onGuardar={alGuardar}
        onAccionDeAgente={alAccionDeAgente}
      />
    </>
  )
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
    case 'due_date':
      return { ...pieza, dueDate: cambio.valor as string | null }
    case 'assignee_id':
      return { ...pieza, assigneeId: cambio.valor as string | null }
    case 'sprint_id':
      return { ...pieza, sprintId: cambio.valor as string | null }
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
