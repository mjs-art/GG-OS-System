'use client'

import { Check, LoaderCircle, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Display,
  Mono,
  ProgressBar,
  Stat,
  StatusDot,
} from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import type { Semaforo } from '@/domain/redes'
import { auditarCuentas, sincronizarRedes } from './acciones'

/**
 * La respuesta de `/api/jobs/auditor`. Se tipa lo mínimo que lee la UI; el
 * contrato completo lo valida el servidor.
 */
type RespuestaAuditor =
  | { ok: true; tipo: 'auditoria'; cuentas: number }
  | { ok: true; tipo: 'escalado'; pregunta: string }
  | { ok: false; message: string }

function avisoDeAuditor(data: RespuestaAuditor): { tono: 'ok' | 'error'; texto: string } {
  if (!data.ok) return { tono: 'error', texto: data.message }
  if (data.tipo === 'escalado')
    return { tono: 'ok', texto: 'El Auditor preguntó algo; está en la Bandeja.' }
  const n = data.cuentas
  return {
    tono: 'ok',
    texto: `Auditor: ${n} ${n === 1 ? 'cuenta auditada' : 'cuentas auditadas'}. El detalle está en la bitácora de Agentes.`,
  }
}

/**
 * Las tarjetas de § Redes, con el botón de auditar.
 *
 * Es cliente por una sola razón: el destello. Todo lo demás —el semáforo, los
 * días sin publicar, el checklist— ya viene resuelto del servidor, porque son
 * decisiones de negocio y no de interfaz.
 */

export interface RenglonChecklist {
  clave: string
  label: string
  cumple: boolean
}

export interface TarjetaRed {
  id: string
  plataforma: string
  handle: string | null
  url: string | null
  seguidores: number
  delta: number
  /** "hace 2 días", "hoy" o el aviso de que no hay fecha capturada. */
  textoUltima: string
  /** Pasó el umbral: el renglón se lee en accent-hot. */
  ultimaEnAlerta: boolean
  porSemana: number
  objetivo: number
  checklist: RenglonChecklist[]
  dms: number
  comentarios: number
  estado: Semaforo
  etiquetaEstado: string
  razones: string[]
  /** "revisada hace 3 días" — de `checked_at`. */
  textoRevision: string | null
}

/**
 * El spinner dura mínimo dos segundos aunque la revisión tarde 40ms.
 *
 * No es teatro: el resultado más común de auditar es que nada cambie, y un
 * botón que se apaga y se prende en un frame se lee como "no hizo nada".
 * Dos segundos y un destello es la diferencia entre "no sirve" y "ya revisé".
 */
const MINIMO_SPINNER_MS = 2000
const DURACION_DESTELLO_MS = 900

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const formatoNumero = new Intl.NumberFormat('es-MX')

function numeroCorto(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}

export function PanelRedes({
  clientId,
  slug,
  tarjetas,
}: {
  clientId: string
  slug: string
  tarjetas: TarjetaRed[]
}) {
  const router = useRouter()
  const [corriendo, setCorriendo] = useState(false)
  const [destellando, setDestellando] = useState<readonly string[]>([])
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Un setState después de desmontar es un warning en consola y una fuga de
  // memoria chica; con un timer de 900ms es fácil que pase al navegar.
  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current)
    }
  }, [])

  const auditar = useCallback(async () => {
    setCorriendo(true)
    setAviso(null)
    setDestellando([])

    const [resultado] = await Promise.all([
      auditarCuentas({ clientId, slug }),
      esperar(MINIMO_SPINNER_MS),
    ])

    setCorriendo(false)
    setAviso({ tono: resultado.status === 'ok' ? 'ok' : 'error', texto: resultado.message })

    if (resultado.status === 'ok') {
      setDestellando(resultado.revisadas)
      temporizador.current = setTimeout(() => setDestellando([]), DURACION_DESTELLO_MS)
    }
  }, [clientId, slug])

  const sincronizar = useCallback(async () => {
    setCorriendo(true)
    setAviso(null)
    setDestellando([])

    const [resultado] = await Promise.all([
      sincronizarRedes({ clientId, slug }),
      esperar(MINIMO_SPINNER_MS),
    ])

    setCorriendo(false)
    setAviso({ tono: resultado.status === 'ok' ? 'ok' : 'error', texto: resultado.message })

    if (resultado.status === 'ok' && resultado.revisadas.length > 0) {
      setDestellando(resultado.revisadas)
      temporizador.current = setTimeout(() => setDestellando([]), DURACION_DESTELLO_MS)
    }
  }, [clientId, slug])

  // El Auditor de IA (distinto del re-sello determinista de "Auditar cuentas"):
  // corre el agente, que escribe sus hallazgos en account_audits y queda en la
  // bitácora. Va por la ruta y no por Server Action porque escribe con
  // service_role, que solo se permite en `api/jobs`. Sigue en mock hasta que se
  // encienda el proveedor: entonces esta misma llamada empieza a costar.
  const correrAuditor = useCallback(async () => {
    setCorriendo(true)
    setAviso(null)
    setDestellando([])

    let siguiente: { tono: 'ok' | 'error'; texto: string }
    try {
      const [res] = await Promise.all([
        fetch('/api/jobs/auditor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId }),
        }),
        esperar(MINIMO_SPINNER_MS),
      ])
      siguiente = avisoDeAuditor((await res.json()) as RespuestaAuditor)
    } catch {
      siguiente = { tono: 'error', texto: 'No se pudo contactar al Auditor. Intenta de nuevo.' }
    }

    setCorriendo(false)
    setAviso(siguiente)
    if (siguiente.tono === 'ok') router.refresh()
  }, [clientId, router])

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        {aviso && (
          <Mono role="status" className={aviso.tono === 'ok' ? 'text-fg-muted' : 'text-accent-hot'}>
            {aviso.texto}
          </Mono>
        )}
        <Button variant="agent" onClick={sincronizar} disabled={corriendo} aria-busy={corriendo}>
          {corriendo && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {corriendo ? 'Sincronizando' : 'Sincronizar Instagram'}
        </Button>
        <Button variant="agent" onClick={auditar} disabled={corriendo} aria-busy={corriendo}>
          {corriendo && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {corriendo ? 'Marcando' : 'Marcar revisadas'}
        </Button>
        <Button
          variant="primary"
          onClick={correrAuditor}
          disabled={corriendo}
          aria-busy={corriendo}
        >
          {corriendo && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
          {corriendo ? 'Corriendo Auditor' : 'Correr Auditor'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tarjetas.map((t) => (
          <TarjetaDeRed key={t.id} tarjeta={t} destella={destellando.includes(t.id)} />
        ))}
      </div>
    </>
  )
}

function TarjetaDeRed({ tarjeta, destella }: { tarjeta: TarjetaRed; destella: boolean }) {
  const sinResponder = tarjeta.dms + tarjeta.comentarios

  return (
    <Card
      className={cn(
        // El destello es un cambio de superficie, no un keyframe: así respeta
        // `prefers-reduced-motion` sin código extra — globals.css ya recorta
        // las transiciones a 0.01ms cuando alguien lo pidió.
        'flex flex-col gap-5 transition-colors duration-500 ease-out',
        destella && 'bg-surface-2',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Display className="text-base">{tarjeta.plataforma}</Display>
          {tarjeta.handle && (
            <Mono className="text-fg-muted mt-1 block truncate">{tarjeta.handle}</Mono>
          )}
        </div>
        <StatusDot status={tarjeta.estado} label={tarjeta.etiquetaEstado} size={14} />
      </div>

      <Stat
        value={formatoNumero.format(tarjeta.seguidores)}
        label="Seguidores"
        size="md"
        {...(tarjeta.delta !== 0
          ? {
              delta: formatoNumero.format(Math.abs(tarjeta.delta)),
              trend: tarjeta.delta > 0 ? ('up' as const) : ('down' as const),
              isGood: tarjeta.delta > 0,
            }
          : {})}
      />

      <div className="flex items-baseline justify-between gap-3">
        <Mono className="text-fg-muted">Última publicación</Mono>
        <Mono className={tarjeta.ultimaEnAlerta ? 'text-accent-hot' : 'text-fg'}>
          {tarjeta.textoUltima}
        </Mono>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <Mono className="text-fg-muted">Consistencia</Mono>
          <Mono className="text-fg">
            {numeroCorto(tarjeta.porSemana)} / {numeroCorto(tarjeta.objetivo)} por semana
          </Mono>
        </div>
        <ProgressBar
          value={tarjeta.porSemana}
          max={tarjeta.objetivo}
          tone={tarjeta.porSemana >= tarjeta.objetivo ? 'ok' : 'accent'}
        />
      </div>

      <ul className="border-line flex flex-col gap-2 border-t pt-4">
        {tarjeta.checklist.map((r) => (
          <li key={r.clave} className="flex items-center gap-2">
            {r.cumple ? (
              <Check aria-hidden className="text-ok size-3.5 shrink-0" />
            ) : (
              <X aria-hidden className="text-accent-hot size-3.5 shrink-0" />
            )}
            <Mono className={r.cumple ? 'text-fg-muted' : 'text-accent-hot'}>{r.label}</Mono>
            <span className="sr-only">{r.cumple ? 'cumple' : 'no cumple'}</span>
          </li>
        ))}
      </ul>

      <div className="border-line flex flex-wrap items-baseline justify-between gap-3 border-t pt-4">
        <Mono className="text-fg-muted">Sin responder</Mono>
        <Mono className={sinResponder > 0 ? 'text-fg' : 'text-fg-muted'}>
          {tarjeta.dms} DM · {tarjeta.comentarios} comentarios
        </Mono>
      </div>

      {tarjeta.razones.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {tarjeta.razones.map((razon) => (
            <li key={razon} className="text-fg-muted text-[13px]">
              {razon}
            </li>
          ))}
        </ul>
      )}

      {tarjeta.textoRevision && (
        <Mono className="text-fg-muted opacity-70">{tarjeta.textoRevision}</Mono>
      )}
    </Card>
  )
}
