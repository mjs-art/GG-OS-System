'use client'

import { ImagePlus, Lock, LockOpen } from 'lucide-react'
import { useRef, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button, Chip, Mono } from '@/components/ui/primitives'
import { PostInstagram } from '@/components/post/post-instagram'
import { subirImagenPieza } from '@/components/planner/acciones'
import { Interruptor, LabelCampo, SegmentedControl } from '@/components/planner/controles'
import { Drawer } from '@/components/planner/drawer'
import {
  ACCIONES_DE_AGENTE,
  ESTADOS,
  FORMATOS,
  PLATAFORMAS,
  type CampoConProcedencia,
  type Cliente,
  type Pieza,
} from '@/components/planner/tipos'
import { checkCodeRules, type CodeRule } from '@/domain/brand-rules'
import { componerCaption } from '@/domain/post-preview'
import {
  AGENT_LABEL,
  PIECE_FORMAT_LABEL,
  PIECE_STATUS_LABEL,
  PLATFORM_LABEL,
  type AgentKey,
  type PieceFormat,
  type PieceStatus,
  type Platform,
} from '@/domain/labels'
import { formatDate } from '@/lib/time'

/**
 * § Planner · Detalle de pieza.
 *
 * El orden de los campos no es alfabético ni el de la tabla: es el orden en el
 * que se piensa una pieza. Primero dónde encaja (pilar, formato, plataformas,
 * fecha, estado), luego qué dice (idea, hook, guion, copy, CTA, hashtags), y al
 * final la logística (asset, pauta).
 *
 * La procedencia se muestra SIEMPRE dentro del estudio. El chip con el nombre
 * del agente al lado de cada campo es lo que hace que revisar sea revisar y no
 * leer texto anónimo. En el portal de cliente esto no existe: ahí no se ve la
 * maquinaria.
 */

export interface CambioDePieza {
  campo: string
  valor: unknown
  dateLocked?: boolean
}

export function DrawerPieza({
  pieza,
  cliente,
  reglas,
  onCerrar,
  onGuardar,
  onAccionDeAgente,
}: {
  pieza: Pieza | undefined
  cliente: Cliente
  reglas: readonly CodeRule[]
  onCerrar: () => void
  onGuardar: (pieceId: string, cambio: CambioDePieza) => void
  onAccionDeAgente: (accion: (typeof ACCIONES_DE_AGENTE)[number]) => void
}) {
  return (
    <Drawer
      abierto={Boolean(pieza)}
      onCerrar={onCerrar}
      titulo={pieza?.hook ?? pieza?.idea ?? 'Pieza sin hook'}
      subtitulo={
        pieza && (
          <div className="flex flex-wrap items-center gap-2">
            <Chip>{PIECE_FORMAT_LABEL[pieza.format]}</Chip>
            <Chip tone={pieza.status === 'aprobado' ? 'ok' : 'neutral'}>
              {PIECE_STATUS_LABEL[pieza.status]}
            </Chip>
            {pieza.dateLocked && <Chip tone="accent">Fecha fija</Chip>}
          </div>
        )
      }
      acciones={
        <div className="flex flex-wrap gap-2">
          {ACCIONES_DE_AGENTE.map((a) => (
            <Button key={a.id} variant="agent" onClick={() => onAccionDeAgente(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      }
    >
      {/* La `key` reinicia el estado local al cambiar de pieza: sin ella, el
          texto de la pieza anterior se queda en los campos del siguiente. */}
      {pieza && (
        <CuerpoDrawer
          key={pieza.id}
          pieza={pieza}
          cliente={cliente}
          reglas={reglas}
          onGuardar={onGuardar}
        />
      )}
    </Drawer>
  )
}

function CuerpoDrawer({
  pieza,
  cliente,
  reglas,
  onGuardar,
}: {
  pieza: Pieza
  cliente: Cliente
  reglas: readonly CodeRule[]
  onGuardar: (pieceId: string, cambio: CambioDePieza) => void
}) {
  const pilares = cliente.pilares
  const [editados, setEditados] = useState<ReadonlySet<string>>(new Set())
  const [hashtags, setHashtags] = useState(pieza.hashtags.join(' '))
  // El toggle Editar | Ver como post NO remonta el cuerpo: alterna con `hidden`
  // para que el texto sin guardar de los campos no se pierda al cambiar de modo.
  // Es la clase de falso bug que ya mordió ("los tiles desaparecían al cambiar
  // de modo"): un cambio de vista no debe tirar estado del DOM.
  const [modo, setModo] = useState<'editar' | 'post'>('editar')

  const guardar = (cambio: CambioDePieza) => {
    setEditados((previos) => new Set(previos).add(cambio.campo))
    onGuardar(pieza.id, cambio)
  }

  const listaHashtags = hashtags
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

  const revision = checkCodeRules(reglas, {
    hook: pieza.hook,
    copyIn: pieza.copyIn,
    copyOut: pieza.copyOut,
    cta: pieza.cta,
    hashtags: listaHashtags,
  })
  const problemaHashtags = revision.violations.find((v) => v.field === 'hashtags')

  /** El chip que va a la derecha del label. */
  const procedencia = (campo: CampoConProcedencia, tieneContenido: boolean): ReactNode => {
    const agente = pieza.authoredBy[campo]
    if (agente) return <Chip tone="agent">{AGENT_LABEL[agente as AgentKey] ?? agente}</Chip>
    if (editados.has(campo) || tieneContenido) return <Chip tone="accent">Editado por ti</Chip>
    return null
  }

  const nota = (campo: string) =>
    editados.has(campo) ? (
      <p className="text-fg-muted mt-1.5 text-[12px]">
        Esta corrección se agrega al aprendizaje de la marca.
      </p>
    ) : null

  const campoTexto = (
    campo: CampoConProcedencia,
    label: string,
    valor: string | null,
    filas = 2,
  ) => (
    <section>
      <LabelCampo htmlFor={`${campo}-${pieza.id}`} extra={procedencia(campo, Boolean(valor))}>
        {label}
      </LabelCampo>
      <textarea
        id={`${campo}-${pieza.id}`}
        rows={filas}
        defaultValue={valor ?? ''}
        onBlur={(e) => {
          const nuevo = e.target.value.trim()
          if (nuevo !== (valor ?? '')) guardar({ campo, valor: nuevo === '' ? null : nuevo })
        }}
        className="border-line bg-bg focus:border-accent-hot w-full resize-y rounded-xs border px-3 py-2 text-[13px] leading-relaxed"
      />
      {nota(campo)}
    </section>
  )

  return (
    <div className="flex flex-col gap-6">
      <SegmentedControl
        etiqueta="Modo del detalle de la pieza"
        valor={modo}
        onCambio={setModo}
        opciones={[
          { id: 'editar', label: 'Editar' },
          { id: 'post', label: 'Ver como post' },
        ]}
      />

      {modo === 'post' && <VistaComoPost pieza={pieza} cliente={cliente} />}

      {/* El formulario se oculta con `hidden`, no se desmonta: así el texto sin
          guardar de un campo no se pierde al asomarse al preview y volver. */}
      <div className={modo === 'post' ? 'hidden' : 'flex flex-col gap-6'}>
        {/* --- Dónde encaja ------------------------------------------------- */}
        <section>
          <LabelCampo htmlFor={`pilar-${pieza.id}`}>Pilar</LabelCampo>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-6 w-1 shrink-0"
              style={{
                backgroundColor:
                  pilares.find((p) => p.id === pieza.pillarId)?.color ?? 'var(--color-line)',
              }}
            />
            <select
              id={`pilar-${pieza.id}`}
              value={pieza.pillarId ?? ''}
              onChange={(e) => guardar({ campo: 'pillar_id', valor: e.target.value || null })}
              className="border-line bg-bg text-fg flex-1 rounded-xs border px-3 py-2 text-[13px]"
            >
              <option value="">Sin pilar</option>
              {pilares.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section>
          <LabelCampo>Formato</LabelCampo>
          <SegmentedControl
            etiqueta="Formato de la pieza"
            valor={pieza.format}
            onCambio={(v) => guardar({ campo: 'format', valor: v as PieceFormat })}
            opciones={FORMATOS.map((f) => ({ id: f, label: PIECE_FORMAT_LABEL[f] }))}
          />
        </section>

        <section>
          <LabelCampo>Plataformas</LabelCampo>
          <div className="flex flex-wrap gap-2">
            {PLATAFORMAS.map((p) => {
              const puesta = pieza.platforms.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    guardar({
                      campo: 'platforms',
                      valor: puesta
                        ? pieza.platforms.filter((x) => x !== p)
                        : [...pieza.platforms, p],
                    })
                  }
                  className="rounded-xs"
                  aria-pressed={puesta}
                >
                  <Chip tone={puesta ? 'accent' : 'neutral'}>
                    {PLATFORM_LABEL[p as Platform] ?? p}
                  </Chip>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <LabelCampo htmlFor={`fecha-${pieza.id}`}>Fecha y hora</LabelCampo>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`fecha-${pieza.id}`}
              type="datetime-local"
              defaultValue={paraInput(pieza.publishAt)}
              onBlur={(e) => {
                const nuevo = e.target.value ? new Date(e.target.value).toISOString() : null
                if (nuevo !== pieza.publishAt) {
                  guardar({ campo: 'fecha', valor: nuevo, dateLocked: pieza.dateLocked })
                }
              }}
              className="border-line bg-bg text-fg flex-1 rounded-xs border px-3 py-2 text-[13px]"
            />
            <Interruptor
              activo={pieza.dateLocked}
              onCambio={(v) => guardar({ campo: 'fecha', valor: pieza.publishAt, dateLocked: v })}
            >
              {pieza.dateLocked ? (
                <>
                  <Lock aria-hidden className="size-3" /> Amarrada
                </>
              ) : (
                <>
                  <LockOpen aria-hidden className="size-3" /> Se puede mover
                </>
              )}
            </Interruptor>
          </div>
          <p className="text-fg-muted mt-1.5 text-[12px]">
            Con el candado puesto, el grid se niega a moverla al arrastrar.
          </p>
        </section>

        <section>
          <LabelCampo htmlFor={`estado-${pieza.id}`}>Estado</LabelCampo>
          <select
            id={`estado-${pieza.id}`}
            value={pieza.status}
            onChange={(e) => guardar({ campo: 'status', valor: e.target.value as PieceStatus })}
            className="border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px]"
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {PIECE_STATUS_LABEL[e]}
              </option>
            ))}
          </select>
        </section>

        {/* --- Qué dice ------------------------------------------------------ */}
        {campoTexto('idea', 'Idea', pieza.idea)}
        {campoTexto('hook', 'Hook', pieza.hook)}
        {campoTexto('script', 'Guion', pieza.script, 8)}
        {campoTexto('copy_in', 'Copy in', pieza.copyIn, 4)}
        {campoTexto('copy_out', 'Copy out', pieza.copyOut, 3)}
        {campoTexto('cta', 'CTA', pieza.cta, 1)}

        <section>
          <LabelCampo
            htmlFor={`hashtags-${pieza.id}`}
            extra={procedencia('hashtags', pieza.hashtags.length > 0)}
          >
            Hashtags
          </LabelCampo>
          <textarea
            id={`hashtags-${pieza.id}`}
            rows={2}
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            onBlur={() => {
              const antes = pieza.hashtags.join(' ')
              if (listaHashtags.join(' ') !== antes) {
                guardar({ campo: 'hashtags', valor: listaHashtags })
              }
            }}
            className="border-line bg-bg focus:border-accent-hot w-full resize-y rounded-xs border px-3 py-2 text-[13px]"
          />
          <div className="mt-1.5 flex items-baseline justify-between gap-3">
            <Mono className={problemaHashtags ? 'text-accent-hot' : 'text-fg-muted'}>
              {listaHashtags.length} {listaHashtags.length === 1 ? 'hashtag' : 'hashtags'}
            </Mono>
            {problemaHashtags && (
              <p className="text-accent-hot text-right text-[12px]">
                {problemaHashtags.found} {problemaHashtags.fix}
              </p>
            )}
          </div>
          {nota('hashtags')}
        </section>

        {/* --- Logística ----------------------------------------------------- */}
        <section>
          <LabelCampo>Asset</LabelCampo>
          <SegmentedControl
            etiqueta="Estado del asset"
            valor={pieza.assetStatus}
            onCambio={(v) => guardar({ campo: 'asset_status', valor: v })}
            opciones={[
              { id: 'pendiente', label: 'Pendiente' },
              { id: 'recibido', label: 'Recibido' },
            ]}
          />
          <p className="text-fg-muted mt-1.5 text-[12px]">
            Solo el estado. Los archivos viven en la carpeta del cliente, no aquí.
          </p>
        </section>

        <section>
          <LabelCampo>Pauta</LabelCampo>
          <Interruptor
            activo={pieza.boosted}
            onCambio={(v) => guardar({ campo: 'boosted', valor: v })}
          >
            Impulsar esta pieza
          </Interruptor>
          <p className="text-fg-muted mt-1.5 text-[12px]">
            La campaña y el ad set al que entra se eligen en la sección Pauta, junto con el
            presupuesto. Aquí solo se marca que la pieza va a llevar dinero atrás.
          </p>
        </section>
      </div>
    </div>
  )
}

/**
 * El preview de la pieza como publicación de Instagram, más el control para
 * subir su foto.
 *
 * La subida vive aquí y no en el formulario de edición a propósito: la imagen es
 * lo primero que uno quiere ver junto al mockup, y el resultado se comprueba en
 * el mismo cuadro. El Server Action revalida la ruta, así que al terminar la
 * página llega con la imagen ya firmada y el preview se actualiza solo.
 */
function VistaComoPost({ pieza, cliente }: { pieza: Pieza; cliente: Cliente }) {
  const [subiendo, empezarSubida] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const caption = componerCaption({
    hook: pieza.hook,
    copyIn: pieza.copyIn,
    copyOut: pieza.copyOut,
    cta: pieza.cta,
    hashtags: pieza.hashtags,
  })

  const alElegirArchivo = (archivo: File) => {
    const datos = new FormData()
    datos.set('slug', cliente.slug)
    datos.set('clientId', cliente.id)
    datos.set('pieceId', pieza.id)
    datos.set('file', archivo)

    empezarSubida(async () => {
      const r = await subirImagenPieza(datos)
      if (r.ok) toast.success('Imagen actualizada.')
      else toast.error('No se pudo subir la imagen.', { description: r.mensaje })
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <PostInstagram
        handle={cliente.handle}
        avatarUrl={cliente.avatarUrl}
        bio={cliente.bio}
        brandColor={cliente.brandColor}
        imageUrl={pieza.imageUrl}
        fallbackSeed={pieza.id}
        format={pieza.format}
        caption={caption}
        fecha={pieza.publishAt ? formatDate(new Date(pieza.publishAt)) : null}
      />

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) alElegirArchivo(archivo)
          }}
        />
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={subiendo}>
          <ImagePlus aria-hidden className="size-4" />
          {subiendo ? 'Subiendo…' : pieza.imageUrl ? 'Reemplazar imagen' : 'Subir imagen'}
        </Button>
        <p className="text-fg-muted text-[12px]">
          JPG, PNG o WebP, hasta 10 MB. Se ve así en el grid y en lo que revisa el cliente.
        </p>
      </div>
    </div>
  )
}

/**
 * `datetime-local` habla en la hora del navegador, no en una zona con nombre.
 *
 * Para el estudio eso coincide: todos los clientes operan en el Pacífico
 * mexicano y las computadoras están en Tijuana. Se deja así en vez de convertir
 * a mano porque una conversión con la zona equivocada mueve publicaciones de
 * día, y ese error es peor que la suposición explícita.
 */
function paraInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
