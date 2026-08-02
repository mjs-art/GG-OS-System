'use client'

import { useState } from 'react'
import { Button, Display, Mono } from '@/components/ui/primitives'
import { guardarNotaDeMarca } from './acciones'

export function NotaDeMarcaSection({
  clientId,
  orgId,
  slug,
  nota,
}: {
  clientId: string
  orgId: string
  slug: string
  nota: { id: string; body: string; updatedAt: string } | null
}) {
  const [editando, setEditando] = useState(false)
  const [pendiente, setPendiente] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  async function guardar(formData: FormData) {
    setPendiente(true)
    setError(null)
    formData.set('clientId', clientId)
    formData.set('orgId', orgId)
    formData.set('slug', slug)
    const resultado = await guardarNotaDeMarca(formData)
    setPendiente(false)

    if (resultado.status === 'error') {
      setError(resultado.message)
      return
    }
    setExito(resultado.message)
    setEditando(false)
  }

  const tieneContenido = nota !== null && nota.body.trim().length > 0

  return (
    <div className="mt-12">
      <header className="border-line mb-4 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h3" className="text-base">
            Referencias
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            Espacio libre para briefs, links, apuntes, ideas. Lo que sea que el equipo necesita
            tener a la mano sobre esta marca. El contenido de aquí lo leen los agentes al generar
            copy.
          </p>
        </div>
      </header>

      {editando ? (
        <Formulario
          clientId={clientId}
          orgId={orgId}
          slug={slug}
          valorActual={nota?.body ?? ''}
          error={error}
          exito={exito}
          pendiente={pendiente}
          onGuardar={guardar}
          onCancelar={() => setEditando(false)}
        />
      ) : tieneContenido ? (
        <VistaNota
          nota={nota}
          onEditar={() => {
            setExito(null)
            setEditando(true)
          }}
        />
      ) : (
        <EstadoVacio onEmpezar={() => setEditando(true)} />
      )}
    </div>
  )
}

function EstadoVacio({ onEmpezar }: { onEmpezar: () => void }) {
  return (
    <div className="border-line rounded-xs border border-dashed p-6">
      <p className="text-fg-muted mb-3 text-[13px]">
        No hay referencias guardadas todavía. Escribe lo que el equipo necesita saber: el brief del
        mes, links de referencia, frases que funcionaron, lo que no hay que hacer.
      </p>
      <Button variant="secondary" onClick={onEmpezar}>
        Escribir referencias
      </Button>
    </div>
  )
}

function VistaNota({
  nota,
  onEditar,
}: {
  nota: { body: string; updatedAt: string }
  onEditar: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[13px] whitespace-pre-wrap">{nota.body}</div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={onEditar}>
          Editar
        </Button>
        <Mono className="text-fg-muted text-xs">
          Último cambio:{' '}
          {new Date(nota.updatedAt).toLocaleDateString('es-MX', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Mono>
      </div>
    </div>
  )
}

function Formulario({
  clientId,
  orgId,
  slug,
  valorActual,
  error,
  exito,
  pendiente,
  onGuardar,
  onCancelar,
}: {
  clientId: string
  orgId: string
  slug: string
  valorActual: string
  error: string | null
  exito: string | null
  pendiente: boolean
  onGuardar: (formData: FormData) => Promise<void>
  onCancelar: () => void
}) {
  return (
    <form action={onGuardar} className="flex flex-col gap-4">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="slug" value={slug} />
      <textarea
        name="body"
        defaultValue={valorActual}
        rows={12}
        maxLength={50_000}
        className="border-line bg-bg text-fg placeholder:text-fg-muted w-full resize-y rounded-xs border px-3 py-2 text-[13px]"
        placeholder="El brief de este mes, links de referencia, frases que han funcionado..."
      />
      <Mono className="text-fg-muted">
        Hasta 50,000 caracteres. Texto libre, sin formato. Lo leen los agentes al generar copy.
      </Mono>

      {error && (
        <p className="text-accent-hot text-[13px]" role="alert">
          {error}
        </p>
      )}
      {exito && <Mono className="text-ok">{exito}</Mono>}

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
