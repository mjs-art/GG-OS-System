'use client'

import { useState } from 'react'
import { Button, Mono } from '@/components/ui/primitives'
import { RULE_SEVERITY_LABEL } from '@/domain/labels'
import { agregarReglaDura } from './acciones'
import { TIPOS_DE_REGLA, type TipoDeRegla } from './etiquetas'

/**
 * Alta de una regla dura.
 *
 * No pide un JSON de parámetros: pide un **tipo** de regla, y de ahí sale la
 * configuración que `checkCodeRules` sabe leer. Un campo libre de parámetros
 * produciría reglas que se guardan bien y nunca se evalúan, que es peor que no
 * tener la regla: se ve en la lista y da falsa tranquilidad.
 *
 * Los campos que el tipo elegido no necesita **no se renderizan**, así que
 * `FormData.get()` devuelve `null` para ellos. Por eso el esquema del servidor
 * los declara `.nullish()` y no `.optional()`.
 *
 * El envío no usa `useActionState`: se llama a la acción desde un handler
 * propio para poder cerrar el formulario solo cuando el guardado salió bien.
 * Con `useActionState` habría que detectar el éxito desde un efecto, y un
 * `setState` dentro de un efecto es justo lo que la regla de React prohíbe.
 */

const claseCampo =
  'border-line bg-bg text-fg w-full rounded-xs border px-3 py-2 text-[13px] placeholder:text-fg-muted'

export function FormularioRegla({
  clientId,
  orgId,
  slug,
}: {
  clientId: string
  orgId: string
  slug: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<TipoDeRegla>('hashtags_exact')
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  const seleccionado = TIPOS_DE_REGLA.find((t) => t.valor === tipo)

  async function enviar(formData: FormData) {
    setPendiente(true)
    setError(null)
    const resultado = await agregarReglaDura(formData)
    setPendiente(false)

    if (resultado.status === 'error') {
      setError(resultado.message)
      return
    }
    setExito(resultado.message)
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setExito(null)
            setAbierto(true)
          }}
        >
          Agregar regla
        </Button>
        {exito && <Mono className="text-ok">{exito}</Mono>}
      </div>
    )
  }

  return (
    <form action={enviar} className="border-line mt-4 flex flex-col gap-4 rounded-xs border p-5">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />

      <label className="flex flex-col gap-1.5">
        <Mono as="span" className="text-fg-muted">
          La regla, como se la dirías a alguien nuevo
        </Mono>
        <input
          name="rule"
          required
          maxLength={500}
          className={claseCampo}
          placeholder="Nunca prometer disponibilidad de mesa sin reserva"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <Mono as="span" className="text-fg-muted">
            Cómo se verifica
          </Mono>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDeRegla)}
            className={claseCampo}
          >
            {TIPOS_DE_REGLA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <Mono as="span" className="text-fg-muted">
            Severidad
          </Mono>
          <select name="severity" defaultValue="media" className={claseCampo}>
            {Object.entries(RULE_SEVERITY_LABEL).map(([valor, label]) => (
              <option key={valor} value={valor}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {seleccionado?.pide === 'cantidad' && (
        <label className="flex flex-col gap-1.5">
          <Mono as="span" className="text-fg-muted">
            Cuántos hashtags exactos
          </Mono>
          <input
            name="cantidad"
            type="number"
            min={0}
            max={30}
            defaultValue={5}
            className={claseCampo}
          />
        </label>
      )}

      {seleccionado?.pide === 'palabras' && (
        <label className="flex flex-col gap-1.5">
          <Mono as="span" className="text-fg-muted">
            Palabras prohibidas, separadas por coma
          </Mono>
          <input
            name="palabras"
            className={claseCampo}
            placeholder="exclusivo, único, imperdible"
          />
        </label>
      )}

      <p className="text-fg-muted text-[13px]">
        {seleccionado?.verifica === 'codigo'
          ? 'Esta la verifica el código: es determinista, gratis y no se puede convencer.'
          : 'Esta la revisa un modelo. Su veredicto es opinable, así que llega a la Bandeja cuando duda.'}
      </p>

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={pendiente}>
          {pendiente ? 'Guardando' : 'Guardar regla'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
