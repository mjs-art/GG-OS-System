import { Braces, ChevronRight, Sparkles, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card, Chip, Display, EmptyState, Mono } from '@/components/ui/primitives'
import {
  AGENT_LABEL,
  PIECE_FORMAT_LABEL,
  RULE_SEVERITY_LABEL,
  type RuleSeverity,
} from '@/domain/labels'
import type { Cliente } from '@/lib/datos/clientes'
import type {
  AprendizajeDeMarca,
  ContextCard,
  PiezaConNumeros,
  ReglaDura,
  VersionDeMarca,
} from '@/lib/datos/secciones'
import { formatDate } from '@/lib/time'
import { etiquetaDeCampo } from './etiquetas'
import { FormularioRegla } from './formulario-regla'

/**
 * § Marca — el documento del que se alimentan los agentes.
 *
 * Está maquetado como documento y no como formulario a propósito: la tabla es
 * versionada y append-only, así que aquí no se edita en sitio. Editar un campo
 * significa publicar una versión nueva, y esa distinción se pierde en cuanto la
 * pantalla se ve como un panel de ajustes.
 *
 * Lo que se lee aquí es literalmente el prompt efectivo de los ocho agentes.
 * Cuando una corrida sale rara, la primera pregunta es con qué versión corrió,
 * y por eso el número de versión está arriba y no escondido en un pie.
 */

const TONO_SEVERIDAD: Record<RuleSeverity, 'critical' | 'high' | 'medium' | 'neutral'> = {
  critica: 'critical',
  alta: 'high',
  media: 'medium',
  baja: 'neutral',
}

export function SeccionMarca({
  cliente,
  contextCard,
  versiones,
  reglas,
  aprendizaje,
}: {
  cliente: Cliente
  contextCard: ContextCard | null
  versiones: VersionDeMarca[]
  reglas: ReglaDura[]
  aprendizaje: AprendizajeDeMarca
}) {
  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Marca
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            El documento del que se alimentan los agentes. Se publica por versiones; nada se
            sobrescribe.
          </p>
        </div>

        {contextCard && (
          <div className="text-right">
            <Mono className="text-fg block">Versión {contextCard.version}</Mono>
            <HistorialDeMarca versiones={versiones} />
          </div>
        )}
      </header>

      {!contextCard ? (
        <EmptyState
          title="La marca todavía no está escrita"
          body="Sin este documento los agentes escriben a ciegas: no saben el tono, ni a quién le hablan, ni qué palabras no se usan. Empieza por qué es la marca y el posicionamiento; lo demás se puede ir agregando versión con versión."
        />
      ) : (
        <div className="flex flex-col">
          <Bloque label="Qué es la marca">
            <Prosa texto={contextCard.whatItIs} vacio="Todavía nadie escribió qué es esta marca." />
          </Bloque>

          <Bloque label="Posicionamiento">
            <Prosa
              texto={contextCard.positioning}
              vacio="Falta el posicionamiento. Es la frase que separa a este cliente de los otros diez del mismo giro."
            />
          </Bloque>

          <Bloque label="Diferenciadores">
            {contextCard.differentiators.length === 0 ? (
              <Vacio texto="Sin diferenciadores capturados. El Guionista los usa para calificar el fit de cada tendencia." />
            ) : (
              <ul className="flex flex-col gap-2">
                {contextCard.differentiators.map((d) => (
                  <li key={d} className="flex gap-3">
                    <ChevronRight aria-hidden className="text-accent-hot mt-0.5 size-4 shrink-0" />
                    <span className="text-[13px]">{d}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque label="Preguntas frecuentes">
            {contextCard.faqs.length === 0 ? (
              <Vacio texto="Sin preguntas frecuentes. Son las que el cliente contesta todos los días por DM y las que mejor funcionan como carrusel." />
            ) : (
              <div className="flex flex-col">
                {contextCard.faqs.map((f) => (
                  <details key={f.pregunta} className="border-line group border-b last:border-b-0">
                    <summary className="hover:text-accent-hot cursor-pointer list-none py-3 text-[13px] font-medium">
                      <span
                        aria-hidden
                        className="text-fg-muted mr-2 inline-block group-open:rotate-90"
                      >
                        ›
                      </span>
                      {f.pregunta}
                    </summary>
                    <p className="text-fg-muted pb-3 pl-5 text-[13px]">{f.respuesta}</p>
                  </details>
                ))}
              </div>
            )}
          </Bloque>

          <Bloque label="A quién le habla">
            <Prosa
              texto={contextCard.audience}
              vacio="Sin audiencia definida. Sin esto el Redactor escribe para todos, que es escribir para nadie."
            />
          </Bloque>

          <Bloque label="Tono de voz">
            {contextCard.tone.length === 0 ? (
              <Vacio texto="Sin tono capturado. Tres adjetivos bastan para que el Redactor deje de sonar a folleto." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {contextCard.tone.map((t) => (
                  <Chip key={t} tone="neutral">
                    {t}
                  </Chip>
                ))}
              </div>
            )}
          </Bloque>

          <Bloque
            label="Palabras prohibidas"
            nota="El Editor de marca las bloquea sin preguntar cuando hay una regla de código que las lista."
          >
            {contextCard.bannedWords.length === 0 ? (
              <Vacio texto="Ninguna palabra prohibida. Si el cliente ya te corrigió alguna dos veces, va aquí." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {contextCard.bannedWords.map((p) => (
                  <Chip key={p} tone="accent">
                    {p}
                  </Chip>
                ))}
              </div>
            )}
          </Bloque>

          <Bloque label="Copy aprobado">
            {contextCard.approvedExamples.length === 0 ? (
              <Vacio texto="Sin ejemplos aprobados. Dos o tres piezas que el cliente amó valen más que una página de instrucciones." />
            ) : (
              <div className="flex flex-col gap-3">
                {contextCard.approvedExamples.map((ej) => (
                  <blockquote
                    key={ej}
                    className="border-accent text-fg border-l-2 pl-4 text-[13px] italic"
                  >
                    {ej}
                  </blockquote>
                ))}
              </div>
            )}
          </Bloque>

          <Bloque label="Pilares">
            {cliente.pilares.length === 0 ? (
              <Vacio texto="Sin pilares. Son la taxonomía con la que se reparte el mes; sin ellos el plan de volumen no tiene con qué balancearse." />
            ) : (
              <ul className="flex flex-col gap-2">
                {cliente.pilares.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="h-3.5 w-1 shrink-0"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="flex-1 text-[13px]">{p.name}</span>
                    <Mono className="text-fg-muted">{p.targetPct}% objetivo</Mono>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>

          <Bloque label="Cadencia">
            <Prosa
              texto={contextCard.cadence}
              vacio="Sin cadencia comprometida. Es el número contra el que se mide la consistencia en § Redes."
            />
          </Bloque>
        </div>
      )}

      {/* --- Reglas duras --------------------------------------------------- */}

      <div className="mt-12">
        <header className="border-line mb-4 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
          <div>
            <Display as="h3" className="text-base">
              Reglas duras
            </Display>
            <p className="text-fg-muted mt-1 text-[13px]">
              Toda regla que se pueda verificar por código se verifica por código. A un modelo se le
              convence; a un conteo de hashtags no.
            </p>
          </div>
          <FormularioRegla clientId={cliente.id} orgId={cliente.orgId} slug={cliente.slug} />
        </header>

        {reglas.length === 0 ? (
          <EmptyState
            title="Sin reglas duras"
            body="Empieza por las dos que ya te sabes de memoria: cuántos hashtags y qué palabra no se usa. Con eso el Editor de marca ya puede revisar cada pieza sin llamar a un modelo."
          />
        ) : (
          <ul className="flex flex-col">
            {reglas.map((r) => (
              <li
                key={r.id}
                className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
              >
                <Mono className="text-fg-muted w-24 shrink-0">{r.kind}</Mono>
                <span className="min-w-[12rem] flex-1 text-[13px]">{r.rule}</span>
                <Chip tone={TONO_SEVERIDAD[r.severity]}>{RULE_SEVERITY_LABEL[r.severity]}</Chip>
                <span className="flex w-28 shrink-0 items-center gap-1.5">
                  {r.checkBy === 'codigo' ? (
                    <Braces aria-hidden className="text-ok size-3.5" />
                  ) : (
                    <Sparkles aria-hidden className="text-fg-muted size-3.5" />
                  )}
                  <Mono className="text-fg-muted">
                    {r.checkBy === 'codigo' ? 'Código' : 'Modelo'}
                  </Mono>
                </span>
                {!r.verificable && (
                  <span className="text-accent-hot flex w-full items-start gap-1.5 text-[13px]">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    Los parámetros de esta regla no coinciden con lo que el verificador sabe leer,
                    así que hoy no se está aplicando. Vuelve a darla de alta con el formulario de
                    abajo.
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Aprendizaje ---------------------------------------------------- */}

      <BloqueAprendizaje aprendizaje={aprendizaje} pilares={cliente.pilares} />
    </>
  )
}

/* --- Piezas del documento --------------------------------------------------- */

function Bloque({ label, nota, children }: { label: string; nota?: string; children: ReactNode }) {
  return (
    <section className="border-line grid gap-3 border-b py-5 first:pt-0 last:border-b-0 md:grid-cols-[10rem_1fr] md:gap-6">
      <div>
        <Mono as="div" className="text-fg-muted">
          {label}
        </Mono>
        {nota && <p className="text-fg-muted mt-2 text-[12px] opacity-70">{nota}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function Prosa({ texto, vacio }: { texto: string | null; vacio: string }) {
  if (!texto) return <Vacio texto={vacio} />
  return <p className="max-w-prose text-[13px]">{texto}</p>
}

/** Un hueco del documento dice qué falta y para qué sirve, no "sin datos". */
function Vacio({ texto }: { texto: string }) {
  return <p className="text-fg-muted max-w-prose text-[13px]">{texto}</p>
}

/**
 * El historial completo, sin ruta aparte.
 *
 * La tabla es append-only, así que "el historial" ya está todo aquí: no hay
 * nada que ir a buscar a otra pantalla, y un `<details>` abre y cierra sin
 * JavaScript de cliente.
 */
function HistorialDeMarca({ versiones }: { versiones: VersionDeMarca[] }) {
  if (versiones.length <= 1) {
    return <Mono className="text-fg-muted opacity-70">Primera versión</Mono>
  }

  return (
    <details className="mt-1">
      <summary className="type-mono text-fg-muted hover:text-accent-hot cursor-pointer list-none">
        Ver historial de cambios
      </summary>
      <ul className="border-line mt-2 flex flex-col gap-1 border-t pt-2 text-left">
        {versiones.map((v) => (
          <li key={v.id} className="flex items-baseline justify-between gap-4">
            <Mono className="text-fg">v{v.version}</Mono>
            <Mono className="text-fg-muted">
              {formatDate(new Date(v.createdAt), { year: 'numeric' })}
              {v.createdByAgent && ` · ${AGENT_LABEL[v.createdByAgent]}`}
            </Mono>
          </li>
        ))}
      </ul>
    </details>
  )
}

/* --- Aprendizaje ------------------------------------------------------------ */

/**
 * Todo este bloque lo escribe el Analista, y se ve distinto por eso.
 *
 * El fondo `bg-surface` y el chip no son decoración: dentro del estudio nunca
 * se oculta la procedencia de un texto. El modo cliente sí omite el bloque
 * completo.
 */
function BloqueAprendizaje({
  aprendizaje,
  pilares,
}: {
  aprendizaje: AprendizajeDeMarca
  pilares: Cliente['pilares']
}) {
  const { top, ultimas, correcciones } = aprendizaje
  const colorPilar = new Map(pilares.map((p) => [p.id, p.color] as const))
  const vacio = top.length === 0 && ultimas.length === 0 && correcciones.length === 0

  return (
    <Card className="mt-12 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chip tone="agent">Analista</Chip>
        <Mono className="text-fg-muted">Aprendizaje</Mono>
      </div>

      {vacio ? (
        <p className="text-fg-muted max-w-prose text-[13px]">
          Todavía no hay de dónde aprender. En cuanto se capturen los resultados de un mes y edites
          tu primera pieza escrita por un agente, aquí aparece qué funcionó y qué corriges siempre.
        </p>
      ) : (
        <>
          <ListaDePiezas
            titulo="Top 5 histórico"
            piezas={top}
            colorPilar={colorPilar}
            vacio="Sin resultados capturados todavía. Importa el CSV de Meta Business Suite en Resultados."
          />
          <ListaDePiezas
            titulo="Últimas 3 publicadas"
            piezas={ultimas}
            colorPilar={colorPilar}
            vacio="Nada publicado todavía este ciclo."
          />

          <div>
            <Mono as="div" className="text-fg-muted mb-3">
              Correcciones aprendidas
            </Mono>
            {correcciones.length === 0 ? (
              <p className="text-fg-muted text-[13px]">
                Sin correcciones registradas. Cada vez que edites un campo que escribió un agente,
                el cambio se guarda y aparece aquí.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {correcciones.map((c) => (
                  <li key={c.id} className="border-line border-l-2 pl-3">
                    <Mono className="text-fg-muted">
                      {etiquetaDeCampo(c.field)}
                      {c.agent && ` · ${AGENT_LABEL[c.agent]}`}
                    </Mono>
                    <p className="mt-1 text-[13px]">
                      <span className="text-fg-muted line-through">{c.oldValue ?? '—'}</span>{' '}
                      <span aria-hidden className="text-fg-muted">
                        →
                      </span>{' '}
                      <span>{c.newValue ?? '—'}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  )
}

const formatoNumero = new Intl.NumberFormat('es-MX')

function ListaDePiezas({
  titulo,
  piezas,
  colorPilar,
  vacio,
}: {
  titulo: string
  piezas: PiezaConNumeros[]
  colorPilar: Map<string, string>
  vacio: string
}) {
  return (
    <div>
      <Mono as="div" className="text-fg-muted mb-3">
        {titulo}
      </Mono>
      {piezas.length === 0 ? (
        <p className="text-fg-muted text-[13px]">{vacio}</p>
      ) : (
        <ul className="flex flex-col">
          {piezas.map((p) => (
            <li
              key={p.id}
              className="border-line flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
            >
              <span
                aria-hidden
                className="h-3.5 w-1 shrink-0"
                style={{ backgroundColor: colorPilar.get(p.pillarId ?? '') ?? 'var(--color-line)' }}
              />
              <span className="min-w-[10rem] flex-1 truncate text-[13px]">
                {p.hook ?? 'Sin hook'}
              </span>
              <Mono className="text-fg-muted">{PIECE_FORMAT_LABEL[p.format]}</Mono>
              {p.publishAt && (
                <Mono className="text-fg-muted">{formatDate(new Date(p.publishAt))}</Mono>
              )}
              <Mono className="text-fg w-32 text-right">
                {formatoNumero.format(p.reach)} alcance
              </Mono>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
