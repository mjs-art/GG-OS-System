'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'

/**
 * "Preparar el mes": un disparo que corre el Redactor sobre todo el copy que
 * falta del mes, para llegar a revisar en vez de a escribir.
 *
 * No pisa nada ya escrito y respeta el tope de gasto — eso lo garantiza el
 * servidor (`@/agents/preparar-mes`). Aquí solo se dispara y se reporta qué
 * pasó, con el detalle suficiente para que Ana sepa a qué ir: cuántas se
 * escribieron, cuántas preguntaron (y están en la Bandeja), cuántas no se
 * tocaron y por qué.
 */

interface Resumen {
  candidatas: number
  escritas: number
  escaladas: number
  yaTrabajadas: number
  sinInsumos: number
  presupuestoAgotado: boolean
  errores: { message: string }[]
}

function contar(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Traduce el resumen del servidor a un título y una descripción para el toast. */
function mensajeDeResumen(r: Resumen): { titulo: string; descripcion: string } {
  if (r.candidatas === 0) {
    const partes = []
    if (r.yaTrabajadas > 0)
      partes.push(`${contar(r.yaTrabajadas, 'pieza ya', 'piezas ya')} trabajada`)
    if (r.sinInsumos > 0) {
      partes.push(`${contar(r.sinInsumos, 'pieza', 'piezas')} sin idea, pilar o plataforma`)
    }
    return {
      titulo: 'Nada que escribir este mes',
      descripcion:
        partes.length > 0
          ? `${partes.join(' y ')}. El Redactor solo escribe lo que está en idea y sin empezar.`
          : 'No hay piezas en este mes todavía.',
    }
  }

  const hechas = []
  if (r.escritas > 0) hechas.push(contar(r.escritas, 'escrita', 'escritas'))
  if (r.escaladas > 0) hechas.push(`${contar(r.escaladas, 'pregunta', 'preguntas')} en la Bandeja`)

  const cola = []
  if (r.presupuestoAgotado)
    cola.push(
      'se alcanzó el tope de gasto del Redactor; el resto queda para el mes que viene o subiendo el tope en Agentes',
    )
  if (r.sinInsumos > 0)
    cola.push(
      `${contar(r.sinInsumos, 'pieza quedó', 'piezas quedaron')} sin idea, pilar o plataforma`,
    )
  if (r.errores.length > 0) cola.push(r.errores[0]?.message ?? '')

  return {
    titulo:
      hechas.length > 0 ? `Mes preparado: ${hechas.join(' · ')}` : 'El Redactor no pudo avanzar',
    descripcion:
      cola.filter(Boolean).join('. ') ||
      'Revisa el copy en el planner y aprueba lo que quede bien.',
  }
}

export function PrepararMesBoton({ clientId, month }: { clientId: string; month: string }) {
  const router = useRouter()
  const [corriendo, setCorriendo] = useState(false)

  async function preparar() {
    if (corriendo) return
    setCorriendo(true)
    const id = toast.loading('Preparando el mes…', {
      description: 'El Redactor está escribiendo el copy que falta. No cierres la pestaña.',
    })

    try {
      const res = await fetch('/api/jobs/preparar-mes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, month }),
      })
      const r = (await res.json()) as
        { ok: true; resumen: Resumen } | { ok: false; message: string }

      if (!r.ok) {
        toast.error('No se pudo preparar el mes', { id, description: r.message })
        return
      }

      const { titulo, descripcion } = mensajeDeResumen(r.resumen)
      if (r.resumen.escritas > 0 || r.resumen.escaladas > 0) {
        toast.success(titulo, { id, description: descripcion })
      } else {
        toast(titulo, { id, description: descripcion })
      }
      router.refresh()
    } catch (error) {
      const message =
        error instanceof TypeError
          ? 'No hay conexión con el servidor. Revisa tu internet y vuelve a intentarlo.'
          : 'Falló la conexión. Si el problema persiste, recarga la página.'
      toast.error('No se pudo preparar el mes', { id, description: message })
    } finally {
      setCorriendo(false)
    }
  }

  return (
    <Button variant="secondary" onClick={preparar} disabled={corriendo}>
      <Sparkles aria-hidden className="size-3.5" />
      {corriendo ? 'Preparando…' : 'Preparar el mes'}
    </Button>
  )
}
