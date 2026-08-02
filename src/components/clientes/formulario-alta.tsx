'use client'

import { Upload } from 'lucide-react'
import { useActionState, useCallback, useRef, useState } from 'react'
import { slugify } from '@/domain/slug'
import { Button, Display, Mono } from '@/components/ui/primitives'
import { crearClienteAccion, type EstadoAlta } from './acciones'
import type { OrgDelUsuario } from '@/lib/datos/orgs'
import { cn } from '@/lib/cn'
import { procesarNotionMd, type ResultadoParseoMd } from './procesar-md'

const INICIAL: EstadoAlta = { status: 'inicial' }

const CAMPO = 'border-line bg-bg text-fg type-mono w-full rounded-xs border p-2'

interface PilarBorrador {
  name: string
  color: string
  targetPct: number
}

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
  const [handle, setHandle] = useState('')
  const [brandColor, setBrandColor] = useState(hslAHex(8, 55, 40))
  const [pilares, setPilares] = useState<PilarBorrador[]>([])

  const slugFinal = slug.trim() !== '' ? slugify(slug) : slugify(nombre)

  // Datos de marca extraídos del .md de Notion. Se mandan como hidden.
  const [datosDeMarca, setDatosDeMarca] = useState<ResultadoParseoMd['datos'] | null>(null)

  function agregarPilar(name = '', color?: string) {
    setPilares((prev) => [
      ...prev,
      { name, color: color ?? colorDePilar(prev.length), targetPct: 0 },
    ])
  }

  function actualizarPilar(i: number, cambios: Partial<PilarBorrador>) {
    setPilares((prev) => prev.map((p, j) => (j === i ? { ...p, ...cambios } : p)))
  }

  function quitarPilar(i: number) {
    setPilares((prev) => prev.filter((_, j) => j !== i))
  }

  const pilaresLlenos = pilares.filter((p) => p.name.trim() !== '')

  // Drag & drop del .md de Notion
  const [arrastrando, setArrastrando] = useState(false)
  const [parseando, setParseando] = useState(false)
  const [errorParseo, setErrorParseo] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const procesarArchivo = useCallback(async (archivo: File) => {
    if (!archivo.name.endsWith('.md') && !archivo.name.endsWith('.txt')) {
      setErrorParseo('Solo se aceptan archivos .md exportados de Notion.')
      return
    }

    setParseando(true)
    setErrorParseo(null)

    try {
      const texto = await archivo.text()
      const formData = new FormData()
      formData.set('content', texto)

      const resultado = await procesarNotionMd({ status: 'error', message: '' }, formData)

      if (resultado.status === 'ok' && resultado.datos) {
        const d = resultado.datos
        if (d.nombre) {
          setNombre(d.nombre)
          setSlug('')
        }
        if (d.colorDeMarca) setBrandColor(d.colorDeMarca)

        // Pilares del MD: se agregan al final, con colores auto-generados
        if (d.pilares.length > 0) {
          setPilares((prev) => {
            const inicio = prev.filter((p) => p.name.trim() !== '').length
            return [
              ...prev,
              ...d.pilares.map((p, i) => ({
                name: p.nombre,
                color: colorDePilar(inicio + i),
                targetPct: 0,
              })),
            ]
          })
        }

        setDatosDeMarca(d)
        setErrorParseo(null)
      } else {
        setErrorParseo(resultado.message ?? 'No se pudo leer el archivo.')
      }
    } catch {
      setErrorParseo('No se pudo leer el archivo. ¿Está en formato .md?')
    } finally {
      setParseando(false)
    }
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) procesarArchivo(archivo)
  }

  const datosMarcaJson = datosDeMarca
    ? JSON.stringify({
        queEs: datosDeMarca.queEs ?? null,
        posicionamiento: null,
        diferenciadores: datosDeMarca.diferenciadores,
        audiencia: datosDeMarca.audiencia.join(', '),
        tono: datosDeMarca.tono,
        palabrasProhibidas: datosDeMarca.palabrasProhibidas,
        cadencia: null,
      })
    : ''

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-8">
      <input type="hidden" name="pilares" value={JSON.stringify(pilaresLlenos)} />
      <input type="hidden" name="datosDeMarca" value={datosMarcaJson} />

      {/* Drag & drop del .md de Notion */}
      <div
        className={cn(
          'border-line flex flex-col items-center gap-3 rounded-xs border border-dashed px-6 py-5 transition-colors',
          arrastrando && 'border-accent-hot bg-surface',
          parseando && 'opacity-60',
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        onClick={() => archivoRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') archivoRef.current?.click()
        }}
      >
        <Upload aria-hidden className="text-fg-muted size-5" />
        <div className="text-center">
          <p className="text-fg-muted text-[13px]">
            {parseando
              ? 'Leyendo el archivo…'
              : 'Arrastra el .md de Notion para llenar todo de un jalón'}
          </p>
          <p className="text-fg-muted mt-1 text-[12px] opacity-70">
            Nombre, color de marca, pilares, audiencia, tono y diferenciadores se llenan solos.
          </p>
        </div>
        <input
          ref={archivoRef}
          type="file"
          accept=".md,.txt"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0]
            if (archivo) procesarArchivo(archivo)
            if (archivoRef.current) archivoRef.current.value = ''
          }}
        />
      </div>

      {errorParseo && (
        <div
          className="bg-surface-2 border-l-[3px] px-4 py-3"
          style={{ borderLeftColor: 'var(--color-accent-hot)' }}
          role="status"
        >
          <p className="text-[13px]">{errorParseo}</p>
        </div>
      )}

      {datosDeMarca && !errorParseo && (
        <div
          className="bg-surface-2 border-l-[3px] px-4 py-3"
          style={{ borderLeftColor: 'var(--color-ok)' }}
        >
          <p className="text-[13px]">
            Leídos {datosDeMarca.pilares.length} pilares, {datosDeMarca.audiencia.length} públicos,
            color {datosDeMarca.colorDeMarca ?? 'sin color'}. Al dar de alta se crea también el
            Context Card.
          </p>
        </div>
      )}

      {/* Datos del cliente */}
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
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
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
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
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

      {/* Pilares */}
      <div className="border-line flex flex-col gap-4 border-t pt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Display as="h2" className="text-lg">
              Pilares
            </Display>
            <Mono className="text-fg-muted mt-1 block">
              {pilares.length > 0
                ? `${pilaresLlenos.length} ${pilaresLlenos.length === 1 ? 'pilar' : 'pilares'}`
                : 'Opcional. Los puedes agregar después desde la ficha del cliente.'}
            </Mono>
          </div>
          <Button type="button" variant="secondary" onClick={() => agregarPilar()}>
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
