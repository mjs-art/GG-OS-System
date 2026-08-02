'use client'

import { useState } from 'react'
import { Button, Mono } from '@/components/ui/primitives'
import { RULE_SEVERITY_LABEL, type RuleSeverity } from '@/domain/labels'
import { editarReglaDura } from './acciones'

const claseCampo =
  'border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px] placeholder:text-fg-muted'

export function FormularioEditarRegla({
  ruleId,
  clientId,
  slug,
  textoActual,
  severidadActual,
  onCancelar,
}: {
  ruleId: string
  clientId: string
  slug: string
  textoActual: string
  severidadActual: RuleSeverity
  onCancelar: () => void
}) {
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(formData: FormData) {
    setPendiente(true)
    setError(null)
    formData.set('id', ruleId)
    formData.set('clientId', clientId)
    formData.set('slug', slug)
    const resultado = await editarReglaDura(formData)
    setPendiente(false)

    if (resultado.status === 'error') {
      setError(resultado.message)
      return
    }
    onCancelar()
  }

  return (
    <form action={enviar} className="border-line mt-3 flex flex-col gap-3 rounded-xs border p-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />

      <label className="flex flex-col gap-1.5">
        <Mono as="span" className="text-fg-muted">
          La regla
        </Mono>
        <input
          name="rule"
          required
          maxLength={500}
          defaultValue={textoActual}
          className={claseCampo}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Mono as="span" className="text-fg-muted">
          Severidad
        </Mono>
        <select name="severity" defaultValue={severidadActual} className={claseCampo}>
          {Object.entries(RULE_SEVERITY_LABEL).map(([valor, label]) => (
            <option key={valor} value={valor}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pendiente}>
          {pendiente ? 'Guardando' : 'Guardar'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
