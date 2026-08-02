import { AGENTS } from '@/agents/registry'
import { AGENT_LABEL, type AgentKey } from '@/domain/labels'

/**
 * Lo que la pantalla de un agente enseña además de sus números: su prompt de
 * sistema y sus disparadores.
 *
 * Este archivo **no redeclara la lista de los ocho**. Las llaves, la
 * descripción y los campos que cada uno puede escribir salen de
 * `@/agents/registry`, que es la fuente de verdad. Aquí solo vive lo que el
 * registro todavía no guarda.
 *
 * Va sin directiva `'use client'` a propósito: lo importan un Server Component
 * y —cuando haga falta— uno de cliente. Un `export const` dentro de un archivo
 * con `'use client'` le llega al servidor como referencia serializable en vez
 * de como valor, y eso truena en runtime sin que TypeScript diga nada.
 */

/* -------------------------------------------------------------------------- */
/*  Disparadores                                                               */
/* -------------------------------------------------------------------------- */

export interface Disparador {
  /** 'cron' corre solo; 'manual' lo aprieta una persona; 'evento' lo dispara un cambio. */
  tipo: 'cron' | 'manual' | 'evento'
  cuando: string
}

/**
 * Cuándo debería correr cada agente.
 *
 * Los de tipo `cron` **todavía no corren solos**: la cola de trabajos y el
 * calendario llegan con la etapa 11, junto con el proveedor real. Se muestran
 * igual porque son parte del contrato de operación del agente, y la pantalla
 * lo dice con todas sus letras en vez de fingir que ya están vivos.
 */
export const DISPARADORES: Record<AgentKey, readonly Disparador[]> = {
  estratega: [
    { tipo: 'manual', cuando: 'Al abrir el mes, desde Volumen del mes' },
    { tipo: 'evento', cuando: 'Cuando se captura una fecha clave de los próximos tres meses' },
  ],
  analista: [
    { tipo: 'cron', cuando: 'Día 3 de cada mes, con el mes anterior ya cerrado' },
    { tipo: 'cron', cuando: 'Día 15, en modo ligero: solo toca piezas que aún no salen' },
  ],
  guionista: [
    { tipo: 'manual', cuando: 'Sobre una tendencia del radar, por pieza de formato reel' },
    { tipo: 'evento', cuando: 'Cuando entra una tendencia nueva al radar y hay reels sin guion' },
  ],
  redactor: [
    { tipo: 'manual', cuando: 'Por pieza, desde el planner' },
    { tipo: 'evento', cuando: 'Cuando una pieza tiene idea y pilar pero todavía no tiene copy' },
  ],
  editor_marca: [
    { tipo: 'evento', cuando: 'Cuando una pieza pasa de escrito a revisado' },
    { tipo: 'manual', cuando: 'Por pieza, antes de mandarla al cliente' },
  ],
  pautero: [
    { tipo: 'manual', cuando: 'Al planear una campaña' },
    { tipo: 'cron', cuando: 'Diario mientras haya una campaña activa, en modo medir' },
    { tipo: 'evento', cuando: 'Cuando el costo por resultado se sale de rango, en modo ajustar' },
  ],
  auditor: [
    { tipo: 'cron', cuando: 'Semanal, lunes por la mañana' },
    { tipo: 'manual', cuando: 'Desde la sección Redes del cliente' },
  ],
  cuenta: [
    { tipo: 'manual', cuando: 'Al cerrar el mes, para la presentación' },
    { tipo: 'evento', cuando: 'Cuando un comentario del cliente lleva 48 horas sin tarea' },
    { tipo: 'evento', cuando: 'Cuando el cliente lleva tres días sin responder' },
  ],
}

export const DISPARADOR_LABEL: Record<Disparador['tipo'], string> = {
  cron: 'Calendario',
  manual: 'A mano',
  evento: 'Por evento',
}

/* -------------------------------------------------------------------------- */
/*  Prompt de sistema                                                          */
/* -------------------------------------------------------------------------- */

/**
 * El prompt de sistema, **derivado del contrato**.
 *
 * No está escrito a mano en ningún lado y esa es la idea: mientras el proveedor
 * sea el mock, el único prompt que no puede quedar desincronizado del código es
 * el que se genera a partir del registro. Cuando entre el proveedor real
 * (etapa 11), el prompt afinado vivirá con su versión y esta función pasa a ser
 * el valor inicial, no la verdad.
 *
 * Las cuatro reglas que trae adentro no son adorno de redacción: son las mismas
 * que la base y el runner hacen cumplir. Repetírselas al modelo no lo obliga a
 * nada —para eso están el schema y RLS—, pero sí evita que gaste una corrida
 * proponiendo algo que se va a rechazar.
 */
export function promptDeSistema(key: AgentKey): string {
  const contrato = AGENTS[key]
  const campos = contrato.writes

  const queEscribe =
    campos.length > 0
      ? `Solo puedes escribir estos campos de la pieza: ${campos.join(', ')}. Cualquier otro campo no te toca.`
      : 'No escribes ningún campo de la pieza. Tu entregable es un dictamen que una persona lee y decide.'

  return [
    `Eres el ${AGENT_LABEL[key]} de un estudio de social media en México.`,
    '',
    `TU TRABAJO`,
    `${contrato.description[0]?.toUpperCase() ?? ''}${contrato.description.slice(1)}.`,
    '',
    'REGLAS',
    '1. Propones, no ejecutas. Nada de lo que escribas se publica, se manda al cliente',
    '   ni mueve dinero. Una persona lo revisa y lo aprueba con su nombre y su hora.',
    `2. ${queEscribe}`,
    '3. Si no sabes, pregunta. Devuelve un escalamiento con la pregunta concreta y de',
    '   una a cinco opciones que tú mismo propongas. Escalar es correcto; inventar para',
    '   no escalar es lo caro.',
    '4. Tu salida se valida contra el schema del contrato. Una salida que no cumple se',
    '   registra como error y no se reintenta: no intentes arreglarla tú.',
    '',
    'CÓMO ESCRIBIR',
    '· Español de México, directo, sin jerga técnica y sin emojis decorativos.',
    '· Toda afirmación numérica lleva la métrica que la sostiene. Un número sin su razón',
    '  no se puede presentar a un cliente.',
    '· Lo que se puede verificar por código ya se verificó por código antes de llamarte:',
    '  conteo de hashtags, minúsculas y palabras prohibidas. No los vuelvas a discutir.',
    '',
    'CONTEXTO',
    'Abajo viene el Context Card del cliente con su versión. Todo lo que propongas sale',
    'de ahí; si el tema no está en el Context Card, escala en vez de suponerlo.',
  ].join('\n')
}
