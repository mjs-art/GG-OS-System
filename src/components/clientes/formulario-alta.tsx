'use client'

import { useActionState, useState } from 'react'
import { slugify } from '@/domain/slug'
import { Button, Display, Mono } from '@/components/ui/primitives'
import { crearClienteAccion, type EstadoAlta } from './acciones'
import type { OrgDelUsuario } from '@/lib/datos/orgs'

const INICIAL: EstadoAlta = { status: 'inicial' }

/** Clases del design system, calcadas del importador. No hay primitiva de input. */
const CAMPO = 'border-line bg-bg text-fg type-mono w-full rounded-xs border p-2'

interface PilarBorrador {
  name: string
  color: string
  targetPct: number
}

/**
 * Un color de arranque distinto por pilar, para que el grid no nazca en negro.
 *
 * Se genera en runtime (HSL→hex) a propósito: los hex literales en el fuente
 * los prohíbe el guardián del design system (`tokens.test.ts`). El color de un
 * pilar es un dato del cliente, no de la marca del estudio — el usuario lo
 * ajusta, y se guarda como dato. Rota el matiz y mantiene saturación y luz
 * apagadas para que combine con la paleta editorial.
 */
function colorDePilar(indice: number): string {
  const h = (indice * 53) % 360
  return hslAHex(h, 38, 42)
}

function hslAHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const canal = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}

export function FormularioAlta({ orgs }: { orgs: OrgDelUsuario[] }) {
  const [estado, action, pendiente] = useActionState(crearClienteAccion, INICIAL)

  const [nombre, setNombre] = useState('')
  const [slug, setSlug] = useState('')
  const [pilares, setPilares] = useState<PilarBorrador[]>([])

  // Lo que verá la URL: el slug escrito a mano gana; si no, se deriva del nombre.
  const slugFinal = slug.trim() !== '' ? slugify(slug) : slugify(nombre)

  function agregarPilar() {
    setPilares((prev) => [...prev, { name: '', color: colorDePilar(prev.length), targetPct: 0 }])
  }

  function actualizarPilar(i: number, cambios: Partial<PilarBorrador>) {
    setPilares((prev) => prev.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  }

  function quitarPilar(i: number) {
    setPilares((prev) => prev.filter((_, j) => j !== i))
  }

  // Solo viajan los pilares con nombre: una fila en blanco no es un pilar.
  const pilaresLlenos = pilares.filter((p) => p.name.trim() !== '')

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-8">
      <input type="hidden" name="pilares" value={JSON.stringify(pilaresLlenos)} />

      {/* --- Datos del cliente ---------------------------------------------- */}
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <Mono className="text-fg-muted">Nombre</Mono>
          <input
            name="name"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={120}
            autoComplete="off"
            className={CAMPO}
            placeholder="Bar Ficticio"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Mono className="text-fg-muted">Slug (opcional)</Mono>
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            maxLength={120}
            autoComplete="off"
            className={CAMPO}
            placeholder={slugify(nombre) || 'se-deriva-del-nombre'}
          />
          <Mono className="text-fg-muted">URL: /cliente/{slugFinal || '…'}</Mono>
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Mono className="text-fg-muted">Redes (handle)</Mono>
            <input
              name="handle"
              maxLength={120}
              autoComplete="off"
              className={CAMPO}
              placeholder="@barficticio"
            />
          </label>

          <label className="flex min-w-40 flex-col gap-1.5">
            <Mono className="text-fg-muted">Nivel</Mono>
            <select name="tier" className={CAMPO} defaultValue="">
              <option value="">Sin nivel</option>
              <option value="premium">premium</option>
              <option value="estándar">estándar</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5">
            <Mono className="text-fg-muted">Color de marca</Mono>
            <input
              type="color"
              name="brandColor"
              defaultValue={hslAHex(8, 55, 40)}
              className="border-line h-10 w-20 cursor-pointer rounded-xs border bg-transparent p-1"
              aria-label="Color de marca del cliente"
            />
          </label>

          <label className="flex min-w-56 flex-1 flex-col gap-1.5">
            <Mono className="text-fg-muted">Zona horaria</Mono>
            <select name="timezone" className={CAMPO} defaultValue="America/Tijuana">
              <option value="America/Tijuana">America/Tijuana</option>
              <option value="America/Hermosillo">America/Hermosillo</option>
              <option value="America/Mexico_City">America/Mexico_City</option>
              <option value="America/Monterrey">America/Monterrey</option>
              <option value="America/Cancun">America/Cancun</option>
            </select>
          </label>
        </div>

        {orgs.length > 1 && (
          <label className="flex flex-col gap-1.5">
            <Mono className="text-fg-muted">Organización</Mono>
            <select name="orgId" className={CAMPO} defaultValue={orgs[0]?.id ?? ''}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* --- Pilares -------------------------------------------------------- */}
      <div className="border-line flex flex-col gap-4 border-t pt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Display as="h2" className="text-lg">
              Pilares
            </Display>
            <Mono className="text-fg-muted mt-1 block">
              Opcional. Los puedes agregar después desde la ficha del cliente.
            </Mono>
          </div>
          <Button type="button" variant="secondary" onClick={agregarPilar}>
            Agregar pilar
          </Button>
        </div>

        {pilares.length > 0 && (
          <ul className="flex flex-col gap-3">
            {pilares.map((p, i) => (
              <li key={i} className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-56 flex-1 flex-col gap-1.5">
                  <Mono className="text-fg-muted">Nombre del pilar</Mono>
                  <input
                    value={p.name}
                    onChange={(e) => actualizarPilar(i, { name: e.target.value })}
                    maxLength={80}
                    autoComplete="off"
                    className={CAMPO}
                    placeholder="Coctelería de autor"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <Mono className="text-fg-muted">Color</Mono>
                  <input
                    type="color"
                    value={p.color}
                    onChange={(e) => actualizarPilar(i, { color: e.target.value })}
                    className="border-line h-10 w-16 cursor-pointer rounded-xs border bg-transparent p-1"
                    aria-label={`Color del pilar ${i + 1}`}
                  />
                </label>
                <label className="flex w-24 flex-col gap-1.5">
                  <Mono className="text-fg-muted">Meta %</Mono>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p.targetPct}
                    onChange={(e) => actualizarPilar(i, { targetPct: Number(e.target.value) || 0 })}
                    className={CAMPO}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => quitarPilar(i)}
                  aria-label={`Quitar pilar ${i + 1}`}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* --- Error y envío -------------------------------------------------- */}
      {estado.status === 'error' && (
        <div
          className="bg-surface-2 border-l-[3px] px-4 py-3"
          style={{ borderLeftColor: 'var(--color-accent-hot)' }}
          role="status"
          aria-live="polite"
        >
          <p className="text-[13px]">{estado.mensaje}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" type="submit" disabled={pendiente || slugFinal === ''}>
          {pendiente ? 'Dando de alta…' : 'Dar de alta cliente'}
        </Button>
        <Mono className="text-fg-muted">
          Se crean sus 8 agentes apagados. Los enciendes uno por uno cuando quieras.
        </Mono>
      </div>
    </form>
  )
}
