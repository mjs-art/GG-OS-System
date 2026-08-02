import type { PieceFormat, PieceStatus, StoryKind } from '@/domain/labels'

/**
 * La lógica del Planner, sin React y sin IO.
 *
 * Vive aquí y no dentro del componente por una razón concreta: el drag & drop
 * es la interacción con más formas de fallar de toda la app (una pieza con
 * candado, un movimiento hacia arriba contra uno hacia abajo, el hueco que deja
 * la pieza que se movió) y ninguna de esas se puede probar bien a través del
 * DOM. Aquí se prueban con una tabla de casos.
 *
 * El modelo que hace que todo lo demás sea simple:
 *
 *   Las FECHAS no se mueven. Las PIEZAS se mueven entre fechas.
 *
 * El mes tiene una lista de slots — pares (publish_at, slot_index) — y una
 * lista de piezas que los ocupa. Arrastrar reordena las piezas; los slots se
 * quedan donde estaban y se vuelven a repartir por posición. Por eso el riel
 * de fechas de la derecha nunca se reordena al arrastrar: lo que cambia es
 * qué pieza cuelga de cada fecha.
 */

/* --- Orden del grid -------------------------------------------------------- */

/** Lo mínimo que necesita el reacomodo. Cualquier pieza completa lo satisface. */
export interface SlotPieza {
  id: string
  publishAt: string | null
  slotIndex: number
  dateLocked: boolean
}

/**
 * Orden del grid: descendente por fecha, la más nueva arriba a la izquierda.
 *
 * Las piezas sin fecha se van hasta abajo en vez de hasta arriba. Una pieza sin
 * fecha no es "la más futura": es trabajo pendiente, y arriba estorba.
 * El desempate por `slotIndex` mantiene el orden estable entre renders, que es
 * lo que evita que el grid brinque cuando dos piezas comparten día y hora.
 */
export function ordenarParaGrid<T extends SlotPieza>(piezas: readonly T[]): T[] {
  return [...piezas].sort((a, b) => {
    if (a.publishAt && b.publishAt) {
      if (a.publishAt !== b.publishAt) return a.publishAt < b.publishAt ? 1 : -1
      return b.slotIndex - a.slotIndex
    }
    if (a.publishAt) return -1
    if (b.publishAt) return 1
    return b.slotIndex - a.slotIndex
  })
}

/* --- Reacomodo ------------------------------------------------------------- */

export type ModoArrastre = 'intercambiar' | 'insertar'

/** Un renglón de UPDATE. Solo se emiten las piezas que de verdad cambiaron. */
export interface CambioSlot {
  id: string
  publishAt: string | null
  slotIndex: number
}

export type ResultadoReordenar =
  | { ok: true; cambios: CambioSlot[] }
  /** Una pieza amarrada bloquea el movimiento completo. Nada se mueve a medias. */
  | { ok: false; motivo: 'bloqueada'; piezaId: string; fecha: string | null }
  | { ok: false; motivo: 'sin-cambio' }
  | { ok: false; motivo: 'desconocida' }

export interface EntradaReordenar<T extends SlotPieza> {
  piezas: readonly T[]
  origenId: string
  destinoId: string
  modo: ModoArrastre
}

/**
 * Calcula los UPDATE que produce soltar `origenId` sobre `destinoId`.
 *
 * No muta nada y no habla con la base: devuelve la lista de cambios para que la
 * interfaz la aplique de forma optimista y el Server Action la mande en una
 * sola transacción. Si algo falla del otro lado, la interfaz tiene con qué
 * revertir porque conoce el estado anterior.
 */
export function reordenar<T extends SlotPieza>({
  piezas,
  origenId,
  destinoId,
  modo,
}: EntradaReordenar<T>): ResultadoReordenar {
  if (origenId === destinoId) return { ok: false, motivo: 'sin-cambio' }

  const orden = ordenarParaGrid(piezas)
  const desde = orden.findIndex((p) => p.id === origenId)
  const hasta = orden.findIndex((p) => p.id === destinoId)
  if (desde < 0 || hasta < 0) return { ok: false, motivo: 'desconocida' }

  // Los slots se quedan quietos; abajo se reparten al nuevo orden de piezas.
  const slots = orden.map((p) => ({ publishAt: p.publishAt, slotIndex: p.slotIndex }))

  const nuevo = [...orden]
  if (modo === 'intercambiar') {
    const a = nuevo[desde]
    const b = nuevo[hasta]
    if (!a || !b) return { ok: false, motivo: 'desconocida' }
    nuevo[desde] = b
    nuevo[hasta] = a
  } else {
    const [movida] = nuevo.splice(desde, 1)
    if (!movida) return { ok: false, motivo: 'desconocida' }
    nuevo.splice(hasta, 0, movida)
  }

  const cambios: CambioSlot[] = []
  for (let i = 0; i < nuevo.length; i++) {
    const pieza = nuevo[i]
    const slot = slots[i]
    if (!pieza || !slot) continue
    if (pieza.publishAt === slot.publishAt && pieza.slotIndex === slot.slotIndex) continue

    // El candado se revisa sobre las piezas que CAMBIAN, no solo sobre las dos
    // que tocó el cursor: en "insertar y correr" la pieza amarrada que estorba
    // suele estar tres lugares más abajo, y moverla sería exactamente lo que el
    // candado existe para impedir.
    if (pieza.dateLocked) {
      return { ok: false, motivo: 'bloqueada', piezaId: pieza.id, fecha: pieza.publishAt }
    }

    cambios.push({ id: pieza.id, publishAt: slot.publishAt, slotIndex: slot.slotIndex })
  }

  if (cambios.length === 0) return { ok: false, motivo: 'sin-cambio' }
  return { ok: true, cambios }
}

/** Aplica los cambios sobre la lista en memoria. Es la mitad optimista del guardado. */
export function aplicarCambios<T extends SlotPieza>(
  piezas: readonly T[],
  cambios: readonly CambioSlot[],
): T[] {
  const porId = new Map(cambios.map((c) => [c.id, c] as const))
  return piezas.map((p) => {
    const cambio = porId.get(p.id)
    return cambio ? { ...p, publishAt: cambio.publishAt, slotIndex: cambio.slotIndex } : p
  })
}

/* --- Balance de pilares ---------------------------------------------------- */

export interface PilarObjetivo {
  id: string
  name: string
  color: string
  targetPct: number
}

export interface SegmentoPilar {
  id: string
  nombre: string
  /** `null` para el segmento de piezas sin pilar: el color lo pone la interfaz. */
  color: string | null
  piezas: number
  realPct: number
  objetivoPct: number
  /** Real menos objetivo, en puntos porcentuales. Negativo = va corto. */
  desviacion: number
  /** Pasarse por más de diez puntos es lo que hace pulsar el segmento. */
  excedido: boolean
}

/** El umbral vive aquí y no en el componente: es una regla, no una decisión visual. */
export const UMBRAL_DESVIACION = 10

/**
 * Reparto real del mes contra el objetivo del Context Card.
 *
 * Las piezas sin pilar salen en su propio segmento en vez de repartirse o
 * ignorarse. Esconderlas haría que los porcentajes sumaran 100 mintiendo, y el
 * hueco real —piezas que nadie clasificó— es justo lo que hay que ver.
 */
export function balancePilares(
  piezas: readonly { pillarId: string | null }[],
  pilares: readonly PilarObjetivo[],
): SegmentoPilar[] {
  const total = piezas.length
  const conteo = new Map<string, number>()
  let sinPilar = 0

  for (const p of piezas) {
    if (!p.pillarId) {
      sinPilar++
      continue
    }
    conteo.set(p.pillarId, (conteo.get(p.pillarId) ?? 0) + 1)
  }

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

  const segmentos: SegmentoPilar[] = pilares.map((pilar) => {
    const n = conteo.get(pilar.id) ?? 0
    const realPct = pct(n)
    const desviacion = Math.round((realPct - pilar.targetPct) * 10) / 10
    return {
      id: pilar.id,
      nombre: pilar.name,
      color: pilar.color,
      piezas: n,
      realPct,
      objetivoPct: pilar.targetPct,
      desviacion,
      excedido: desviacion > UMBRAL_DESVIACION,
    }
  })

  if (sinPilar > 0) {
    const realPct = pct(sinPilar)
    segmentos.push({
      id: 'sin-pilar',
      nombre: 'Sin pilar',
      color: null,
      piezas: sinPilar,
      realPct,
      objetivoPct: 0,
      desviacion: realPct,
      excedido: realPct > UMBRAL_DESVIACION,
    })
  }

  return segmentos
}

/* --- Procedencia ----------------------------------------------------------- */

/**
 * ¿La pieza llegó hasta aquí sin que una persona la tocara?
 *
 * `authored_by` se vacía campo por campo conforme Ana edita, así que un objeto
 * vacío significa "ya pasó por mis manos" y uno con llaves significa "esto lo
 * escribió el pipeline". El punto del tile pinta esa diferencia: lleno = del
 * pipeline, hueco = intervenido.
 */
export function esDelPipeline(pieza: { authoredBy: Record<string, string> }): boolean {
  return Object.keys(pieza.authoredBy).length > 0
}

/** El agente que escribió un campo, o `null` si lo escribió una persona. */
export function agenteDelCampo(
  pieza: { authoredBy: Record<string, string> },
  campo: string,
): string | null {
  return pieza.authoredBy[campo] ?? null
}

/* --- Stories --------------------------------------------------------------- */

export interface ConteoStories {
  total: number
  porTipo: Record<StoryKind, number>
}

export function conteoStories(stories: readonly { kind: StoryKind }[]): ConteoStories {
  const porTipo: Record<StoryKind, number> = { diaria: 0, campana: 0, interactiva: 0 }
  for (const s of stories) porTipo[s.kind]++
  return { total: stories.length, porTipo }
}

/* --- Tabla ----------------------------------------------------------------- */

export type ColumnaTabla =
  'fecha' | 'formato' | 'pilar' | 'hook' | 'estado' | 'plataformas' | 'procedencia' | 'aprobacion'

export type Direccion = 'asc' | 'desc'

export interface FilaTabla {
  id: string
  fecha: string | null
  formato: PieceFormat
  pilar: string
  hook: string
  estado: PieceStatus
  ordenEstado: number
  plataformas: string[]
  procedencia: string
  aprobacion: string
}

/**
 * Ordena por una columna. El estado se ordena por su lugar en el pipeline y no
 * alfabéticamente: "aprobado" antes que "idea" no le dice nada a nadie.
 */
export function ordenarFilas(
  filas: readonly FilaTabla[],
  columna: ColumnaTabla,
  direccion: Direccion,
): FilaTabla[] {
  const signo = direccion === 'asc' ? 1 : -1

  const valor = (f: FilaTabla): string | number => {
    switch (columna) {
      case 'fecha':
        // Sin fecha se va al final en las dos direcciones: es trabajo pendiente,
        // no una fecha muy vieja ni una muy futura.
        return f.fecha ?? '￿'
      case 'formato':
        return f.formato
      case 'pilar':
        return f.pilar
      case 'hook':
        return f.hook
      case 'estado':
        return f.ordenEstado
      case 'plataformas':
        return f.plataformas.join(', ')
      case 'procedencia':
        return f.procedencia
      case 'aprobacion':
        return f.aprobacion
    }
  }

  return [...filas].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * signo
    return String(va).localeCompare(String(vb), 'es-MX') * signo
  })
}

/* --- CSV ------------------------------------------------------------------- */

/**
 * CSV con comillas dobles siempre y saltos CRLF.
 *
 * Citar todo en vez de solo lo que lo necesita no es pereza: los hooks traen
 * comas y comillas, y Excel en español interpreta un archivo mal citado como
 * una sola columna. Se paga con bytes de más una vez y se ahorra un reporte
 * roto cada mes.
 */
export function aCsv(
  encabezados: readonly string[],
  filas: readonly (readonly string[])[],
): string {
  const celda = (v: string) => `"${v.replaceAll('"', '""')}"`
  const renglon = (r: readonly string[]) => r.map(celda).join(',')
  return [renglon(encabezados), ...filas.map(renglon)].join('\r\n')
}
