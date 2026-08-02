import { ExternalLink, KeyRound } from 'lucide-react'
import { Card, Display, EmptyState, Mono } from '@/components/ui/primitives'
import type { Archivo } from '@/lib/datos/secciones'
import { etiquetaDeArchivo, KIND_ACCESOS, KIND_PALETA } from './etiquetas'

/**
 * § Archivos — logos, tipografías, paleta, links y banco de imágenes.
 *
 * La tarjeta de **Accesos** está separada del resto y solo lleva un link. No es
 * una decisión de diseño: es una regla dura del sistema, y la tabla la dice en
 * su propio comentario — "Solo links y metadatos. Las contraseñas viven en el
 * gestor del estudio, jamás aquí." Un campo de contraseña en esta pantalla
 * convertiría la base en un objetivo que hoy no lo es.
 */

/**
 * Saca las muestras de color de las notas de la tarjeta de paleta.
 *
 * Los colores del cliente son **dato**, no diseño: vienen de la base y entran
 * por `style`. Por eso están permitidos aquí y no rompen la prueba de tokens,
 * que mira el código fuente.
 */
function muestrasDeColor(notes: string | null): string[] {
  if (!notes) return []
  return notes.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
}

export function SeccionArchivos({ archivos }: { archivos: Archivo[] }) {
  const accesos = archivos.filter((a) => a.kind === KIND_ACCESOS)
  const resto = archivos.filter((a) => a.kind !== KIND_ACCESOS)

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Archivos
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            Todo lo que se necesita para producir una pieza sin pedírselo al cliente otra vez.
          </p>
        </div>
        <Mono className="text-fg-muted">
          {archivos.length} {archivos.length === 1 ? 'archivo' : 'archivos'}
        </Mono>
      </header>

      {resto.length === 0 && accesos.length === 0 ? (
        <EmptyState
          title="Sin archivos capturados"
          body="Empieza por los tres que siempre se piden a última hora: el logo en vectorial, la tipografía y el link al drive de fotos. Aquí solo van links; los archivos viven donde ya viven."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resto.map((a) => (
            <TarjetaArchivo key={a.id} archivo={a} />
          ))}
          <TarjetaAccesos acceso={accesos[0] ?? null} />
        </div>
      )}
    </>
  )
}

function TarjetaArchivo({ archivo }: { archivo: Archivo }) {
  const muestras = archivo.kind === KIND_PALETA ? muestrasDeColor(archivo.notes) : []

  return (
    <Card className="flex flex-col gap-3">
      <Mono className="text-fg-muted">{etiquetaDeArchivo(archivo.kind)}</Mono>
      <Display className="text-base leading-tight">{archivo.name}</Display>

      {muestras.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {muestras.map((color) => (
            <span key={color} className="flex flex-col items-center gap-1">
              <span
                aria-hidden
                className="border-line size-8 rounded-xs border"
                style={{ backgroundColor: color }}
              />
              <Mono className="text-fg-muted text-[9px] normal-case">{color}</Mono>
            </span>
          ))}
        </div>
      )}

      {archivo.notes && muestras.length === 0 && (
        <p className="text-fg-muted text-[13px]">{archivo.notes}</p>
      )}

      {archivo.url ? (
        <a
          href={archivo.url}
          target="_blank"
          rel="noreferrer noopener"
          className="type-mono text-fg-muted hover:text-accent-hot mt-auto inline-flex items-center gap-1.5 break-all"
        >
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          Abrir
        </a>
      ) : (
        <Mono className="text-fg-muted mt-auto opacity-70">Sin link todavía</Mono>
      )}
    </Card>
  )
}

/**
 * La tarjeta de Accesos existe aunque no haya nada capturado, porque su
 * mensaje también es parte del sistema: aquí no hay contraseñas y no las va a
 * haber. Si se ocultara cuando está vacía, la primera reacción de cualquiera
 * sería buscar dónde guardarlas.
 */
function TarjetaAccesos({ acceso }: { acceso: Archivo | null }) {
  return (
    <Card className="border-accent flex flex-col gap-3">
      <span className="flex items-center gap-2">
        <KeyRound aria-hidden className="text-accent-hot size-3.5" />
        <Mono className="text-accent-hot">Accesos</Mono>
      </span>

      <Display className="text-base leading-tight">
        {acceso?.name ?? 'Gestor de contraseñas'}
      </Display>

      {acceso?.url ? (
        <a
          href={acceso.url}
          target="_blank"
          rel="noreferrer noopener"
          className="type-mono text-fg-muted hover:text-accent-hot inline-flex items-center gap-1.5 break-all"
        >
          <ExternalLink aria-hidden className="size-3 shrink-0" />
          Abrir el gestor
        </a>
      ) : (
        <Mono className="text-fg-muted opacity-70">
          Falta el link a la bóveda de este cliente. Pégalo aquí y se acaba el peregrinaje de
          preguntar quién tiene el acceso.
        </Mono>
      )}

      <p className="text-fg-muted mt-auto max-w-prose text-[13px]">
        Las contraseñas viven en tu gestor, no aquí. Esta app guarda el link y nada más.
      </p>
    </Card>
  )
}
