'use client'

import { LoaderCircle, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button, Card, Display, EmptyState, Mono, Stat } from '@/components/ui/primitives'
import { agregarReferencia, borrarReferencia, sincronizarReferencias } from './acciones-referencias'

/**
 * § Referencias — la competencia y la inspiración.
 *
 * Es cliente por lo mismo que § Redes: el destello del botón y el formulario de
 * alta. Todo lo que se calcula —la brecha contra el cliente, los textos "hace N
 * días"— ya viene resuelto del servidor, que es donde vive el reloj.
 *
 * Los números de estas cuentas salen de Apify (scrape público): seguidores,
 * cadencia y los posts con más engagement. Reach e impresiones no se ven de
 * fuera, así que aquí no aparecen — a diferencia del dato propio del cliente.
 */

export interface PostDeReferencia {
  caption: string
  likes: number
  comments: number
  url: string | null
}

export interface TarjetaReferencia {
  id: string
  plataforma: string
  handle: string
  url: string | null
  label: string | null
  kind: 'competencia' | 'inspiracion'
  seguidores: number
  /** Referencia menos cliente. `null` para inspiración o si falta la base. */
  brechaConCliente: number | null
  porSemana: number
  textoUltima: string
  ultimaEnAlerta: boolean
  topPosts: PostDeReferencia[]
  textoRevision: string | null
}

const MINIMO_SPINNER_MS = 2000

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const formatoNumero = new Intl.NumberFormat('es-MX')

function numeroCorto(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}

const claseCampo =
  'border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px] placeholder:text-fg-muted'

export function PanelReferencias({
  clientId,
  orgId,
  slug,
  tarjetas,
}: {
  clientId: string
  orgId: string
  slug: string
  tarjetas: TarjetaReferencia[]
}) {
  const [sincronizando, setSincronizando] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [pendiente, setPendiente] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)

  const sincronizar = useCallback(async () => {
    setSincronizando(true)
    setAviso(null)
    const [resultado] = await Promise.all([
      sincronizarReferencias({ clientId, slug }),
      esperar(MINIMO_SPINNER_MS),
    ])
    setSincronizando(false)
    setAviso({ tono: resultado.status === 'ok' ? 'ok' : 'error', texto: resultado.message })
  }, [clientId, slug])

  async function enviar(formData: FormData) {
    setPendiente(true)
    setErrorForm(null)
    const resultado = await agregarReferencia(formData)
    setPendiente(false)
    if (resultado.status === 'error') {
      setErrorForm(resultado.message)
      return
    }
    setAbierto(false)
    setAviso({ tono: 'ok', texto: resultado.message })
  }

  const competencia = tarjetas.filter((t) => t.kind === 'competencia')
  const inspiracion = tarjetas.filter((t) => t.kind === 'inspiracion')

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        {aviso && (
          <Mono role="status" className={aviso.tono === 'ok' ? 'text-fg-muted' : 'text-accent-hot'}>
            {aviso.texto}
          </Mono>
        )}
        <Button
          variant="agent"
          onClick={sincronizar}
          disabled={sincronizando}
          aria-busy={sincronizando}
        >
          {sincronizando && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {sincronizando ? 'Sincronizando' : 'Sincronizar referencias'}
        </Button>
        <Button variant="secondary" onClick={() => setAbierto((a) => !a)}>
          {abierto ? 'Cancelar' : 'Agregar cuenta'}
        </Button>
      </div>

      {abierto && (
        <form
          action={enviar}
          className="border-line mb-6 flex flex-col gap-4 rounded-xs border p-5"
        >
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="slug" value={slug} />
          {/* Instagram por ahora: es la única red que el scraper sincroniza. */}
          <input type="hidden" name="platform" value="instagram" />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Mono as="span" className="text-fg-muted">
                Handle de Instagram
              </Mono>
              <input
                name="handle"
                required
                maxLength={120}
                className={claseCampo}
                placeholder="@competidor"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <Mono as="span" className="text-fg-muted">
                Para qué la sigues
              </Mono>
              <select name="kind" defaultValue="competencia" className={claseCampo}>
                <option value="competencia">Competencia</option>
                <option value="inspiracion">Inspiración</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <Mono as="span" className="text-fg-muted">
              Etiqueta (opcional)
            </Mono>
            <input
              name="label"
              maxLength={120}
              className={claseCampo}
              placeholder="Competidor directo, misma zona"
            />
          </label>

          {errorForm && (
            <p className="text-accent-hot text-[13px]" role="alert">
              {errorForm}
            </p>
          )}

          <div>
            <Button type="submit" variant="primary" disabled={pendiente}>
              {pendiente ? 'Agregando' : 'Agregar a la lista'}
            </Button>
          </div>
        </form>
      )}

      {tarjetas.length === 0 ? (
        <EmptyState
          title="Sin cuentas de referencia"
          body="Agrega la competencia del cliente y las cuentas que te inspiran. Luego sincroniza para traer sus seguidores, su cadencia y los posts que más les funcionaron."
        />
      ) : (
        <div className="flex flex-col gap-8">
          {competencia.length > 0 && (
            <Grupo titulo="Competencia" tarjetas={competencia} slug={slug} />
          )}
          {inspiracion.length > 0 && (
            <Grupo titulo="Inspiración" tarjetas={inspiracion} slug={slug} />
          )}
        </div>
      )}
    </>
  )
}

function Grupo({
  titulo,
  tarjetas,
  slug,
}: {
  titulo: string
  tarjetas: TarjetaReferencia[]
  slug: string
}) {
  return (
    <section>
      <Mono className="text-fg-muted mb-3 block">{titulo}</Mono>
      <div className="grid gap-4 md:grid-cols-2">
        {tarjetas.map((t) => (
          <TarjetaDeReferencia key={t.id} tarjeta={t} slug={slug} />
        ))}
      </div>
    </section>
  )
}

function TarjetaDeReferencia({ tarjeta, slug }: { tarjeta: TarjetaReferencia; slug: string }) {
  const brecha = tarjeta.brechaConCliente

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Display className="truncate text-base">{tarjeta.label ?? tarjeta.handle}</Display>
          <Mono className="text-fg-muted mt-1 block truncate">
            {tarjeta.plataforma} · {tarjeta.handle}
          </Mono>
        </div>
        {/* La acción devuelve un estado que aquí no se usa: al borrar, revalidate
            quita la tarjeta. Se envuelve para que el tipo del form sea void. */}
        <form action={async (fd) => void (await borrarReferencia(fd))}>
          <input type="hidden" name="id" value={tarjeta.id} />
          <input type="hidden" name="slug" value={slug} />
          <button
            type="submit"
            aria-label={`Quitar ${tarjeta.handle} de la lista`}
            className="text-fg-muted hover:text-accent-hot shrink-0 transition-colors"
          >
            <Trash2 aria-hidden className="size-3.5" />
          </button>
        </form>
      </div>

      <Stat
        value={formatoNumero.format(tarjeta.seguidores)}
        label="Seguidores"
        size="md"
        {...(brecha !== null && brecha !== 0
          ? {
              delta: formatoNumero.format(Math.abs(brecha)),
              trend: brecha > 0 ? ('up' as const) : ('down' as const),
              // Menos seguidores que el cliente es buena noticia para el cliente.
              isGood: brecha < 0,
            }
          : {})}
      />

      {brecha !== null && (
        <Mono className="text-fg-muted">
          {brecha > 0
            ? `${formatoNumero.format(brecha)} más que tu cliente`
            : brecha < 0
              ? `${formatoNumero.format(-brecha)} menos que tu cliente`
              : 'empatados con tu cliente'}
        </Mono>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <Mono className="text-fg-muted">Última publicación</Mono>
        <Mono className={tarjeta.ultimaEnAlerta ? 'text-accent-hot' : 'text-fg'}>
          {tarjeta.textoUltima}
        </Mono>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <Mono className="text-fg-muted">Cadencia</Mono>
        <Mono className="text-fg">{numeroCorto(tarjeta.porSemana)} por semana</Mono>
      </div>

      {tarjeta.topPosts.length > 0 && (
        <div className="border-line border-t pt-4">
          <Mono className="text-fg-muted mb-2 block">Lo que más les funcionó</Mono>
          <ul className="flex flex-col gap-3">
            {tarjeta.topPosts.slice(0, 3).map((p, i) => (
              <li key={p.url ?? `${tarjeta.id}-${i}`} className="flex flex-col gap-0.5">
                <span className="text-fg line-clamp-2 text-[13px]">{p.caption || 'Sin texto'}</span>
                <Mono className="text-fg-muted">
                  {formatoNumero.format(p.likes)} likes · {formatoNumero.format(p.comments)}{' '}
                  comentarios
                </Mono>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tarjeta.textoRevision && (
        <Mono className="text-fg-muted opacity-70">{tarjeta.textoRevision}</Mono>
      )}
    </Card>
  )
}
