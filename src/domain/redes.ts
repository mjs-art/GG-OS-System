/**
 * El semáforo de las cuentas de redes.
 *
 * Vive aquí y no dentro del componente porque es la única parte de § Redes que
 * tiene consecuencias: ese punto de color es lo que Ana mira para decidir a qué
 * cliente le dedica la mañana. Un color que se calcula distinto según quién lo
 * pinte no sirve para decidir nada, así que se calcula en un solo lugar y se
 * prueba.
 *
 * Tres señales:
 *   · días sin publicar — lo primero que ve cualquiera que abra el perfil
 *   · consistencia      — publicaciones por semana contra lo comprometido
 *   · perfil            — las cuatro casillas que se arreglan en diez minutos
 *
 * **Manda la peor, no el promedio.** Una cuenta impecable que lleva doce días
 * sin publicar está mal; promediar la dejaría en un ámbar tranquilizador y ese
 * es justo el caso que hay que ver desde la lista de clientes.
 */

/** Mismos tres valores que `StatusDot`, para que la primitiva los reciba tal cual. */
export type Semaforo = 'ok' | 'warn' | 'bad'

/**
 * Los cuatro renglones del checklist de perfil, en el orden en que se revisan.
 *
 * Las claves son las mismas que guarda `social_accounts.profile_checklist`, y
 * son cortas y sin acento porque son llaves de JSON en la base. La etiqueta que
 * se lee en pantalla vive aquí al lado para que nadie tenga que adivinarla.
 */
export const CHECKLIST_PERFIL = [
  { clave: 'bio', label: 'Bio completa' },
  { clave: 'link', label: 'Link activo' },
  { clave: 'highlights', label: 'Highlights ordenados' },
  { clave: 'foto', label: 'Foto de perfil actual' },
] as const

export type ClavePerfil = (typeof CHECKLIST_PERFIL)[number]['clave']

export type ChecklistPerfil = Record<ClavePerfil, boolean>

/* --- Los umbrales, en un solo lugar ---------------------------------------

   Están exportados porque la interfaz también los necesita: el renglón de
   "Última publicación" se pinta en accent-hot con el mismo número con el que
   el semáforo se va a ámbar. Si fueran dos constantes distintas, un día el
   texto diría "hace 4 días" en rojo con el punto en verde y nadie sabría cuál
   creer.                                                                    */

/** Más de tres días sin publicar ya se nota en el feed. */
export const DIAS_SIN_PUBLICAR_AMBAR = 3
/** Más de una semana es una cuenta que parece abandonada. */
export const DIAS_SIN_PUBLICAR_ROJO = 7

/** Debajo del 90% del objetivo semanal la cadencia empieza a resbalarse. */
export const CONSISTENCIA_AMBAR = 0.9
/** Debajo del 60% ya no se está cumpliendo el plan que se le vendió al cliente. */
export const CONSISTENCIA_ROJO = 0.6

/** Dos casillas de perfil abajo es descuido, no un pendiente. */
export const FALLAS_PERFIL_ROJO = 2

export interface EstadoRed {
  /** Días completos desde la última publicación. `null` = nunca publicó. */
  diasSinPublicar: number | null
  publicacionesPorSemana: number
  /** Objetivo comprometido. En 0 significa "sin objetivo", no "objetivo cero". */
  objetivoPorSemana: number
  checklist: ChecklistPerfil
}

export interface Veredicto {
  estado: Semaforo
  /**
   * Por qué está así, cada razón con qué hacer al respecto. En verde va vacío.
   * El punto de color solo no es accesible ni accionable: esto es lo que se le
   * pone de `label` al `StatusDot` y lo que se lee debajo de la tarjeta.
   */
  razones: string[]
}

const PESO: Record<Semaforo, number> = { ok: 0, warn: 1, bad: 2 }

/** De dos estados devuelve el más grave. */
export function peorEstado(a: Semaforo, b: Semaforo): Semaforo {
  return PESO[a] >= PESO[b] ? a : b
}

/**
 * Días completos desde la última publicación.
 *
 * Una fecha en el futuro devuelve 0 y no un negativo: pasa cuando alguien
 * captura mal el dato, y "hace -2 días" en pantalla es peor que "hoy".
 */
export function diasSinPublicar(lastPostAt: string | null, ahora: Date): number | null {
  if (!lastPostAt) return null
  const ultima = new Date(lastPostAt)
  if (Number.isNaN(ultima.getTime())) return null
  const dias = Math.floor((ahora.getTime() - ultima.getTime()) / 86_400_000)
  return dias < 0 ? 0 : dias
}

/**
 * Lee el checklist tal como viene de `profile_checklist`, que es jsonb libre.
 *
 * Una casilla ausente cuenta como **no cumplida**, y eso es deliberado: si el
 * Auditor todavía no revisó la bio, la bio no está lista. El default optimista
 * sería peor — pintaría de verde una cuenta que nadie ha visto.
 */
export function leerChecklist(valor: unknown): ChecklistPerfil {
  const fuente =
    typeof valor === 'object' && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}

  const salida = {} as ChecklistPerfil
  for (const { clave } of CHECKLIST_PERFIL) {
    salida[clave] = fuente[clave] === true
  }
  return salida
}

/** Las casillas que no pasan, en el orden del checklist. */
export function fallasDePerfil(checklist: ChecklistPerfil): ClavePerfil[] {
  return CHECKLIST_PERFIL.filter(({ clave }) => !checklist[clave]).map(({ clave }) => clave)
}

/** 4.5 se lee "4.5" y 5 se lee "5". `numeric(5,2)` llega con decimales siempre. */
function numero(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}

function evaluarPublicacion(dias: number | null): Veredicto {
  if (dias === null) {
    return {
      estado: 'bad',
      razones: [
        'No hay ni una publicación registrada en esta cuenta. Captura la fecha de la última o publica algo hoy.',
      ],
    }
  }
  if (dias > DIAS_SIN_PUBLICAR_ROJO) {
    return {
      estado: 'bad',
      razones: [
        `Lleva ${dias} días sin publicar. Sube algo hoy, aunque sea del banco de imágenes.`,
      ],
    }
  }
  if (dias > DIAS_SIN_PUBLICAR_AMBAR) {
    return { estado: 'warn', razones: [`Lleva ${dias} días sin publicar. Adelanta la del jueves.`] }
  }
  return { estado: 'ok', razones: [] }
}

function evaluarConsistencia(porSemana: number, objetivo: number): Veredicto {
  // Sin objetivo no hay incumplimiento. Un cliente al que nunca se le
  // comprometió una cadencia no puede salir en rojo por no cumplirla.
  if (objetivo <= 0) return { estado: 'ok', razones: [] }

  const razon = `Va en ${numero(porSemana)} publicaciones por semana contra un objetivo de ${numero(objetivo)}.`
  const ratio = porSemana / objetivo

  if (ratio < CONSISTENCIA_ROJO) {
    return { estado: 'bad', razones: [`${razon} Rehaz el plan del mes o baja el objetivo.`] }
  }
  if (ratio < CONSISTENCIA_AMBAR) {
    return { estado: 'warn', razones: [`${razon} Agrega una pieza a la semana para cerrar.`] }
  }
  return { estado: 'ok', razones: [] }
}

function evaluarPerfil(checklist: ChecklistPerfil): Veredicto {
  const fallas = fallasDePerfil(checklist)
  if (fallas.length === 0) return { estado: 'ok', razones: [] }

  const nombres = CHECKLIST_PERFIL.filter(({ clave }) => fallas.includes(clave))
    .map(({ label }) => label.toLowerCase())
    .join(', ')

  const razon = `El perfil trae ${fallas.length} ${fallas.length === 1 ? 'pendiente' : 'pendientes'}: ${nombres}.`

  return {
    estado: fallas.length >= FALLAS_PERFIL_ROJO ? 'bad' : 'warn',
    razones: [`${razon} Se arreglan en diez minutos desde la app.`],
  }
}

/**
 * El veredicto de una cuenta: el peor de los tres, con todas las razones que
 * haya, no solo la que definió el color.
 *
 * Las razones se acumulan aunque una sola haya mandado el color, porque quien
 * abre la tarjeta quiere arreglar la cuenta completa, no el síntoma que ganó.
 */
export function evaluarRed(estado: EstadoRed): Veredicto {
  const evaluaciones = [
    evaluarPublicacion(estado.diasSinPublicar),
    evaluarConsistencia(estado.publicacionesPorSemana, estado.objetivoPorSemana),
    evaluarPerfil(estado.checklist),
  ]

  return {
    estado: evaluaciones.reduce<Semaforo>((peor, e) => peorEstado(peor, e.estado), 'ok'),
    razones: evaluaciones.flatMap((e) => e.razones),
  }
}

/** Una frase para el `label` del punto, que sin texto no es accesible. */
export function etiquetaSemaforo(veredicto: Veredicto): string {
  if (veredicto.estado === 'ok') return 'Cuenta al día'
  const prefijo = veredicto.estado === 'bad' ? 'Cuenta en rojo' : 'Cuenta en ámbar'
  return `${prefijo}: ${veredicto.razones.join(' ')}`
}
