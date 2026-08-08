'use client'

import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Button, Mono } from '@/components/ui/primitives'
import type { MonthKey } from '@/lib/time'

/**
 * Dispara el Analista sobre el mes visible (modo cierre: la lectura completa).
 *
 * Va por `/api/jobs/analista` y no por Server Action porque el runner escribe la
 * corrida con service_role, que solo se permite en `api/jobs`. Al terminar,
 * `router.refresh()` hace que la sección vuelva a leer `agent_runs` y pinte la
 * lectura recién hecha —no hay estado optimista: lo que se muestra es lo que el
 * agente dejó registrado—. Sigue en mock hasta que se encienda el proveedor.
 */
type RespuestaAnalista =
  | { ok: true; tipo: 'analisis'; quitar: number; meterMas: number; mejorar: number }
  | { ok: true; tipo: 'escalado'; pregunta: string }
  | { ok: false; message: string }

function avisoDeAnalista(data: RespuestaAnalista): { tono: 'ok' | 'error'; texto: string } {
  if (!data.ok) return { tono: 'error', texto: data.message }
  if (data.tipo === 'escalado')
    return { tono: 'ok', texto: 'El Analista preguntó algo; está en la Bandeja.' }
  return { tono: 'ok', texto: 'Lectura lista.' }
}

export function CorrerAnalistaBoton({ clientId, mes }: { clientId: string; mes: MonthKey }) {
  const router = useRouter()
  const [corriendo, setCorriendo] = useState(false)
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null)

  const correr = useCallback(async () => {
    setCorriendo(true)
    setAviso(null)

    let siguiente: { tono: 'ok' | 'error'; texto: string }
    try {
      const res = await fetch('/api/jobs/analista', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, month: mes, mode: 'cierre' }),
      })
      siguiente = avisoDeAnalista((await res.json()) as RespuestaAnalista)
    } catch {
      siguiente = { tono: 'error', texto: 'No se pudo contactar al Analista. Intenta de nuevo.' }
    }

    setCorriendo(false)
    setAviso(siguiente)
    if (siguiente.tono === 'ok') router.refresh()
  }, [clientId, mes, router])

  return (
    <div className="flex flex-wrap items-center gap-3" data-print="hide">
      <Button variant="agent" onClick={correr} disabled={corriendo} aria-busy={corriendo}>
        {corriendo && <LoaderCircle aria-hidden className="size-3.5 animate-spin" />}
        {corriendo ? 'Corriendo Analista' : 'Correr Analista'}
      </Button>
      {aviso && (
        <Mono role="status" className={aviso.tono === 'ok' ? 'text-fg-muted' : 'text-accent-hot'}>
          {aviso.texto}
        </Mono>
      )}
    </div>
  )
}
