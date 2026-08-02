'use client'

import { Link2, Trash2, Upload } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { Button, Chip, Mono } from '@/components/ui/primitives'
import { LabelCampo, SegmentedControl } from '@/components/planner/controles'
import type { Pieza } from '@/components/planner/tipos'
import {
  esEnlaceHttp,
  esTipoDeImagen,
  TAMANO_MAXIMO_BYTES,
  TIPOS_DE_IMAGEN,
} from '@/domain/planner'

/**
 * § Planner · La imagen de la pieza.
 *
 * Dos caminos, y los dos son legítimos: el material se sube a nuestro Storage
 * o vive en Canva, Drive o Dropbox y aquí solo se guarda la liga. Cuál de los
 * dos fue queda registrado (`asset_source`) porque cuando un tile salga roto,
 * lo primero que hay que saber es si el archivo era nuestro.
 *
 * La validación de tipo y de tamaño se hace aquí ADEMÁS de en el servidor. No
 * es redundancia por gusto: el bucket también los limita, pero su negativa
 * llega como un error de Storage en inglés después de haber subido veinte
 * megas. Atajarlo antes de mandar el archivo cuesta cuatro líneas.
 */

const MB = 1024 * 1024

/** `2.4 MB`, que es como se lee un peso de archivo. */
function peso(bytes: number): string {
  return `${(bytes / MB).toFixed(1).replace('.0', '')} MB`
}

export type ModoAsset = 'subir' | 'enlace'

export function CampoAsset({
  pieza,
  url,
  subiendo,
  onSubir,
  onEnlazar,
  onQuitar,
}: {
  pieza: Pieza
  /** Firmada por el servidor, o un `blob:` local mientras se sube. */
  url: string | null
  subiendo: boolean
  onSubir: (archivo: File) => void
  onEnlazar: (url: string) => void
  onQuitar: () => void
}) {
  const [modo, setModo] = useState<ModoAsset>(pieza.assetSource === 'enlace' ? 'enlace' : 'subir')
  const [enlace, setEnlace] = useState(pieza.assetSource === 'enlace' ? (pieza.assetUrl ?? '') : '')
  const [problema, setProblema] = useState<string | null>(null)
  const [rota, setRota] = useState(false)
  const archivoRef = useRef<HTMLInputElement>(null)

  // Igual que en el tile: una imagen nueva merece un intento nuevo. El cajón no
  // se desmonta al reemplazarla, así que sin esto un fallo se queda pegado.
  const [urlPintada, setUrlPintada] = useState(url)
  if (urlPintada !== url) {
    setUrlPintada(url)
    setRota(false)
  }

  const hayAsset = Boolean(pieza.assetUrl)

  function elegirArchivo(archivo: File | undefined) {
    if (!archivo) return

    if (!esTipoDeImagen(archivo.type)) {
      setProblema('Esa no es una imagen. El planner acepta JPG, PNG, WebP, AVIF y GIF.')
      return
    }
    if (archivo.size > TAMANO_MAXIMO_BYTES) {
      setProblema(
        `La imagen pesa ${peso(archivo.size)} y el tope son 20 MB. Exporta una versión más ligera.`,
      )
      return
    }

    setProblema(null)
    setRota(false)
    onSubir(archivo)
  }

  function mandarEnlace() {
    const limpio = enlace.trim()
    if (limpio === '') return
    if (!esEnlaceHttp(limpio)) {
      setProblema('El enlace tiene que empezar con http:// o https://. Copia la liga de compartir.')
      return
    }
    setProblema(null)
    setRota(false)
    onEnlazar(limpio)
  }

  return (
    <section>
      <LabelCampo>
        Imagen
        {hayAsset && (
          <Chip tone="neutral" className="ml-2">
            {pieza.assetSource === 'enlace' ? 'Enlace externo' : 'Subida al estudio'}
          </Chip>
        )}
      </LabelCampo>

      {/* --- Lo que hay hoy --------------------------------------------- */}
      <div className="border-line bg-bg relative mb-3 aspect-[4/3] w-full overflow-hidden rounded-xs border">
        {url && !rota ? (
          <Image
            src={url}
            alt={`Imagen de la pieza: ${pieza.hook ?? pieza.idea ?? 'sin hook'}`}
            fill
            sizes="480px"
            // Ver la nota en `tile-pieza.tsx`: una URL firmada cambia en cada
            // render y un enlace externo vive en un dominio que no conocemos.
            unoptimized
            onError={() => setRota(true)}
            className="object-contain"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
            <Mono className="text-fg-muted">
              {rota
                ? 'La imagen no cargó'
                : hayAsset
                  ? 'La imagen no está disponible'
                  : 'Todavía no hay imagen'}
            </Mono>
            <p className="text-fg-muted max-w-prose text-[12px]">
              {rota && pieza.assetSource === 'enlace'
                ? 'El enlace se cayó o dejó de ser público. Vuelve a compartirlo o sube el archivo.'
                : rota
                  ? 'El archivo ya no está en el bucket. Súbelo otra vez.'
                  : 'Sube el arte final o pega la liga de Canva, Drive o Dropbox. Es lo que se ve en el grid.'}
            </p>
          </div>
        )}

        {subiendo && (
          <div className="bg-bg/80 absolute inset-0 flex items-center justify-center">
            <Mono className="text-accent-hot">Subiendo…</Mono>
          </div>
        )}
      </div>

      {/* --- Cómo poner una nueva --------------------------------------- */}
      <SegmentedControl
        etiqueta="De dónde sale la imagen"
        valor={modo}
        onCambio={(v) => {
          setModo(v)
          setProblema(null)
        }}
        opciones={[
          { id: 'subir', label: 'Subir archivo' },
          { id: 'enlace', label: 'Pegar enlace' },
        ]}
        className="mb-2"
      />

      {modo === 'subir' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={archivoRef}
            type="file"
            accept={TIPOS_DE_IMAGEN.join(',')}
            className="sr-only"
            onChange={(e) => {
              elegirArchivo(e.target.files?.[0])
              // Sin esto, volver a elegir el MISMO archivo no dispara `change`
              // y parece que el botón dejó de servir.
              e.target.value = ''
            }}
            aria-label={
              hayAsset ? 'Reemplazar la imagen de la pieza' : 'Subir la imagen de la pieza'
            }
          />
          <Button variant="primary" disabled={subiendo} onClick={() => archivoRef.current?.click()}>
            <Upload aria-hidden className="size-3.5" />
            {hayAsset ? 'Reemplazar imagen' : 'Subir imagen'}
          </Button>
          <Mono className="text-fg-muted">JPG, PNG, WebP, AVIF o GIF · hasta 20 MB</Mono>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={enlace}
            placeholder="https://www.canva.com/design/…"
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                mandarEnlace()
              }
            }}
            className="border-line bg-bg text-fg min-w-0 flex-1 rounded-xs border px-3 py-2 text-[13px]"
            aria-label="Enlace a la imagen de la pieza"
          />
          <Button
            variant="primary"
            disabled={subiendo || enlace.trim() === ''}
            onClick={mandarEnlace}
          >
            <Link2 aria-hidden className="size-3.5" />
            Guardar enlace
          </Button>
        </div>
      )}

      {problema && <p className="text-accent-hot mt-2 text-[12px]">{problema}</p>}

      {hayAsset && (
        <div className="mt-2">
          <Button
            variant="ghost"
            disabled={subiendo}
            onClick={() => {
              setEnlace('')
              setRota(false)
              setProblema(null)
              onQuitar()
            }}
          >
            <Trash2 aria-hidden className="size-3.5" />
            Quitar imagen
          </Button>
          {pieza.assetSource === 'subido' && (
            <p className="text-fg-muted mt-1 text-[12px]">
              Al quitarla o reemplazarla, el archivo se borra del estudio. No hay papelera.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
