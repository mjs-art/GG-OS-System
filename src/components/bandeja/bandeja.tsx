'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { resolverEscalamiento } from '@/components/bandeja/acciones'
import { BarraAtajos } from '@/components/bandeja/barra-atajos'
import { TarjetaEscalamiento } from '@/components/bandeja/tarjeta-escalamiento'
import { Display, Mono } from '@/components/ui/primitives'
import {
  contarPorFiltro,
  estaEscribiendo,
  filtrarEscalamientos,
  FILTROS_BANDEJA,
  indiceTrasResolver,
  moverSeleccion,
  opcionPorAtajo,
  ordenarCola,
  resumenCola,
  SIN_SELECCION,
  type Escalamiento,
  type FiltroBandeja,
  type OpcionEscalamiento,
} from '@/domain/bandeja'
import { cn } from '@/lib/cn'

/**
 * BANDEJA — la cola de todo lo que necesita criterio humano, de todos los
 * clientes.
 *
 * Tres decisiones que valen la pena explicar:
 *
 * 1. **Resolver es optimista.** La tarjeta colapsa en cuanto se aprieta el
 *    botón, no cuando contesta el servidor. Vaciar la bandeja tiene que
 *    sentirse, y 300ms de espera por tarjeta matan esa sensación. Si el
 *    servidor rechaza, la tarjeta regresa y se dice por qué.
 * 2. **Los atajos se apagan mientras se escribe.** Sin eso, teclear "ajusta el
 *    hook" en el input de respuesta dispara aprobar, mover y posponer.
 * 3. **Lo pospuesto no se guarda.** No hay columna para eso todavía; posponer
 *    manda la tarjeta al final de la cola durante esta sesión y nada más. Es
 *    honesto: al recargar vuelve a su lugar por urgencia.
 */

/** Lo que dura el colapso. Va aquí y en la clase de transición de la tarjeta. */
const DURACION_COLAPSO_MS = 200

export interface BandejaProps {
  escalamientos: Escalamiento[]
  /** Para el estado vacío: "47 piezas avanzaron hoy sin ti." */
  piezasAvanzadasHoy: number
  /** ISO del reloj del servidor: el cliente no inventa fechas. */
  ahora: string
}

export function Bandeja({ escalamientos, piezasAvanzadasHoy, ahora }: BandejaProps) {
  const router = useRouter()

  const [filtro, setFiltro] = useState<FiltroBandeja>('todo')
  const [indice, setIndice] = useState(SIN_SELECCION)
  /** Colapsando: ya se resolvió, todavía se está animando. */
  const [saliendo, setSaliendo] = useState<ReadonlySet<string>>(new Set())
  /** Fuera de la lista. Se separa de `saliendo` para poder revertir. */
  const [ocultos, setOcultos] = useState<ReadonlySet<string>>(new Set())
  const [pospuestos, setPospuestos] = useState<readonly string[]>([])
  const [pendiente, setPendiente] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [, iniciarEnvio] = useTransition()

  const tarjetas = useRef(new Map<string, HTMLElement>())
  const navegadoConTeclado = useRef(false)

  const cola = useMemo(() => {
    const abiertos = ordenarCola(escalamientos.filter((e) => !ocultos.has(e.id)))
    // `sort` es estable, así que esto solo empuja lo pospuesto al final sin
    // revolver el orden por urgencia de todo lo demás.
    return abiertos.sort(
      (a, b) => Number(pospuestos.includes(a.id)) - Number(pospuestos.includes(b.id)),
    )
  }, [escalamientos, ocultos, pospuestos])

  const lista = useMemo(() => filtrarEscalamientos(cola, filtro), [cola, filtro])

  // Para los contadores, lo que se está colapsando ya cuenta como resuelto: el
  // número tiene que bajar junto con la tarjeta, no 200ms después.
  const contados = useMemo(() => cola.filter((e) => !saliendo.has(e.id)), [cola, saliendo])
  const conteos = useMemo(() => contarPorFiltro(contados), [contados])

  // El cursor se acomoda al RENDER y no en un efecto: cuando una tarjeta se
  // resuelve, la lista se acorta y el índice guardado puede quedar fuera de
  // rango por un render. Corregirlo con un setState dentro de un efecto
  // provoca un render en cascada y, peor, un parpadeo con la selección en el
  // lugar viejo. `indiceTrasResolver` deja el cursor sobre la que le seguía.
  const indiceActivo = indiceTrasResolver(indice, lista.length)

  const resolver = useCallback(
    (escalamiento: Escalamiento, opcion: OpcionEscalamiento | null, respuesta: string) => {
      if (pendiente) return
      setAviso(null)
      setPendiente(escalamiento.id)
      setSaliendo((previos) => new Set(previos).add(escalamiento.id))

      const quitarDeLaLista = window.setTimeout(() => {
        setOcultos((previos) => new Set(previos).add(escalamiento.id))
      }, DURACION_COLAPSO_MS)

      iniciarEnvio(async () => {
        const resultado = await resolverEscalamiento({
          escalamientoId: escalamiento.id,
          opcion: opcion?.label ?? null,
          respuesta: respuesta.length > 0 ? respuesta : null,
        })

        setPendiente(null)

        if (resultado.ok) {
          // El Server Action ya revalidó; esto trae la lista y el contador del
          // sidebar de vuelta a la verdad del servidor.
          router.refresh()
          return
        }

        // Rollback visible: la tarjeta regresa y se dice qué pasó.
        window.clearTimeout(quitarDeLaLista)
        setSaliendo((previos) => sinElemento(previos, escalamiento.id))
        setOcultos((previos) => sinElemento(previos, escalamiento.id))
        setAviso(resultado.mensaje)
      })
    },
    [pendiente, router],
  )

  const posponer = useCallback((escalamiento: Escalamiento) => {
    setPospuestos((previos) =>
      previos.includes(escalamiento.id) ? previos : [...previos, escalamiento.id],
    )
  }, [])

  const abrir = useCallback(
    (escalamiento: Escalamiento) => {
      if (escalamiento.pieza) router.push(escalamiento.pieza.href)
    },
    [router],
  )

  /* --- Atajos de teclado ------------------------------------------------- */
  useEffect(() => {
    function alTeclado(evento: KeyboardEvent) {
      // Los atajos de la app no compiten con los del navegador.
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return
      // Si el foco está escribiendo, los atajos no existen.
      if (estaEscribiendo(evento.target)) return

      const activa = lista[indiceActivo]
      const tecla = evento.key.toLowerCase()

      if (tecla === 'j' || tecla === 'k') {
        evento.preventDefault()
        navegadoConTeclado.current = true
        setIndice(moverSeleccion(indiceActivo, tecla === 'j' ? 1 : -1, lista.length))
        return
      }

      if (!activa) return

      if (tecla === 'a') {
        // Aprobar es tomar la PRIMERA opción que el agente propuso: la que él
        // considera la salida por default. Si no propuso ninguna, no hay nada
        // que aprobar y la tecla no hace nada.
        const primera = activa.opciones[0]
        if (primera) {
          evento.preventDefault()
          resolver(activa, primera, '')
        }
        return
      }

      if (tecla === 'e') {
        evento.preventDefault()
        abrir(activa)
        return
      }

      if (tecla === 's') {
        evento.preventDefault()
        posponer(activa)
        return
      }

      const opcion = opcionPorAtajo(activa.opciones, evento.key)
      if (opcion) {
        evento.preventDefault()
        resolver(activa, opcion, '')
      }
    }

    window.addEventListener('keydown', alTeclado)
    return () => window.removeEventListener('keydown', alTeclado)
  }, [lista, indiceActivo, resolver, posponer, abrir])

  // Mover con el teclado tiene que arrastrar el foco y el scroll. Solo cuando
  // fue el teclado: robarle el foco al mouse es de las cosas que más molestan.
  useEffect(() => {
    if (!navegadoConTeclado.current) return
    navegadoConTeclado.current = false

    const activa = lista[indiceActivo]
    if (!activa) return

    const elemento = tarjetas.current.get(activa.id)
    elemento?.scrollIntoView({ block: 'nearest' })
    elemento?.focus({ preventScroll: true })
  }, [indiceActivo, lista])

  const bandejaLimpia = contados.length === 0

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <header className="flex flex-col gap-2">
          <Display as="h1" className="text-5xl">
            Bandeja
          </Display>
          <Mono className="text-fg-muted" aria-live="polite">
            {resumenCola(contados)}
          </Mono>
        </header>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros de la bandeja">
          {FILTROS_BANDEJA.map(({ id, label }) => {
            const activo = filtro === id
            return (
              <button
                key={id}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltro(id)}
                className={cn(
                  'type-mono inline-flex items-center gap-2 rounded-xs border px-2.5 py-1.5',
                  'transition-colors duration-150 ease-out',
                  activo
                    ? 'border-accent bg-surface-2 text-fg'
                    : 'border-line text-fg-muted hover:text-fg',
                  !activo && conteos[id] === 0 && 'opacity-50',
                )}
              >
                {label}
                <span className={activo ? 'text-accent-hot' : 'text-fg-muted'}>{conteos[id]}</span>
              </button>
            )
          })}
        </div>

        {aviso && (
          <p
            role="status"
            className="border-critical text-fg bg-surface rounded-xs border-l-[3px] px-4 py-3 text-[13px]"
          >
            {aviso}
          </p>
        )}

        {bandejaLimpia ? (
          <BandejaLimpia piezasAvanzadasHoy={piezasAvanzadasHoy} />
        ) : lista.length === 0 ? (
          <div className="border-line flex flex-col items-start gap-3 rounded-xs border border-dashed p-8">
            <Display className="text-lg">Nada en este filtro</Display>
            <p className="text-fg-muted max-w-prose text-[13px]">
              Los {contados.length} escalamientos que quedan están en otras familias. Vuelve a
              &ldquo;Todo&rdquo; para verlos completos.
            </p>
            <button
              type="button"
              onClick={() => setFiltro('todo')}
              className="type-mono border-line text-fg hover:bg-surface-2 rounded-xs border px-3 py-2 transition-colors duration-150"
            >
              Ver todo
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {lista.map((escalamiento, posicion) => (
              <TarjetaEscalamiento
                key={escalamiento.id}
                ref={(elemento) => {
                  if (elemento) tarjetas.current.set(escalamiento.id, elemento)
                  else tarjetas.current.delete(escalamiento.id)
                }}
                escalamiento={escalamiento}
                activa={posicion === indiceActivo}
                saliendo={saliendo.has(escalamiento.id)}
                pendiente={pendiente === escalamiento.id}
                ahora={ahora}
                onSeleccionar={() => setIndice(posicion)}
                onResolver={(opcion, respuesta) => resolver(escalamiento, opcion, respuesta)}
                onPosponer={() => posponer(escalamiento)}
                onAbrir={() => abrir(escalamiento)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Con `exactOptionalPropertyTypes`, pasar `undefined` a una prop
          opcional no compila: la prop se omite o se pasa con valor. */}
      <BarraAtajos
        {...(pospuestos.length > 0 ? { nota: `${pospuestos.length} pospuestos` } : {})}
      />
    </div>
  )
}

/**
 * El estado vacío no es una disculpa: es el reporte de lo que pasó sin ti.
 * Por eso el titular es grande y la segunda línea trae un número.
 */
function BandejaLimpia({ piezasAvanzadasHoy }: { piezasAvanzadasHoy: number }) {
  return (
    <div className="flex flex-col items-start gap-4 py-16">
      <Display className="text-6xl">Bandeja limpia</Display>
      <Mono className="text-fg-muted">
        {piezasAvanzadasHoy > 0
          ? `Los agentes están trabajando. ${piezasAvanzadasHoy} ${
              piezasAvanzadasHoy === 1 ? 'pieza avanzó' : 'piezas avanzaron'
            } hoy sin ti.`
          : 'Los agentes están trabajando. Nada necesita tu criterio ahorita.'}
      </Mono>
    </div>
  )
}

function sinElemento(conjunto: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const copia = new Set(conjunto)
  copia.delete(id)
  return copia
}
