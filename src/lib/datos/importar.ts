import 'server-only'

import type { PiezaImportada, SprintDetectado, StoryImportada } from '@/domain/importar-notion'
import { listarEquipo, type MiembroDelEstudio } from '@/lib/datos/equipo'
import { listarSprints, type SprintPlanner } from '@/lib/datos/planner'
import { createClient } from '@/lib/supabase/server'

/**
 * Lecturas y escritura del importador de Notion.
 *
 * Como en el resto de `datos/`, nada filtra por org ni por cliente a mano: lo
 * hace RLS. Escribir el `where` aquí daría una falsa sensación de seguridad el
 * día que alguien escriba una consulta nueva sin él.
 *
 * El equipo y los sprints se leen con `listarEquipo` y `listarSprints`, que ya
 * existen para el planner. Una segunda copia de esas consultas es exactamente
 * cómo se termina con dos listas del mismo equipo que ordenan distinto.
 */

/* -------------------------------------------------------------------------- */
/*  Lo que la vista previa necesita saber de la base                           */
/* -------------------------------------------------------------------------- */

export interface ContextoDeImportacion {
  clientId: string
  orgId: string
  slug: string
  nombre: string
  miembros: MiembroDelEstudio[]
  sprints: SprintPlanner[]
  /** `2026-09` → cuántas piezas ya hay. Importar dos veces duplica el mes. */
  piezasPorMes: Record<string, number>
}

export async function contextoDeImportacion(slug: string): Promise<ContextoDeImportacion | null> {
  const supabase = await createClient()

  const { data: cliente, error } = await supabase
    .from('clients')
    .select('id, org_id, slug, name')
    .eq('slug', slug)
    .is('archived_at', null)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer el cliente: ${error.message}`)
  if (!cliente) return null

  const [miembros, sprints, piezasResp] = await Promise.all([
    listarEquipo(cliente.org_id),
    listarSprints(cliente.org_id),
    supabase.from('pieces').select('month').eq('client_id', cliente.id),
  ])

  if (piezasResp.error) {
    throw new Error(`No se pudieron leer las piezas: ${piezasResp.error.message}`)
  }

  const piezasPorMes: Record<string, number> = {}
  for (const { month } of piezasResp.data ?? []) {
    piezasPorMes[month] = (piezasPorMes[month] ?? 0) + 1
  }

  return {
    clientId: cliente.id,
    orgId: cliente.org_id,
    slug: cliente.slug,
    nombre: cliente.name,
    miembros,
    sprints,
    piezasPorMes,
  }
}

/* -------------------------------------------------------------------------- */
/*  La escritura                                                               */
/* -------------------------------------------------------------------------- */

export interface EntradaDeEscritura {
  clientId: string
  orgId: string
  piezas: readonly PiezaImportada[]
  stories: readonly StoryImportada[]
  sprints: readonly SprintDetectado[]
  /** Nombre de Notion → uuid. Lo que no esté aquí se importa sin responsable. */
  asignaciones: Readonly<Record<string, string>>
}

export interface ResultadoEscritura {
  sprintsCreados: number
  piezas: number
  stories: number
}

/**
 * Escribe la importación completa, o no escribe nada.
 *
 * **Por qué esto no es un `begin/commit`:** la API REST de Supabase no tiene
 * transacciones que crucen peticiones, y la forma correcta —una función de
 * Postgres— sería una migración, y las migraciones son de otro dueño en este
 * momento. Así que la atomicidad se construye con dos piezas:
 *
 *   1. **Una sola sentencia por tabla.** Los sprints entran en un `insert`, las
 *      piezas en otro y las stories en otro. En Postgres una sentencia es
 *      atómica: o entran las 200 piezas o no entra ninguna. Un `for` con 200
 *      inserts sí podría dejar el mes a la mitad, y un mes a medias no se
 *      distingue a simple vista de uno completo.
 *   2. **Compensación explícita.** Si la segunda o la tercera sentencia falla,
 *      se borra lo que ya había entrado, en orden inverso. Se guardan los ids
 *      devueltos justo para poder deshacerlo.
 *
 * El orden importa: los sprints van primero porque las piezas los referencian.
 *
 * Si la compensación misma fallara, se dice con nombre y apellido en el
 * mensaje. Callarlo dejaría al estudio creyendo que no se escribió nada.
 */
export async function escribirImportacion(
  entrada: EntradaDeEscritura,
): Promise<{ ok: true; resultado: ResultadoEscritura } | { ok: false; mensaje: string }> {
  const supabase = await createClient()
  const { clientId, orgId, piezas, stories, sprints, asignaciones } = entrada

  /* --- 1. Sprints: se reusan los que ya existen por nombre ---------------- */

  // `sprints` tiene `unique (org_id, name)`, así que crear uno que ya existe no
  // duplicaría: tronaría, y se llevaría la importación completa por delante.
  const yaExisten = await listarSprints(orgId)
  const idPorSprint = new Map<string, string>(yaExisten.map((s) => [s.name, s.id]))
  const porCrear = sprints.filter((s) => !idPorSprint.has(s.nombre))
  const idsDeSprintsCreados: string[] = []

  if (porCrear.length > 0) {
    const { data, error } = await supabase
      .from('sprints')
      .insert(
        porCrear.map((s) => ({
          org_id: orgId,
          name: s.nombre,
          starts_on: s.inicia,
          ends_on: s.termina,
        })),
      )
      .select('id, name')

    if (error) {
      return { ok: false, mensaje: `No se pudieron crear los sprints: ${error.message}` }
    }

    for (const sprint of data ?? []) {
      idPorSprint.set(sprint.name, sprint.id)
      idsDeSprintsCreados.push(sprint.id)
    }
  }

  /** Deshace lo escrito hasta ahora. Devuelve el mensaje ya listo para leerse. */
  const deshacer = async (motivo: string, piezasCreadas: string[]): Promise<string> => {
    const fallos: string[] = []

    if (piezasCreadas.length > 0) {
      const { error } = await supabase.from('pieces').delete().in('id', piezasCreadas)
      if (error) fallos.push(`${piezasCreadas.length} piezas`)
    }
    if (idsDeSprintsCreados.length > 0) {
      const { error } = await supabase.from('sprints').delete().in('id', idsDeSprintsCreados)
      if (error) fallos.push(`${idsDeSprintsCreados.length} sprints`)
    }

    if (fallos.length === 0) return `${motivo} No se importó nada.`
    return (
      `${motivo} Además, al deshacer quedaron ${fallos.join(' y ')} a medias en la base. ` +
      'Revísalo en el planner antes de volver a importar.'
    )
  }

  /* --- 2. Piezas: una sola sentencia --------------------------------------- */

  const idsDePiezas: string[] = []

  if (piezas.length > 0) {
    const { data, error } = await supabase
      .from('pieces')
      .insert(
        piezas.map((p) => ({
          org_id: orgId,
          client_id: clientId,
          month: p.mes,
          format: p.formato,
          status: p.estado,
          platforms: p.plataformas,
          publish_at: p.publishAt,
          due_date: p.dueDate,
          slot_index: p.slotIndex,
          // El texto de `Tarea` es la idea de la pieza, no el copy terminado.
          // Ponerlo en `hook` o en `copy_out` lo haría pasar por trabajo hecho.
          idea: p.tarea,
          assignee_id: (p.responsable !== null ? asignaciones[p.responsable] : undefined) ?? null,
          sprint_id: (p.sprint !== null ? idPorSprint.get(p.sprint) : undefined) ?? null,
        })),
      )
      .select('id')

    if (error) {
      return { ok: false, mensaje: await deshacer(mensajeDeFalla('las piezas', error), []) }
    }

    idsDePiezas.push(...(data ?? []).map((p) => p.id))
  }

  /* --- 3. Stories: una sola sentencia -------------------------------------- */

  if (stories.length > 0) {
    const { error } = await supabase.from('stories').insert(
      stories.map((s) => ({
        org_id: orgId,
        client_id: clientId,
        month: s.mes,
        scheduled_on: s.fecha,
        kind: s.tipo,
        status: s.estado,
        // `stories` no tiene título: el texto vive en la primera diapositiva,
        // que es la forma que ya documenta el esquema.
        slides:
          s.tipo === 'interactiva' ? [{ copy: s.tarea, sticker: 'encuesta' }] : [{ copy: s.tarea }],
      })),
    )

    if (error) {
      return {
        ok: false,
        mensaje: await deshacer(mensajeDeFalla('las stories', error), idsDePiezas),
      }
    }
  }

  return {
    ok: true,
    resultado: {
      sprintsCreados: idsDeSprintsCreados.length,
      piezas: piezas.length,
      stories: stories.length,
    },
  }
}

/** El error de Postgres, traducido a lo que de verdad hay que hacer. */
function mensajeDeFalla(que: string, error: { message: string }): string {
  const bruto = error.message

  if (/no es miembro de la organización/i.test(bruto)) {
    return 'Uno de los responsables que empataste no es del estudio. Revisa el empate de personas.'
  }
  if (/pieces_published_needs_date/i.test(bruto)) {
    return 'Una pieza marcada como publicada llegó sin fecha de publicación.'
  }
  if (/sprints_rango_valido/i.test(bruto)) {
    return 'Un sprint quedó con fecha de fin anterior a la de inicio.'
  }

  return `No se pudieron guardar ${que}: ${bruto}.`
}
