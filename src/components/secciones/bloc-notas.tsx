'use client'

import { useState } from 'react'
import { Button, Mono } from '@/components/ui/primitives'
import { borrarNotaPrivada, guardarNotaPrivada } from './acciones'

/**
 * El bloc de § Privado.
 *
 * Cada nota es un formulario aparte y no un solo formulario grande: así
 * guardar una no arrastra a las otras, y un error de red en la nota tres no se
 * lleva lo que estabas escribiendo en la uno.
 *
 * Los textareas son **controlados**, a diferencia del resto de los formularios
 * de la app. La razón: React 19 resetea un formulario no controlado en cuanto
 * su acción termina, con éxito o sin él, y aquí eso significaría borrar de la
 * pantalla una nota que no se alcanzó a guardar. En un bloc privado, perder lo
 * escrito por un error de red es el peor final posible.
 *
 * No hay guardado automático, y también es a propósito: un textarea que se
 * guarda solo, en la sección de "lo que no le puedo decir al cliente", es una
 * manera muy eficiente de guardar un borrador que no querías guardar.
 */

export interface NotaEnPantalla {
  id: string
  body: string
  /** Ya formateada en el servidor, para que no cambie entre render e hidratación. */
  textoActualizada: string
}

const claseTextarea =
  'border-line bg-bg text-fg min-h-32 w-full resize-y rounded-xs border p-3 text-[13px] leading-relaxed placeholder:text-fg-muted'

export function BlocNotas({
  clientId,
  orgId,
  slug,
  notas,
}: {
  clientId: string
  orgId: string
  slug: string
  notas: NotaEnPantalla[]
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <NotaNueva clientId={clientId} orgId={orgId} slug={slug} />
      {notas.map((n) => (
        <NotaEditable key={n.id} nota={n} clientId={clientId} orgId={orgId} slug={slug} />
      ))}
    </div>
  )
}

function NotaNueva({ clientId, orgId, slug }: { clientId: string; orgId: string; slug: string }) {
  const [texto, setTexto] = useState('')
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(formData: FormData) {
    setPendiente(true)
    setError(null)
    const resultado = await guardarNotaPrivada(formData)
    setPendiente(false)

    if (resultado.status === 'error') {
      setError(resultado.message)
      return
    }
    setTexto('')
  }

  return (
    <form
      action={enviar}
      className="border-line bg-surface flex flex-col gap-3 rounded-xs border border-dashed p-4"
    >
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />

      <Mono className="text-fg-muted">Nota nueva</Mono>
      <textarea
        name="body"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className={claseTextarea}
        placeholder="Lo que no va en el reporte: cómo viene la relación, qué prometiste de palabra, qué no volver a proponer."
      />

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={pendiente} className="self-start">
        {pendiente ? 'Guardando' : 'Guardar nota'}
      </Button>
    </form>
  )
}

function NotaEditable({
  nota,
  clientId,
  orgId,
  slug,
}: {
  nota: NotaEnPantalla
  clientId: string
  orgId: string
  slug: string
}) {
  const [texto, setTexto] = useState(nota.body)
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  async function guardar(formData: FormData) {
    setPendiente(true)
    setError(null)
    setAviso(null)
    const resultado = await guardarNotaPrivada(formData)
    setPendiente(false)

    if (resultado.status === 'error') setError(resultado.message)
    else setAviso(resultado.message)
  }

  async function borrar(formData: FormData) {
    setPendiente(true)
    setError(null)
    const resultado = await borrarNotaPrivada(formData)
    setPendiente(false)

    // En éxito no hay nada que anunciar: la nota desaparece de la lista en
    // cuanto la revalidación vuelve del servidor.
    if (resultado.status === 'error') {
      setError(resultado.message)
      setConfirmando(false)
    }
  }

  return (
    <div className="border-line bg-surface flex flex-col gap-3 rounded-xs border p-4">
      <form action={guardar} className="flex flex-col gap-3">
        <input type="hidden" name="id" value={nota.id} />
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="slug" value={slug} />

        <div className="flex items-baseline justify-between gap-3">
          <Mono className="text-fg-muted">{nota.textoActualizada}</Mono>
          {aviso && <Mono className="text-ok">{aviso}</Mono>}
        </div>

        <textarea
          name="body"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          className={claseTextarea}
        />

        <Button type="submit" variant="secondary" disabled={pendiente} className="self-start">
          {pendiente ? 'Guardando' : 'Guardar'}
        </Button>
      </form>

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}

      {/* Formulario hermano y no anidado: HTML no permite un form dentro de
          otro, y el navegador lo "arregla" descartando el de adentro. */}
      {confirmando ? (
        <form action={borrar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={nota.id} />
          <input type="hidden" name="slug" value={slug} />
          <Mono className="text-fg-muted">¿Borrar esta nota?</Mono>
          <Button type="submit" variant="primary" disabled={pendiente}>
            Sí, borrar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setConfirmando(true)}
          className="self-start"
        >
          Borrar
        </Button>
      )}
    </div>
  )
}
