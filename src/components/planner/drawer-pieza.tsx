'use client'

import { Lock, LockOpen } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button, Chip, Mono } from '@/components/ui/primitives'
import { CampoAsset } from '@/components/planner/campo-asset'
import { CampoSprint } from '@/components/planner/campo-sprint'
import { Interruptor, LabelCampo, SegmentedControl } from '@/components/planner/controles'
import { Drawer } from '@/components/planner/drawer'
import { PostInstagram } from '@/components/post/post-instagram'
import { PostTikTok } from '@/components/post/post-tiktok'
import {
  ACCIONES_DE_AGENTE,
  ESTADOS,
  FORMATOS,
  PLATAFORMAS,
  type CampoConProcedencia,
  type MiembroDelEstudio,
  type Pieza,
  type Pilar,
  type SprintPlanner,
} from '@/components/planner/tipos'
import { checkCodeRules, type CodeRule } from '@/domain/brand-rules'
import { componerCaption } from '@/domain/post-preview'
import { diasDeAtraso, ENTREGA_LABEL, estadoDeEntrega } from '@/domain/planner'
import { formatDate } from '@/lib/time'
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

/** Todo lo que el drawer necesita para la imagen, el sprint y el responsable. */
export interface ContextoDePieza {
  equipo: readonly MiembroDelEstudio[]
  sprints: readonly SprintPlanner[]
  /** `2026-09-14` en la zona del estudio. Aquí no se lee el reloj. */
  hoy: string
  /** URL firmada de la imagen de la pieza abierta, si tiene. */
  urlAsset: string | null
  /** Identidad pública de la cuenta, para el preview "Ver como post". */
  cuenta: {
    handle: string | null
    avatarUrl: string | null
    bio: string | null
    brandColor: string | null
  }
  subiendoAsset: boolean
  creandoSprint: boolean
  onSubirAsset: (pieceId: string, archivo: File) => void
  onEnlazarAsset: (pieceId: string, url: string) => void
  onQuitarAsset: (pieceId: string) => void
  onCrearSprint: (
    pieceId: string,
    sprint: { name: string; startsOn: string; endsOn: string },
  ) => void
}

export function DrawerPieza({
  pieza,
  pilares,
  reglas,
  contexto,
  onCerrar,
  onGuardar,
  onAccionDeAgente,
}: {
  pieza: Pieza | undefined
  pilares: readonly Pilar[]
  reglas: readonly CodeRule[]
  contexto: ContextoDePieza
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
          pilares={pilares}
          reglas={reglas}
          contexto={contexto}
          onGuardar={onGuardar}
        />
      )}
    </Drawer>
  )
}

function CuerpoDrawer({
  pieza,
  pilares,
  reglas,
  contexto,
  onGuardar,
}: {
  pieza: Pieza
  pilares: readonly Pilar[]
  reglas: readonly CodeRule[]
  contexto: ContextoDePieza
  onGuardar: (pieceId: string, cambio: CambioDePieza) => void
}) {
  const [editados, setEditados] = useState<ReadonlySet<string>>(new Set())
  const [hashtags, setHashtags] = useState(pieza.hashtags.join(' '))
  // El toggle Editar | Ver como post NO remonta el cuerpo: alterna con `hidden`
  // para que el texto sin guardar de los campos no se pierda al cambiar de modo.
  const [modo, setModo] = useState<'editar' | 'post'>('editar')
  const [vistaPost, setVistaPost] = useState<'instagram' | 'tiktok'>('instagram')
  const tieneTikTok = pieza.platforms.includes('tiktok')

  const entrega = estadoDeEntrega(pieza, contexto.hoy)

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

      {modo === 'post' && tieneTikTok && (
        <SegmentedControl
          etiqueta="Vista de la publicación"
          valor={vistaPost}
          onCambio={setVistaPost}
          opciones={[
            { id: 'instagram', label: 'Instagram' },
            { id: 'tiktok', label: 'TikTok' },
          ]}
        />
      )}

      {modo === 'post' && vistaPost === 'instagram' && (
        <PostInstagram
          handle={contexto.cuenta.handle}
          avatarUrl={contexto.cuenta.avatarUrl}
          bio={contexto.cuenta.bio}
          brandColor={contexto.cuenta.brandColor}
          imageUrl={contexto.urlAsset}
          fallbackColor={pilares.find((p) => p.id === pieza.pillarId)?.color ?? null}
          format={pieza.format}
          caption={componerCaption({
            hook: pieza.hook,
            copyIn: pieza.copyIn,
            copyOut: pieza.copyOut,
            cta: pieza.cta,
            hashtags: pieza.hashtags,
          })}
          fecha={pieza.publishAt ? formatDate(new Date(pieza.publishAt)) : null}
        />
      )}

      {modo === 'post' && vistaPost === 'tiktok' && (
        <PostTikTok
          handle={contexto.cuenta.handle}
          avatarUrl={contexto.cuenta.avatarUrl}
          bio={contexto.cuenta.bio}
          brandColor={contexto.cuenta.brandColor}
          imageUrl={contexto.urlAsset}
          fallbackColor={pilares.find((p) => p.id === pieza.pillarId)?.color ?? null}
          format={pieza.format}
          caption={componerCaption({
            hook: pieza.hook,
            copyIn: pieza.copyIn,
            copyOut: pieza.copyOut,
            cta: pieza.cta,
            hashtags: pieza.hashtags,
          })}
          fecha={pieza.publishAt ? formatDate(new Date(pieza.publishAt)) : null}
        />
      )}

      {modo === 'post' && !tieneTikTok && (
        <PostInstagram
          handle={contexto.cuenta.handle}
          avatarUrl={contexto.cuenta.avatarUrl}
          bio={contexto.cuenta.bio}
          brandColor={contexto.cuenta.brandColor}
          imageUrl={contexto.urlAsset}
          fallbackColor={pilares.find((p) => p.id === pieza.pillarId)?.color ?? null}
          format={pieza.format}
          caption={componerCaption({
            hook: pieza.hook,
            copyIn: pieza.copyIn,
            copyOut: pieza.copyOut,
            cta: pieza.cta,
            hashtags: pieza.hashtags,
          })}
          fecha={pieza.publishAt ? formatDate(new Date(pieza.publishAt)) : null}
        />
      )}

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

        {/*
        La entrega va JUNTO a la publicación y no en la logística de hasta
        abajo: son dos fechas del mismo compromiso y separarlas es lo que hace
        que alguien mueva una y se olvide de la otra.
      */}
        <section>
          <LabelCampo
            htmlFor={`entrega-${pieza.id}`}
            extra={
              entrega === 'atrasada' || entrega === 'hoy' ? (
                <Chip tone="accent">
                  {entrega === 'hoy'
                    ? ENTREGA_LABEL.hoy
                    : `Vencida hace ${diasDeAtraso(pieza.dueDate ?? contexto.hoy, contexto.hoy)} d`}
                </Chip>
              ) : null
            }
          >
            Fecha de entrega
          </LabelCampo>
          <input
            id={`entrega-${pieza.id}`}
            type="date"
            defaultValue={pieza.dueDate ?? ''}
            onBlur={(e) => {
              const nuevo = e.target.value || null
              if (nuevo !== pieza.dueDate) guardar({ campo: 'due_date', valor: nuevo })
            }}
            className="border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px]"
          />
          <p className="text-fg-muted mt-1.5 text-[12px]">
            Cuándo tiene que estar el material listo. No es la fecha de publicación: publicar es el
            resultado, entregar es el compromiso.
          </p>
        </section>

        <section>
          <LabelCampo htmlFor={`responsable-${pieza.id}`}>Responsable</LabelCampo>
          <select
            id={`responsable-${pieza.id}`}
            value={pieza.assigneeId ?? ''}
            onChange={(e) => guardar({ campo: 'assignee_id', valor: e.target.value || null })}
            className="border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px]"
          >
            <option value="">Sin responsable</option>
            {contexto.equipo.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.esTu ? `${m.nombre} (tú)` : m.nombre}
              </option>
            ))}
          </select>
          <p className="text-fg-muted mt-1.5 text-[12px]">
            Solo gente del estudio. La base lo verifica: asignarle una pieza a alguien de fuera es
            imposible, no nada más está mal visto.
          </p>
        </section>

        <CampoSprint
          pieceId={pieza.id}
          sprintId={pieza.sprintId}
          sprints={contexto.sprints}
          creando={contexto.creandoSprint}
          onElegir={(sprintId) => guardar({ campo: 'sprint_id', valor: sprintId })}
          onCrear={(sprint) => contexto.onCrearSprint(pieza.id, sprint)}
        />

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
        <CampoAsset
          pieza={pieza}
          url={contexto.urlAsset}
          subiendo={contexto.subiendoAsset}
          onSubir={(archivo) => contexto.onSubirAsset(pieza.id, archivo)}
          onEnlazar={(url) => contexto.onEnlazarAsset(pieza.id, url)}
          onQuitar={() => contexto.onQuitarAsset(pieza.id)}
        />

        {/*
        El estado del asset se sigue pudiendo mover a mano, pero ya no es la
        única verdad: en cuanto hay imagen, guardarla lo pone en `recibido`. Se
        deja el control porque "recibido" también cubre el material que llegó
        por WhatsApp y todavía no se sube.
      */}
        <section>
          <LabelCampo>Estado del material</LabelCampo>
          <SegmentedControl
            etiqueta="Estado del asset"
            valor={pieza.assetStatus}
            onCambio={(v) => guardar({ campo: 'asset_status', valor: v })}
            opciones={[
              { id: 'pendiente', label: 'Pendiente' },
              { id: 'recibido', label: 'Recibido' },
            ]}
          />
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
