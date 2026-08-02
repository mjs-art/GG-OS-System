'use client'

import { Upload } from 'lucide-react'
import Link from 'next/link'
import { useActionState, useCallback, useMemo, useRef, useState } from 'react'
import { importarDesdeNotion, type EstadoImportacion } from '@/components/importar/acciones'
import { VistaPrevia } from '@/components/importar/vista-previa'
import { Button, Card, Display, EmptyState, Mono } from '@/components/ui/primitives'
import { construirPlanDeImportacion, resumenDelPlan } from '@/domain/importar-notion'
import type { ContextoDeImportacion } from '@/lib/datos/importar'
import { cn } from '@/lib/cn'

/**
 * Pegar → ver → empatar → confirmar. O arrastrar el archivo directo.
 *
 * La vista previa se calcula aquí, en el navegador, porque el mapeo es puro:
 * pegar 200 renglones y ver el resultado no debería costar un viaje al
 * servidor. Lo que se ve aquí es una cortesía; el Server Action recalcula el
 * plan desde el mismo texto antes de escribir, así que esta pantalla no puede
 * mentirle a la base.
 *
 * **Nada se escribe sin que la persona haya visto esto.** El botón de importar
 * ni siquiera existe hasta que hay un plan sin errores.
 */

const INICIAL: EstadoImportacion = { status: 'inicial' }

/** El valor del select cuando no se empata a nadie. No es un uuid a propósito. */
const SIN_RESPONSABLE = ''

export function Importador({ contexto }: { contexto: ContextoDeImportacion }) {
  const [texto, setTexto] = useState('')
  const [empates, setEmpates] = useState<Record<string, string>>({})
  const [estado, action, pendiente] = useActionState(importarDesdeNotion, INICIAL)

  // Drag & drop
  const [arrastrando, setArrastrando] = useState(false)
  const [leyendoArchivo, setLeyendoArchivo] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const plan = useMemo(
    () => (texto.trim() === '' ? null : construirPlanDeImportacion(texto)),
    [texto],
  )

  const mesesPoblados = plan?.meses.filter((mes) => (contexto.piezasPorMes[mes] ?? 0) > 0) ?? []

  const asignaciones = Object.fromEntries(
    Object.entries(empates).filter(([, id]) => id !== SIN_RESPONSABLE),
  )

  const procesarArchivo = useCallback(async (archivo: File) => {
    const nombre = archivo.name.toLowerCase()
    if (nombre.endsWith('.md')) {
      setErrorArchivo(
        'Este es el documento de marca (.md), no el calendario. Para importar la ficha de marca ve a Clientes → Nuevo cliente y arrastra el .md ahí.',
      )
      return
    }
    if (!nombre.endsWith('.csv') && !nombre.endsWith('.json')) {
      setErrorArchivo('Solo se aceptan archivos .csv o .json exportados de Notion.')
      return
    }
    setLeyendoArchivo(true)
    setErrorArchivo(null)
    try {
      const contenido = await archivo.text()
      setTexto(contenido)
    } catch {
      setErrorArchivo('No se pudo leer el archivo.')
    } finally {
      setLeyendoArchivo(false)
    }
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) procesarArchivo(archivo)
  }

  if (estado.status === 'importado') {
    return (
      <Card className="border-l-[3px]" style={{ borderLeftColor: 'var(--color-ok)' }}>
        <Display as="h2" className="text-lg">
          Importado
        </Display>
        <p className="mt-2 max-w-prose text-[13px]">{estado.mensaje}</p>
        <div className="mt-5">
          <Link href={`/cliente/${contexto.slug}#planner`}>
            <Button variant="primary" type="button">
              Ver el planner de {contexto.nombre}
            </Button>
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {/* --- 1. Pegar o arrastrar --------------------------------------------- */}
      <section>
        <Display as="h2" className="text-lg">
          1 · Pega o arrastra lo que exportaste
        </Display>
        <p className="text-fg-muted mt-1 max-w-prose text-[13px]">
          En Notion abre la base <span className="type-display-italic">Social Media / Podcast</span>
          , menú ··· → Exportar → CSV, y{' '}
          <strong className="text-fg font-normal">
            arrastra el archivo aquí o pégalo en el cuadro de abajo
          </strong>
          . También sirve el JSON. No hay conexión con Notion y no la va a haber: esto se hace una
          vez por cliente y después Studio OS es la fuente de verdad.
        </p>

        <div
          className={cn(
            'border-line mt-4 flex flex-col items-center gap-2 rounded-xs border border-dashed px-4 py-5 transition-colors',
            arrastrando && 'border-accent-hot bg-surface',
            leyendoArchivo && 'opacity-60',
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
          <Upload aria-hidden className="text-fg-muted size-4" />
          <p className="text-fg-muted text-[13px]">
            {leyendoArchivo
              ? 'Leyendo archivo…'
              : arrastrando
                ? 'Suelta el archivo aquí'
                : 'Arrastra el CSV o haz clic para buscarlo'}
          </p>
          <input
            ref={archivoRef}
            type="file"
            accept=".csv,.json"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0]
              if (archivo) procesarArchivo(archivo)
              if (archivoRef.current) archivoRef.current.value = ''
            }}
          />
        </div>

        {errorArchivo && (
          <div
            className="bg-surface-2 mt-3 border-l-[3px] px-4 py-3"
            style={{ borderLeftColor: 'var(--color-accent-hot)' }}
            role="status"
          >
            <p className="text-[13px]">{errorArchivo}</p>
          </div>
        )}

        <label htmlFor="texto" className="sr-only">
          CSV o JSON exportado de Notion
        </label>
        <textarea
          id="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder="También puedes pegar el contenido del CSV aquí."
          className="border-line bg-bg text-fg type-mono mt-3 w-full rounded-xs border p-3"
        />

        {plan && (
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
            <Mono className={plan.ok ? 'text-ok' : 'text-accent-hot'}>{resumenDelPlan(plan)}</Mono>
            <Button variant="ghost" type="button" onClick={() => setTexto('')}>
              Empezar de nuevo
            </Button>
          </div>
        )}
      </section>

      {plan === null && (
        <EmptyState
          title="Todavía no hay nada que revisar"
          body="Arrastra el CSV o pégalo arriba y aquí aparece qué se va a crear, qué renglones no se pudieron mapear y qué personas hay que empatar. Nada se escribe hasta que lo confirmes."
        />
      )}

      {/* --- 2. Ver ---------------------------------------------------------- */}
      {plan !== null && (
        <section>
          <Display as="h2" className="text-lg">
            2 · Revisa qué va a pasar
          </Display>
          <p className="text-fg-muted mt-1 mb-6 max-w-prose text-[13px]">
            Todavía no se ha escrito nada.
          </p>
          <VistaPrevia
            plan={plan}
            sprintsExistentes={contexto.sprints}
            piezasPorMes={contexto.piezasPorMes}
          />
        </section>
      )}

      {/* --- 3. Empatar personas ---------------------------------------------- */}
      {plan !== null && plan.personas.length > 0 && (
        <section>
          <Display as="h2" className="text-lg">
            3 · Di quién es quién
          </Display>
          <p className="text-fg-muted mt-1 max-w-prose text-[13px]">
            Notion exporta el nombre de la persona, no su cuenta, así que el empate no se puede
            adivinar: dos personas se pueden llamar igual y una cuenta puede tener otro nombre.
            Quien quede sin empatar se importa sin responsable y se lo asignas en el planner.
          </p>

          <ul className="mt-4 flex flex-col gap-3">
            {plan.personas.map((persona) => (
              <li key={persona} className="flex flex-wrap items-center gap-3">
                <span className="w-48 shrink-0 text-[13px]">{persona}</span>
                <Mono className="text-fg-muted">es</Mono>
                <select
                  aria-label={`Usuario del estudio para ${persona}`}
                  value={empates[persona] ?? SIN_RESPONSABLE}
                  onChange={(e) => setEmpates({ ...empates, [persona]: e.target.value })}
                  className="border-line bg-bg text-fg type-mono min-w-64 rounded-xs border p-2"
                >
                  <option value={SIN_RESPONSABLE}>Sin responsable</option>
                  {contexto.miembros.map((miembro) => (
                    <option key={miembro.userId} value={miembro.userId}>
                      {miembro.nombre}
                      {miembro.role === 'owner' ? ' · dueña' : ''}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>

          <Mono as="p" className="text-fg-muted mt-4 max-w-prose">
            De casi todo el equipo solo se conoce su identificador: el nombre vive en el esquema de
            auth, que la app no puede leer. Se arregla con una tabla de perfiles, que es otra
            migración.
          </Mono>
        </section>
      )}

      {/* --- 4. Confirmar ------------------------------------------------------ */}
      {plan !== null && (
        <form action={action} className="border-line flex flex-col gap-4 border-t pt-8">
          <input type="hidden" name="slug" value={contexto.slug} />
          <input type="hidden" name="texto" value={texto} />
          <input type="hidden" name="asignaciones" value={JSON.stringify(asignaciones)} />

          <Display as="h2" className="text-lg">
            4 · Confirma
          </Display>

          {mesesPoblados.length > 0 && (
            <label className="flex max-w-prose items-start gap-3 text-[13px]">
              <input
                type="checkbox"
                name="aceptaDuplicar"
                className="accent-accent-hot mt-0.5"
                disabled={!plan.ok}
              />
              <span>
                Ya hay piezas en {mesesPoblados.join(', ')}. Entiendo que esto agrega y no
                reemplaza, y que si ese mes ya se importó va a quedar duplicado.
              </span>
            </label>
          )}

          {estado.status === 'error' && (
            <div
              className="bg-surface-2 border-l-[3px] px-4 py-3"
              style={{ borderLeftColor: 'var(--color-accent-hot)' }}
              role="status"
              aria-live="polite"
            >
              <p className="text-[13px]">{estado.mensaje}</p>
              {estado.errores && estado.errores.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {estado.errores.slice(0, 15).map((error, i) => (
                    <li key={`${error.linea}-${i}`} className="flex gap-3">
                      <Mono className="text-accent-hot w-28 shrink-0">
                        {error.linea === null ? 'archivo' : `línea ${error.linea}`}
                      </Mono>
                      <span className="text-fg-muted text-[13px]">{error.mensaje}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" type="submit" disabled={!plan.ok || pendiente}>
              {pendiente
                ? 'Importando…'
                : `Importar ${plan.piezas.length + plan.stories.length} renglones`}
            </Button>
            {!plan.ok && (
              <Mono className="text-fg-muted">
                Arregla los renglones de arriba en Notion y vuelve a pegar el archivo.
              </Mono>
            )}
          </div>
        </form>
      )}
    </div>
  )
}
