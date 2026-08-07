import { fold } from '@/domain/brand-rules'

/**
 * La paleta de comandos: construir la lista de destinos y filtrarla al teclear.
 *
 * Lógica pura, sin React, por lo de siempre: el orden de los comandos y el
 * "¿esto hace match con lo que escribí?" son cosas que se ven triviales y se
 * rompen en el caso raro — el acento, la sección del cliente en el que estás,
 * la query de dos palabras. Se prueban con casos, no se depuran en vivo.
 *
 * El `fold` es el mismo del verificador de marca: teclear "resumen" encuentra
 * "Resumen" y teclear "grafico" encuentra "Gráfico", sin que cada pantalla
 * invente su propia forma de ignorar acentos.
 */

export type IconoComando =
  'bandeja' | 'clientes' | 'calendario' | 'agentes' | 'ajustes' | 'cliente' | 'seccion'

export interface Comando {
  /** Estable: la lista de React lo usa de key y no debe bailar entre renders. */
  id: string
  label: string
  /** Segunda línea: el contexto ("Cliente", "Sección · Dry Express"). */
  grupo: string
  /** A dónde lleva. Puede traer hash para caer en una sección. */
  href: string
  icono: IconoComando
}

export interface FuentePaleta {
  clientes: readonly { slug: string; name: string }[]
  /** El slug del cliente en cuya página estamos, o `null` fuera de una. */
  clienteActualSlug: string | null
  /** Su nombre, para etiquetar las secciones. `null` si no aplica. */
  clienteActualNombre: string | null
  /** Las secciones del dashboard (id + label), sin las privadas ya filtradas. */
  secciones: readonly { id: string; label: string }[]
}

/** Los cinco destinos fijos de la navegación, en el orden del sidebar. */
const DESTINOS: readonly Comando[] = [
  { id: 'ir-bandeja', label: 'Bandeja', grupo: 'Ir a', href: '/', icono: 'bandeja' },
  { id: 'ir-clientes', label: 'Clientes', grupo: 'Ir a', href: '/clientes', icono: 'clientes' },
  {
    id: 'ir-calendario',
    label: 'Calendario',
    grupo: 'Ir a',
    href: '/calendario',
    icono: 'calendario',
  },
  { id: 'ir-agentes', label: 'Agentes', grupo: 'Ir a', href: '/agentes', icono: 'agentes' },
  { id: 'ir-ajustes', label: 'Ajustes', grupo: 'Ir a', href: '/ajustes', icono: 'ajustes' },
]

/**
 * Arma la lista completa de comandos.
 *
 * Orden pensado para el trabajo, no alfabético: primero las secciones del
 * cliente en el que ya estás (es lo que más se salta), luego los destinos
 * fijos, y al final todos los clientes para brincar a otro.
 */
export function construirComandos(fuente: FuentePaleta): Comando[] {
  const comandos: Comando[] = []

  if (fuente.clienteActualSlug && fuente.clienteActualNombre) {
    for (const seccion of fuente.secciones) {
      comandos.push({
        id: `seccion-${seccion.id}`,
        label: seccion.label,
        grupo: `Sección · ${fuente.clienteActualNombre}`,
        href: `/cliente/${fuente.clienteActualSlug}#${seccion.id}`,
        icono: 'seccion',
      })
    }
  }

  comandos.push(...DESTINOS)

  for (const cliente of fuente.clientes) {
    comandos.push({
      id: `cliente-${cliente.slug}`,
      label: cliente.name,
      grupo: 'Cliente',
      href: `/cliente/${cliente.slug}`,
      icono: 'cliente',
    })
  }

  return comandos
}

/**
 * Filtra por lo que se escribió. Cada palabra de la query tiene que aparecer en
 * el label o el grupo del comando — así "dry planner" encuentra el Planner de
 * Dry Express aunque las dos palabras estén en campos distintos.
 *
 * Sin query devuelve la lista tal cual, recortada: la paleta recién abierta
 * muestra lo más útil sin que se escriba nada.
 */
export function filtrarComandos(
  comandos: readonly Comando[],
  query: string,
  limite = 8,
): Comando[] {
  const tokens = fold(query)
    .split(/\s+/)
    .filter((t) => t.length > 0)

  if (tokens.length === 0) return comandos.slice(0, limite)

  const conPuntaje = comandos
    .map((comando, orden) => {
      const label = fold(comando.label)
      const heno = `${label} ${fold(comando.grupo)}`
      const coincide = tokens.every((t) => heno.includes(t))
      if (!coincide) return null

      // Lo que empieza con la query va primero: teclear "cal" pone "Calendario"
      // arriba de un cliente que solo lo trae a la mitad del nombre.
      const empieza = label.startsWith(tokens[0] ?? '') ? 0 : 1
      return { comando, empieza, orden }
    })
    .filter((x): x is { comando: Comando; empieza: number; orden: number } => x !== null)

  return conPuntaje
    .sort((a, b) => a.empieza - b.empieza || a.orden - b.orden)
    .slice(0, limite)
    .map((x) => x.comando)
}
