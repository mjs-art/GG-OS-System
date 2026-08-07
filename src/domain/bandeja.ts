import type { AgentKey, PieceFormat, RuleSeverity } from '@/domain/labels'

/**
 * La cola de la Bandeja: orden, filtros y navegación con teclado.
 *
 * Lógica pura, sin React y sin IO, por la misma razón que `calendario.ts`: el
 * orden de una cola y el comportamiento de `J/K` en los bordes son cosas que se
 * ven triviales y se rompen en el caso raro — la lista vacía, la última
 * tarjeta, el escalamiento que se resuelve mientras el cursor está encima.
 *
 * Premisa del módulo: **escalar es comportamiento correcto, no falla.** Un
 * agente que no sabe pregunta, y su pregunta entra a esta cola como trabajo
 * normal. Aquí no hay nada llamado "error" ni "alerta".
 */

/* -------------------------------------------------------------------------- */
/*  El dato                                                                    */
/* -------------------------------------------------------------------------- */

/** Una opción que el propio agente propone. Se pinta como botón hairline. */
export interface OpcionEscalamiento {
  key: string
  label: string
}

/** La pieza que disparó la duda, ya resuelta a lo que la tarjeta necesita. */
export interface PiezaDelEscalamiento {
  id: string
  formato: PieceFormat
  hook: string | null
  /** ISO de `publish_at`, o `null` si la pieza todavía no tiene fecha. */
  publishAt: string | null
  /** Color del pilar. Viene de la base como DATO, por eso es un string libre. */
  color: string
  /** A dónde lleva el atajo `E`. */
  href: string
}

export interface Escalamiento {
  id: string
  agente: AgentKey
  severidad: RuleSeverity
  pregunta: string
  opciones: OpcionEscalamiento[]
  /** ISO de `created_at`. La antigüedad es la mitad del criterio de orden. */
  creadoEn: string
  cliente: {
    id: string
    nombre: string
    slug: string
  }
  pieza: PiezaDelEscalamiento | null
}

/* -------------------------------------------------------------------------- */
/*  Orden de la cola                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Crítico primero, y dentro de cada severidad lo más viejo arriba.
 *
 * Lo viejo arriba y no lo nuevo: un escalamiento que lleva cuatro días parado
 * es el que está deteniendo una pieza. Ordenar por lo más reciente entierra
 * justo lo que más urge.
 */
const RANGO_SEVERIDAD: Record<RuleSeverity, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
}

export function ordenarCola<T extends Escalamiento>(escalamientos: readonly T[]): T[] {
  return [...escalamientos].sort((a, b) => {
    const porSeveridad = RANGO_SEVERIDAD[a.severidad] - RANGO_SEVERIDAD[b.severidad]
    if (porSeveridad !== 0) return porSeveridad

    const porAntiguedad = a.creadoEn.localeCompare(b.creadoEn)
    if (porAntiguedad !== 0) return porAntiguedad

    // Desempate por id: dos escalamientos del mismo segundo tienen que salir
    // siempre en el mismo orden, o la lista baila entre renders y el cursor
    // del teclado apunta a otra tarjeta sin que nadie la haya movido.
    return a.id.localeCompare(b.id)
  })
}

/* -------------------------------------------------------------------------- */
/*  Filtros                                                                    */
/* -------------------------------------------------------------------------- */

export const FILTROS_BANDEJA = [
  { id: 'todo', label: 'Todo' },
  { id: 'critico', label: 'Crítico' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'tema_nuevo', label: 'Tema nuevo' },
  { id: 'comentario_cliente', label: 'Comentario de cliente' },
  { id: 'pauta', label: 'Pauta' },
] as const

export type FiltroBandeja = (typeof FILTROS_BANDEJA)[number]['id']

/**
 * Qué agente cae en qué chip.
 *
 * Los chips son **atajos, no una partición**: `Crítico` corta por severidad y
 * se cruza con todos los demás, y el Estratega, el Analista y el Auditor no
 * tienen chip propio porque sus dudas no son de esas cinco familias — se ven
 * en `Todo`, que por eso es el filtro por default y nunca se esconde.
 *
 * El mapa vive aquí y no en el componente para que agregar un agente sea una
 * línea en un objeto tipado y no una cacería de `if`s por la interfaz.
 */
const AGENTES_POR_FILTRO: Partial<Record<FiltroBandeja, readonly AgentKey[]>> = {
  // El Editor de marca es el que verifica reglas del cliente: su duda siempre
  // es de cumplimiento.
  compliance: ['editor_marca'],
  // Redactor y Guionista escalan cuando el tema no está en el Context Card.
  tema_nuevo: ['redactor', 'guionista'],
  // El agente de Cuenta es el que traduce lo que dijo el cliente.
  comentario_cliente: ['cuenta'],
  pauta: ['pautero'],
}

export function coincideConFiltro(escalamiento: Escalamiento, filtro: FiltroBandeja): boolean {
  if (filtro === 'todo') return true
  if (filtro === 'critico') return escalamiento.severidad === 'critica'

  const agentes = AGENTES_POR_FILTRO[filtro]
  return agentes ? agentes.includes(escalamiento.agente) : false
}

export function filtrarEscalamientos<T extends Escalamiento>(
  escalamientos: readonly T[],
  filtro: FiltroBandeja,
): T[] {
  return escalamientos.filter((e) => coincideConFiltro(e, filtro))
}

/** Cuántos caben en cada chip. Un filtro que llega vacío se muestra atenuado. */
export function contarPorFiltro(
  escalamientos: readonly Escalamiento[],
): Record<FiltroBandeja, number> {
  const conteo = {} as Record<FiltroBandeja, number>
  for (const { id } of FILTROS_BANDEJA) {
    conteo[id] = escalamientos.filter((e) => coincideConFiltro(e, id)).length
  }
  return conteo
}

/** El renglón en mono del encabezado: "14 escalamientos · 6 críticos". */
export function resumenCola(escalamientos: readonly Escalamiento[]): string {
  const total = escalamientos.length
  const criticos = escalamientos.filter((e) => e.severidad === 'critica').length
  const palabra = total === 1 ? 'escalamiento' : 'escalamientos'
  const criticosPalabra = criticos === 1 ? 'crítico' : 'críticos'
  return `${total} ${palabra} · ${criticos} ${criticosPalabra}`
}

/* -------------------------------------------------------------------------- */
/*  Navegación con teclado                                                     */
/* -------------------------------------------------------------------------- */

/** No hay nada seleccionado. Lista vacía, o todo resuelto. */
export const SIN_SELECCION = -1

/**
 * `J` baja, `K` sube, y en los bordes se queda donde está.
 *
 * No da la vuelta a propósito: en una cola ordenada por urgencia, saltar de la
 * última a la primera se siente como que la app perdió el lugar. Y no se
 * atora: desde `SIN_SELECCION` cualquier tecla aterriza en la primera tarjeta,
 * que es lo que se espera al empezar a navegar con el teclado.
 */
export function moverSeleccion(indice: number, delta: number, total: number): number {
  if (total <= 0) return SIN_SELECCION
  if (indice < 0) return 0
  return Math.min(Math.max(indice + delta, 0), total - 1)
}

/**
 * Dónde queda el cursor después de que una tarjeta se resuelve.
 *
 * Se queda en el mismo índice —o sea, sobre la que le seguía— para poder
 * despachar la cola sin volver a tocar `J`. Si la resuelta era la última, sube
 * una. Si era la única, no queda nada que seleccionar.
 */
export function indiceTrasResolver(indice: number, totalRestante: number): number {
  if (totalRestante <= 0) return SIN_SELECCION
  return Math.min(Math.max(indice, 0), totalRestante - 1)
}

/**
 * Las teclas `1`, `2` y `3` eligen opción. Devuelve `null` cuando el agente
 * propuso menos opciones que el número que se tecleó: apretar `3` en una
 * tarjeta de dos botones no debe hacer nada, y sobre todo no debe resolver con
 * la última opción "porque es la que había".
 */
export function opcionPorAtajo(
  opciones: readonly OpcionEscalamiento[],
  tecla: string,
): OpcionEscalamiento | null {
  if (!/^[1-9]$/.test(tecla)) return null
  return opciones[Number(tecla) - 1] ?? null
}

/* -------------------------------------------------------------------------- */
/*  Lote: escalamientos que comparten causa                                    */
/* -------------------------------------------------------------------------- */

export interface GrupoEscalamiento {
  /** Estable entre renders: mismo agente + pregunta + opciones → misma clave. */
  clave: string
  agente: AgentKey
  pregunta: string
  opciones: OpcionEscalamiento[]
  /** Los escalamientos del grupo, en el orden en que venían en la cola. */
  escalamientos: Escalamiento[]
}

/**
 * El separador de la clave de causa. `` no aparece en texto de interfaz,
 * así que "a" + sep + "b" nunca colisiona con "a·b" escrito a mano.
 */
const SEP = ''

function claveDeCausa(e: Escalamiento): string {
  // Las opciones entran a la clave: dos preguntas iguales con botones distintos
  // NO se pueden cerrar con la misma respuesta, así que no son el mismo lote.
  const opciones = e.opciones.map((o) => o.key).join(SEP)
  return [e.agente, e.pregunta.trim(), opciones].join(SEP)
}

/**
 * Junta los escalamientos que hacen exactamente la misma pregunta.
 *
 * El Editor de marca escala la misma duda en cada pieza que la toca: veinte
 * tarjetas idénticas que hoy se responden una por una. Si el agente, la
 * pregunta y las opciones coinciden, la decisión es una sola y se aplica a
 * todas de un golpe. Eso es lo que "resolver en lote" quiere decir aquí — no
 * "seleccionar varias a mano", sino reconocer que el agente ya las agrupó al
 * preguntar lo mismo.
 *
 * Devuelve solo los grupos de dos o más: un grupo de uno es una tarjeta normal
 * y no necesita banner. El orden respeta el de la cola que entra, así que si se
 * le pasa la cola ya ordenada por urgencia, los lotes salen en ese mismo orden.
 */
export function agruparPorCausa(escalamientos: readonly Escalamiento[]): GrupoEscalamiento[] {
  const grupos = new Map<string, GrupoEscalamiento>()

  for (const e of escalamientos) {
    const clave = claveDeCausa(e)
    const grupo = grupos.get(clave)
    if (grupo) {
      grupo.escalamientos.push(e)
    } else {
      grupos.set(clave, {
        clave,
        agente: e.agente,
        pregunta: e.pregunta,
        opciones: e.opciones,
        escalamientos: [e],
      })
    }
  }

  return [...grupos.values()].filter((g) => g.escalamientos.length >= 2)
}

/** Los atajos que pinta la barra fija de abajo. Una sola fuente de verdad. */
export const ATAJOS_BANDEJA = [
  { teclas: 'J / K', que: 'mover' },
  { teclas: '1–3', que: 'elegir opción' },
  { teclas: 'A', que: 'aprobar' },
  { teclas: 'E', que: 'abrir' },
  { teclas: 'S', que: 'posponer' },
] as const

/**
 * Si el foco está escribiendo, los atajos no existen.
 *
 * Sin esto, teclear "ajusta el hook" en el input de respuesta dispara `A`
 * (aprobar), `J` (mover) y `S` (posponer) mientras la persona escribe. Es el
 * bug clásico de las interfaces con atajos de una sola tecla y se arregla en
 * el único lugar donde se puede probar.
 */
export function estaEscribiendo(target: EventTarget | null): boolean {
  if (target === null || typeof target !== 'object') return false

  // Se revisa por propiedades y no con `instanceof HTMLElement`: este módulo lo
  // importa también el servidor, donde `HTMLElement` no existe y el
  // `instanceof` sería un ReferenceError en cuanto alguien mueva la llamada.
  const elemento = target as Partial<HTMLElement>
  if (elemento.isContentEditable === true) return true

  const etiqueta = elemento.tagName
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT'
}
