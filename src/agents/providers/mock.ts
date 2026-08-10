import type { AgentKey } from '@/agents/contracts'
import { contractFor, type AgentInput } from '@/agents/registry'
import type { AgentProvider, ProviderRequest, ProviderResult } from '@/agents/runner'
import { parseMonthKey, type Clock, type MonthKey } from '@/lib/time'

/**
 * Proveedor falso. Cero red, cero azar, cero `Date.now()`.
 *
 * Existe por tres razones concretas:
 *   · Con `AGENTS_PROVIDER=mock` la app completa se puede recorrer sin gastar
 *     un centavo ni tener llave de Anthropic.
 *   · Es el único proveedor que se puede usar en pruebas y en CI.
 *   · Obliga a que los contratos aguanten datos realistas antes de escribir un
 *     solo prompt. Si un schema no se puede llenar con un caso real, el schema
 *     está mal, y sale más barato descubrirlo aquí.
 *
 * El cliente ficticio es Tower Bar: coctelería de autor y jazz en Tijuana.
 * Mismo input → mismo output, siempre.
 */

/** Ids estables y con forma de UUID v4 válido, para que `z.uuid()` los acepte. */
function fakeId(n: number): string {
  return `b1c1d1e1-0001-4001-8001-${String(n).padStart(12, '0')}`
}

const CLIENT_ID = fakeId(1)
const TREND_ID = fakeId(2)
const PIECES = [fakeId(101), fakeId(102), fakeId(103), fakeId(104), fakeId(105)] as const
const AD_SETS = [fakeId(201), fakeId(202)] as const
const RULES = [fakeId(301), fakeId(302), fakeId(303)] as const

const MONTH: MonthKey = parseMonthKey('2026-09')
const CONTEXT_VERSION = 7

const PILARES = ['Coctelería de autor', 'Ambiente y música', 'Detrás de la barra'] as const

const base = { client_id: CLIENT_ID, month: MONTH, context_version: CONTEXT_VERSION }

/* -------------------------------------------------------------------------- */
/*  Entradas de ejemplo                                                        */
/*                                                                             */
/*  Se exportan porque las pruebas y el modo demo necesitan una entrada válida */
/*  por agente, y tenerla en un solo lugar evita que se desincronicen del      */
/*  contrato sin que nada truene.                                              */
/* -------------------------------------------------------------------------- */

export const TOWER_BAR_INPUTS: { [K in AgentKey]: AgentInput<K> } = {
  estratega: {
    ...base,
    tier: 'Completo',
    capacity_declared: 70,
    format_performance: [
      {
        format: 'post',
        pieces: 9,
        avg_reach: 1240,
        avg_saves: 21,
        avg_engagement_pct: 3.1,
        avg_non_follower_reach: 310,
      },
      {
        format: 'carrusel',
        pieces: 3,
        avg_reach: 2180,
        avg_saves: 94,
        avg_engagement_pct: 5.4,
        avg_non_follower_reach: 780,
      },
      {
        format: 'reel',
        pieces: 8,
        avg_reach: 3890,
        avg_saves: 46,
        avg_engagement_pct: 4.8,
        avg_non_follower_reach: 2410,
      },
    ],
    pillar_performance: [
      { pillar: PILARES[0], target_pct: 40, actual_pct: 44, avg_reach: 2600 },
      { pillar: PILARES[1], target_pct: 35, actual_pct: 31, avg_reach: 3100 },
      { pillar: PILARES[2], target_pct: 25, actual_pct: 25, avg_reach: 1900 },
    ],
    previous_counts: {
      feed: { post: 9, carrusel: 3, reel: 8 },
      stories: { diaria: 26, campana: 8, interactiva: 4 },
    },
    key_dates: [
      {
        month: MONTH,
        title: 'Noche de Jazz',
        kind: 'evento',
        starts_on: '2026-09-12',
        ends_on: '2026-09-14',
        notes: 'Trío invitado de San Diego. Tercer año consecutivo.',
      },
      {
        month: parseMonthKey('2026-11'),
        title: 'Aniversario Tower Bar',
        kind: 'evento',
        starts_on: '2026-11-07',
        ends_on: null,
        notes: null,
      },
    ],
    planned_ad_budget_cents: 200_000,
  },

  analista: {
    ...base,
    mode: 'mitad_de_mes',
    piece_performance: [
      {
        piece_id: PIECES[0],
        format: 'reel',
        pillar: PILARES[1],
        published_at: '2026-09-04T02:00:00.000Z',
        hook: 'la barra a las 6 pm no se parece a la de las 9:40',
        reach: 5120,
        saves: 88,
        shares: 61,
        engagement_pct: 6.2,
        retention_3s_pct: 71,
      },
      {
        piece_id: PIECES[1],
        format: 'carrusel',
        pillar: PILARES[0],
        published_at: '2026-09-06T02:00:00.000Z',
        hook: 'tres cócteles que solo existen aquí',
        reach: 2340,
        saves: 94,
        shares: 12,
        engagement_pct: 5.5,
        retention_3s_pct: null,
      },
      {
        piece_id: PIECES[2],
        format: 'post',
        pillar: PILARES[0],
        published_at: '2026-09-08T16:00:00.000Z',
        hook: '¿sabías que el mezcal ahumado cambia con el hielo?',
        reach: 760,
        saves: 9,
        shares: 2,
        engagement_pct: 2.1,
        retention_3s_pct: null,
      },
    ],
    monthly_totals: {
      reach: 41_200,
      impressions: 68_900,
      saves: 412,
      shares: 188,
      profile_visits: 1340,
      link_clicks: 216,
      new_followers: 187,
    },
    unpublished_pieces: [
      {
        piece_id: PIECES[3],
        scheduled_on: '2026-09-18',
        format: 'post',
        pillar: PILARES[0],
        hook: 'el negroni de la casa lleva 14 días de reposo',
        status: 'escrito',
      },
      {
        piece_id: PIECES[4],
        scheduled_on: '2026-09-22',
        format: 'reel',
        pillar: PILARES[2],
        hook: '¿sabías que el hielo se talla a mano?',
        status: 'revisado',
      },
    ],
    month_goal: 'Reservas para Noche de Jazz',
  },

  guionista: {
    ...base,
    piece_id: PIECES[0],
    pillar: PILARES[1],
    scheduled_on: '2026-09-14',
    trend: {
      trend_id: TREND_ID,
      platform: 'instagram',
      kind: 'formato',
      title: 'Transición de barra vacía a barra llena al beat',
      audio_url: 'https://www.instagram.com/reels/audio/1029384756',
      reference_url: 'https://www.instagram.com/reel/CxAbCdEfGhI',
      momentum: 'subiendo',
      spotted_at: '2026-09-01',
      notes: 'Nueve días en subida. Funciona en bares y cafés de especialidad.',
    },
    brand_constraints: [
      'Sin caras al frente: el cliente no quiere salir en cámara',
      'Nada de precios en pantalla',
    ],
    available_gear: ['Tripié', 'iPhone 15 Pro', 'Luz de barra existente'],
    max_duration_s: 20,
  },

  redactor: {
    ...base,
    piece_id: PIECES[1],
    format: 'carrusel',
    platforms: ['instagram', 'facebook'],
    pillar: PILARES[0],
    idea: 'Tres cócteles de autor que solo existen en Tower Bar, con su historia',
    caption_rules: {
      lowercase_only: true,
      hashtag_count: 5,
      max_length: 900,
      banned_words: ['antro', 'barato', 'promoción loca'],
      emojis_allowed: false,
    },
    tone: ['cálido', 'sin adjetivos vacíos', 'de barra, no de folleto'],
    approved_examples: [
      'la barra abre a las 6. el jazz entra a las 9. tú decides a qué hora llegas.',
    ],
  },

  editor_marca: {
    ...base,
    piece_id: PIECES[1],
    piece: {
      format: 'carrusel',
      platforms: ['instagram'],
      hook: 'tres cócteles que solo existen aquí',
      copy_in: 'uno por cada hora de la noche',
      copy_out: 'la carta de autor cambia cada temporada. estos tres se quedan.',
      cta: 'reserva por el link de la bio',
      hashtags: ['#coctelería', '#tijuana', '#jazz', '#towerbar', '#mixología', '#nochedejazz'],
    },
    rules: [
      {
        rule_id: RULES[0],
        kind: 'hashtags',
        rule: 'Exactamente 5 hashtags por publicación.',
        severity: 'alta',
        check_by: 'codigo',
        params: { exact: 5 },
      },
      {
        rule_id: RULES[1],
        kind: 'formato',
        rule: 'Todo el caption va en minúsculas.',
        severity: 'media',
        check_by: 'codigo',
        params: { lowercase: true },
      },
      {
        rule_id: RULES[2],
        kind: 'voz',
        rule: 'Nunca llamarle "antro" al lugar.',
        severity: 'critica',
        check_by: 'codigo',
        params: { banned: ['antro'] },
      },
    ],
  },

  pautero: {
    ...base,
    mode: 'ajustar',
    campaign: {
      campaign_id: fakeId(401),
      name: 'Noche de Jazz',
      objective: 'Tráfico a reservas',
      platform: 'instagram',
      budget_cents: 200_000,
      start_date: '2026-09-08',
      end_date: '2026-09-14',
    },
    ad_sets: [
      {
        ad_set_id: AD_SETS[0],
        name: 'A · Interés — jazz, coctelería, vida nocturna',
        budget_cents: 100_000,
        spent_cents: 57_000,
        impressions: 41_300,
        clicks: 980,
        ctr_pct: 2.4,
        cpm_cents: 138,
        cpc_cents: 58,
        results: 18,
        cost_per_result_cents: 3100,
      },
      {
        ad_set_id: AD_SETS[1],
        name: 'B · Similares 1% de visitantes web',
        budget_cents: 100_000,
        spent_cents: 44_000,
        impressions: 29_800,
        clicks: 410,
        ctr_pct: 1.4,
        cpm_cents: 147,
        cpc_cents: 107,
        results: 5,
        cost_per_result_cents: 8400,
      },
    ],
    candidate_piece_ids: [PIECES[0], PIECES[1]],
    day_of_campaign: 4,
    total_days: 7,
    history: [
      {
        name: 'Aniversario 2025',
        objective: 'Tráfico a reservas',
        spent_cents: 150_000,
        results: 34,
        cost_per_result_cents: 4400,
      },
    ],
  },

  auditor: {
    ...base,
    accounts: [
      {
        platform: 'instagram',
        handle: '@towerbar.tj',
        url: 'https://www.instagram.com/towerbar.tj',
        followers: 14_820,
        followers_delta_30d: 187,
        last_post_at: '2026-09-08T16:00:00.000Z',
        posts_per_week: 3.5,
        target_posts_per_week: 4,
        profile_checklist: { bio: true, link: true, highlights: false, photo: true },
        unanswered_dms: 12,
        unanswered_comments: 31,
      },
      {
        platform: 'facebook',
        handle: 'Tower Bar Tijuana',
        url: 'https://www.facebook.com/towerbartj',
        followers: 6210,
        followers_delta_30d: -14,
        last_post_at: '2026-08-27T18:00:00.000Z',
        posts_per_week: 0.5,
        target_posts_per_week: 2,
        profile_checklist: { bio: true, link: false, highlights: false, photo: true },
        unanswered_dms: 4,
        unanswered_comments: 2,
      },
    ],
    checked_at: '2026-09-10T17:00:00.000Z',
  },

  cuenta: {
    ...base,
    task: 'presentacion_mensual',
    client_name: 'Tower Bar',
    pieces_total: 22,
    pieces_approved: 14,
    pending_approvals: [
      { piece_id: PIECES[3], scheduled_on: '2026-09-18', status: 'con_cliente', days_waiting: 6 },
      { piece_id: PIECES[4], scheduled_on: '2026-09-22', status: 'revisado', days_waiting: 2 },
    ],
    client_comments: [
      {
        piece_id: PIECES[3],
        body: 'El negroni no lleva 14 días, lleva 21. Y no digan "clásico reinventado".',
        created_at: '2026-09-09T21:30:00.000Z',
      },
    ],
    previous_month_headline: 'Agosto cerró con 38,400 de alcance y 142 seguidores nuevos.',
    last_client_response_days_ago: 6,
  },

  investigador: {
    client_id: CLIENT_ID,
    youtube_url: 'https://www.youtube.com/watch?v=towerbar-detras-de-barra',
    video_title: 'Cómo grabar contenido de bar sin mostrar la cara del staff',
    transcript:
      'En este video hablamos de cómo grabar contenido de bartenders sin mostrar la cara del ' +
      'equipo, usando planos de manos y de la barra. También explicamos por qué la música en ' +
      'vivo sostiene la retención en los primeros tres segundos de un reel.',
  },
}

/* -------------------------------------------------------------------------- */
/*  Salidas                                                                    */
/* -------------------------------------------------------------------------- */

type MockBuilder<K extends AgentKey> = (input: AgentInput<K>, clock: Clock) => unknown

const DAY_MS = 86_400_000

function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / DAY_MS)
}

const BUILDERS: { [K in AgentKey]: MockBuilder<K> } = {
  estratega: (input) => {
    const feed = { post: 6, carrusel: 6, reel: 10 }
    const stories = { diaria: 30, campana: 12, interactiva: 4 }
    const total = Object.values(feed).reduce((a, b) => a + b, 0) + 46

    return {
      kind: 'resultado',
      data: {
        month: input.month,
        total_pieces: total,
        feed: {
          post: {
            count: feed.post,
            previous_count: input.previous_counts.feed.post,
            reason: 'El formato con menor alcance del trimestre.',
            metric: 'alcance promedio 1,240 contra 3,890 del reel',
          },
          carrusel: {
            count: feed.carrusel,
            previous_count: input.previous_counts.feed.carrusel,
            reason: 'Es el formato que más se guarda.',
            metric: '94 guardados promedio contra 21 del post simple',
          },
          reel: {
            count: feed.reel,
            previous_count: input.previous_counts.feed.reel,
            reason: 'Mejor alcance en no seguidores del trimestre.',
            metric: '8 de 8 reels superaron el promedio en no seguidores',
          },
        },
        stories: {
          diaria: {
            count: stories.diaria,
            previous_count: input.previous_counts.stories.diaria,
            reason: 'Base de permanencia: una diaria, todos los días.',
            metric: 'la caída de vistas de la semana 3 coincidió con 4 días sin stories',
          },
          campana: {
            count: stories.campana,
            previous_count: input.previous_counts.stories.campana,
            reason: 'Noche de Jazz, del 12 al 14 de septiembre.',
            metric: '4 stories por día de evento, que es lo que sostuvo el aniversario',
          },
          interactiva: {
            count: stories.interactiva,
            previous_count: input.previous_counts.stories.interactiva,
            reason: 'Encuesta los jueves, que es el día de jazz.',
            metric: '31% de respuesta promedio en las encuestas de agosto',
          },
        },
        pillar_mix: input.pillar_performance.map((p) => ({
          pillar: p.pillar,
          pct: p.target_pct,
          target_pct: p.target_pct,
          on_target: true,
        })),
        rationale: [
          {
            change: 'Bajé posts simples de 9 a 6',
            because: 'Es el formato con menor alcance y el que menos se guarda.',
            evidence: {
              metric: 'alcance promedio',
              value: 1240,
              unit: 'conteo',
              benchmark: 3890,
              text: 'alcance promedio 1,240 contra 3,890 del reel',
            },
          },
          {
            change: 'Subí carruseles de 3 a 6',
            because: 'Los tres de agosto son tu tope histórico de guardados.',
            evidence: {
              metric: 'guardados promedio',
              value: 94,
              unit: 'conteo',
              benchmark: 21,
              text: '94 guardados contra 21 del post simple',
            },
          },
          {
            change: 'Subí stories de 38 a 46',
            because: 'Los días sin stories se ven en la curva de vistas.',
            evidence: {
              metric: 'días sin stories en la semana 3',
              value: 4,
              unit: 'conteo',
              benchmark: 0,
              text: 'la caída de la semana 3 coincidió con 4 días sin stories',
            },
          },
        ],
        upcoming: input.key_dates.map((date) => ({
          month: date.month,
          title: date.title,
          campaign_idea:
            date.title === 'Noche de Jazz'
              ? 'Serie de tres reels de barra al beat, uno por noche, con pauta a reservas.'
              : 'Carrusel de historia del lugar más invitación con cupo limitado.',
          needs_ads: true,
        })),
        capacity_note: `68 piezas contra ${input.capacity_declared} de capacidad declarada: entra con holgura de ${input.capacity_declared - 68}.`,
      },
    }
  },

  analista: (input) => {
    const byReach = [...input.piece_performance].sort((a, b) => b.reach - a.reach)
    const byDate = [...input.piece_performance].sort((a, b) =>
      a.published_at.localeCompare(b.published_at),
    )
    // Un campo distinto por pieza para que la lista no se lea como plantilla.
    const fields = ['format', 'publish_at', 'hook'] as const

    return {
      kind: 'resultado',
      data: {
        quitar: [
          {
            finding: 'Posts de producto sin contexto humano.',
            evidence: {
              metric: 'alcance contra el promedio del mes',
              value: -38,
              unit: 'porcentaje',
              benchmark: 0,
              text: '4 piezas, 38% abajo del promedio',
            },
            pieces_affected: 4,
          },
          {
            finding: 'Publicar antes de las 10 de la mañana.',
            evidence: {
              metric: 'engagement',
              value: 2.1,
              unit: 'porcentaje',
              benchmark: 4.8,
              text: '2.1% en la mañana contra 4.8% en la tarde',
            },
            pieces_affected: 6,
          },
        ],
        meter_mas: [
          {
            finding: 'Carruseles educativos de coctelería.',
            evidence: {
              metric: 'guardados promedio',
              value: 94,
              unit: 'conteo',
              benchmark: 21,
              text: '94 guardados, tu tope histórico',
            },
            pieces_affected: 3,
          },
          {
            finding: 'Rostros del equipo en el primer segundo del reel.',
            evidence: {
              metric: 'retención a 3 segundos',
              value: 71,
              unit: 'porcentaje',
              benchmark: 44,
              text: '71% de retención contra 44% sin rostro',
            },
            pieces_affected: 2,
          },
        ],
        mejorar: [
          {
            finding: 'Los hooks preguntan pero no prometen.',
            evidence: {
              metric: 'piezas que abren con "¿sabías que...?"',
              value: 7,
              unit: 'conteo',
              benchmark: 0,
              text: '"¿sabías que...?" en 7 piezas',
            },
            pieces_affected: 7,
            suggested_change: 'Cambiar a hook de resultado: qué se lleva quien ve la pieza.',
          },
          {
            finding: `Los CTA de story piden guardar y el objetivo del mes es ${input.month_goal.toLowerCase()}.`,
            evidence: {
              metric: 'stories con CTA de guardar',
              value: 9,
              unit: 'conteo',
              benchmark: 0,
              text: '9 de 12 stories pidieron guardar',
            },
            pieces_affected: 9,
            suggested_change: 'Cambiar a "reserva" con sticker de link.',
          },
        ],
        para_mitad_de_mes: {
          unpublished_count: input.unpublished_pieces.length,
          changes:
            input.mode === 'cierre'
              ? []
              : input.unpublished_pieces.slice(0, 3).map((piece, index) => {
                  const field = fields[index % fields.length] ?? 'hook'
                  return {
                    piece_id: piece.piece_id,
                    scheduled_on: piece.scheduled_on,
                    field,
                    from:
                      field === 'format'
                        ? piece.format
                        : field === 'publish_at'
                          ? '9:00 am'
                          : (piece.hook ?? 'sin hook'),
                    to:
                      field === 'format'
                        ? 'carrusel'
                        : field === 'publish_at'
                          ? '6:00 pm'
                          : 'hook de resultado, sin pregunta',
                    reason:
                      field === 'format'
                        ? 'Mismo tema, formato que se guarda 4 veces más.'
                        : field === 'publish_at'
                          ? 'La tarde rinde 4.8% contra 2.1% de la mañana.'
                          : 'Las preguntas retóricas están abajo del promedio.',
                  }
                }),
        },
        learnings: {
          top_pieces: byReach.slice(0, 5).map((p) => p.piece_id),
          last_pieces: byDate.slice(-3).map((p) => p.piece_id),
          corrections: [
            'La barra vacía funciona como apertura; el trago servido, como cierre.',
            'Nada de preguntas retóricas en el hook.',
          ],
        },
        lectura_del_mes:
          'El mes lo cargaron los reels de ambiente y un carrusel de coctelería. ' +
          'Lo que no rindió fue el producto solo, sin barra ni gente. ' +
          'Septiembre se mueve a la tarde y sube carruseles.',
      },
    }
  },

  guionista: (input) => ({
    kind: 'resultado',
    data: {
      piece_id: input.piece_id,
      trend_id: input.trend.trend_id,
      trend_base: input.trend.title,
      fit_score: 87,
      fit_reason:
        'El formato exige un espacio con personalidad visual, que es el diferenciador ' +
        'de Tower Bar. Y se resuelve sin cara al frente, que es lo que el cliente no quiere.',
      audio_url: input.trend.audio_url,
      duration_s: 14,
      scenes: [
        {
          from_s: 0,
          to_s: 2.5,
          shot: 'Plano fijo, barra vacía',
          action: 'Luz cálida baja, nadie en cuadro',
          on_screen_text: '6:00 pm',
          vo: null,
        },
        {
          from_s: 2.5,
          to_s: 3,
          shot: 'Corte al beat',
          action: 'Corte seco en el golpe del audio',
          on_screen_text: null,
          vo: null,
        },
        {
          from_s: 3,
          to_s: 8,
          shot: 'Mismo plano fijo',
          action: 'Barra llena, movimiento, humo del hielo',
          on_screen_text: '9:40 pm',
          vo: null,
        },
        {
          from_s: 8,
          to_s: 12,
          shot: 'Detalle del trago servido',
          action: 'Cámara lenta sobre el vaso al momento de servir',
          on_screen_text: null,
          vo: null,
        },
        {
          from_s: 12,
          to_s: 14,
          shot: 'Logo sutil, esquina inferior',
          action: 'Cierre sobre el plano general',
          on_screen_text: 'Tower Bar · Jueves de jazz',
          vo: null,
        },
      ],
      requirements: `2 tomas, mismo encuadre, ${input.available_gear.includes('Tripié') ? 'con tripié' : 'con base fija'}. Una a las 6 pm y una a las 9:40 pm.`,
      alternative:
        'Si no hay tripié: la misma idea en plano cenital de la barra, apoyando el teléfono en el estante alto.',
    },
  }),

  redactor: (input) => {
    const pool = [
      '#towerbar',
      '#coctelería',
      '#tijuana',
      '#jazzentijuana',
      '#mixología',
      '#barradeautor',
    ]
    const count = input.caption_rules.hashtag_count ?? 5
    const copy = {
      hook: 'tres cócteles que solo existen aquí',
      copy_in: 'uno por cada hora de la noche',
      copy_out:
        'la carta de autor cambia cada temporada. estos tres se quedan, ' +
        'porque son los que la gente pide por nombre.',
      cta: 'reserva por el link de la bio',
    }
    const cased = input.caption_rules.lowercase_only
      ? copy
      : {
          hook: 'Tres cócteles que solo existen aquí',
          copy_in: 'Uno por cada hora de la noche',
          copy_out: copy.copy_out,
          cta: 'Reserva por el link de la bio',
        }

    return {
      kind: 'resultado',
      data: { piece_id: input.piece_id, ...cased, hashtags: pool.slice(0, count) },
    }
  },

  editor_marca: (input) => {
    const hashtagRule = input.rules.find((rule) => typeof rule.params['exact'] === 'number')
    const expected =
      typeof hashtagRule?.params['exact'] === 'number' ? hashtagRule.params['exact'] : null
    const actual = input.piece.hashtags.length

    // El caso literal de la Bandeja: el agente ya sabe qué quitar, pero quitar
    // dos hashtags es una decisión de marca. Pregunta en vez de decidir solo.
    if (hashtagRule && expected !== null && actual !== expected) {
      return {
        kind: 'escalamiento',
        pregunta:
          `Esta pieza tiene ${actual} hashtags y la regla del cliente son exactamente ` +
          `${expected}. Quité los ${actual - expected} con menor volumen. ¿Confirmas?`,
        opciones: [
          { key: 'confirmar', label: 'Confirmar' },
          { key: 'elegir', label: 'Elegir yo cuáles' },
          { key: 'abrir', label: 'Abrir la pieza' },
        ],
        severidad: hashtagRule.severity,
        piece_id: input.piece_id,
      }
    }

    const text = [input.piece.hook, input.piece.copy_in, input.piece.copy_out, input.piece.cta]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')

    const verdicts = input.rules.map((rule) => {
      const banned = Array.isArray(rule.params['banned']) ? rule.params['banned'] : []
      const hit = banned.find(
        (word) => typeof word === 'string' && text.toLowerCase().includes(word.toLowerCase()),
      )
      const lowercaseFails = rule.params['lowercase'] === true && text !== text.toLowerCase()
      const fails = Boolean(hit) || lowercaseFails

      return {
        rule_id: rule.rule_id,
        rule: rule.rule,
        severity: rule.severity,
        checked_by: rule.check_by,
        verdict: fails ? 'no_cumple' : 'cumple',
        detail: hit
          ? `Aparece la palabra prohibida "${String(hit)}".`
          : lowercaseFails
            ? 'Hay mayúsculas en el caption y la regla pide todo en minúsculas.'
            : 'Cumple.',
        suggested_fix: lowercaseFails ? text.toLowerCase() : null,
      }
    })

    return {
      kind: 'resultado',
      data: {
        piece_id: input.piece_id,
        verdicts,
        blocking: verdicts.some((v) => v.severity === 'critica' && v.verdict === 'no_cumple'),
      },
    }
  },

  pautero: (input) => {
    if (input.mode === 'planear') {
      const half = Math.floor(input.campaign.budget_cents / 2)
      return {
        kind: 'resultado',
        data: {
          mode: 'planear',
          name: input.campaign.name,
          objective: input.campaign.objective,
          platform: input.campaign.platform,
          budget_cents: input.campaign.budget_cents,
          daily_cents: Math.round(input.campaign.budget_cents / input.total_days),
          ad_sets: [
            {
              name: 'A · Interés',
              audience_type: 'interes',
              audience_def: 'Jazz, coctelería y vida nocturna · Tijuana y Chula Vista · 25–45',
              budget_cents: half,
              piece_ids: input.candidate_piece_ids,
            },
            {
              name: 'B · Similares',
              audience_type: 'similares',
              audience_def: '1% de visitantes web de los últimos 90 días',
              budget_cents: input.campaign.budget_cents - half,
              piece_ids: input.candidate_piece_ids.slice(0, 1),
            },
          ],
          learning_goal:
            'Si el interés frío rinde mejor que los similares para eventos. ' +
            'Agosto no se probó; esto define la estructura de octubre.',
        },
      }
    }

    const spent = input.ad_sets.reduce((sum, set) => sum + set.spent_cents, 0)

    if (input.mode === 'medir') {
      return {
        kind: 'resultado',
        data: {
          mode: 'medir',
          spent_cents: spent,
          budget_cents: input.campaign.budget_cents,
          days_left: input.total_days - input.day_of_campaign,
          per_ad_set: input.ad_sets,
          summary: `Van ${spent} centavos de ${input.campaign.budget_cents} al día ${input.day_of_campaign} de ${input.total_days}.`,
        },
      }
    }

    const ranked = [...input.ad_sets].sort(
      (a, b) => a.cost_per_result_cents - b.cost_per_result_cents,
    )
    const best = ranked.at(0)
    const worst = ranked.at(-1)
    const remaining = worst ? worst.budget_cents - worst.spent_cents : 0
    const ratio =
      best && worst && best.cost_per_result_cents > 0
        ? (worst.cost_per_result_cents / best.cost_per_result_cents).toFixed(1)
        : '—'

    return {
      kind: 'resultado',
      data: {
        mode: 'ajustar',
        day_of: `día ${input.day_of_campaign} de ${input.total_days}`,
        proposals: [
          {
            kind: 'mover_presupuesto',
            target_ad_set_id: worst?.ad_set_id ?? null,
            rationale: `${worst?.name ?? 'El ad set más caro'} va a ${worst?.cost_per_result_cents ?? 0}¢ por resultado y ${best?.name ?? 'el más barato'} va a ${best?.cost_per_result_cents ?? 0}¢. Diferencia de ${ratio}×.`,
            expected_impact: '~18 resultados adicionales estimados al cierre.',
            risk: 'Perdemos la lectura completa de similares para octubre.',
            alternative: {
              label: 'Dejar B con $200 solo para tener el dato',
              rationale: 'Menos resultados, pero la comparación queda cerrada.',
            },
            manual_steps: [
              `Pausar el ad set "${worst?.name ?? ''}" en el administrador de anuncios.`,
              `Subir el presupuesto de "${best?.name ?? ''}" en ${remaining} centavos.`,
              'Marcar la propuesta como aplicada en Studio OS.',
            ],
            requires_human_execution: true,
          },
        ],
      },
    }
  },

  auditor: (input) => ({
    kind: 'resultado',
    data: {
      accounts: input.accounts.map((account) => {
        const daysSincePost = account.last_post_at
          ? daysBetween(account.last_post_at, input.checked_at)
          : 99
        const checklist = Object.values(account.profile_checklist)
        const missing = checklist.filter((done) => !done).length
        const behind = account.posts_per_week < account.target_posts_per_week

        const light =
          daysSincePost > 3 || account.followers_delta_30d < 0
            ? 'rojo'
            : missing > 0 || behind
              ? 'amarillo'
              : 'verde'

        const findings = []
        if (daysSincePost > 3) {
          findings.push({
            area: 'cadencia',
            severity: 'alta',
            finding: `Van ${daysSincePost} días sin publicar.`,
            fix: 'Sacar hoy una de las piezas ya aprobadas del planner.',
          })
        }
        if (behind) {
          findings.push({
            area: 'cadencia',
            severity: 'media',
            finding: `${account.posts_per_week} publicaciones por semana contra un objetivo de ${account.target_posts_per_week}.`,
            fix: 'Subir una pieza semanal reciclando carrusel a stories.',
          })
        }
        if (!account.profile_checklist.link) {
          findings.push({
            area: 'perfil',
            severity: 'critica',
            finding: 'El perfil no tiene link activo.',
            fix: 'Poner el link de reservas en la bio.',
          })
        }
        if (!account.profile_checklist.highlights) {
          findings.push({
            area: 'perfil',
            severity: 'baja',
            finding: 'Las historias destacadas están sin ordenar.',
            fix: 'Dejar cuatro: Carta, Jazz, Reservas y El lugar.',
          })
        }
        if (account.unanswered_dms + account.unanswered_comments > 10) {
          findings.push({
            area: 'conversacion',
            severity: 'alta',
            finding: `${account.unanswered_dms} mensajes y ${account.unanswered_comments} comentarios sin responder.`,
            fix: 'Bloque de 20 minutos, jueves y domingo, para vaciar la bandeja.',
          })
        }
        if (account.followers_delta_30d < 0) {
          findings.push({
            area: 'crecimiento',
            severity: 'media',
            finding: `La cuenta perdió ${Math.abs(account.followers_delta_30d)} seguidores en 30 días.`,
            fix: 'Replicar en esta red los dos reels que mejor rindieron en Instagram.',
          })
        }

        return {
          platform: account.platform,
          light,
          score: Math.max(0, 100 - findings.length * 12 - missing * 5),
          findings,
        }
      }),
      headline: 'Instagram sostiene la cuenta; Facebook lleva dos semanas sin publicar y sin link.',
    },
  }),

  cuenta: (input, clock) => {
    // Respuesta de WhatsApp: un borrador corto y determinista. No inventa datos;
    // acusa recibo, contesta con contexto y, si hay adjunto, lo menciona.
    if (input.task === 'whatsapp_respuesta') {
      const saludo = input.history.some((m) => m.direction === 'outbound')
        ? 'Hola de nuevo'
        : 'Hola, qué gusto'
      const acusa = input.incoming.has_media ? ' Ya vi lo que mandaste.' : ''
      const pendientes =
        input.pending_approvals > 0
          ? ` Por cierto, quedan ${input.pending_approvals} piezas por que las revises cuando puedas.`
          : ''
      return {
        kind: 'resultado',
        data: {
          task: 'whatsapp_respuesta',
          reply: `${saludo}.${acusa} Con gusto lo reviso y te confirmo en un momento.${pendientes}`,
          attach_note: input.incoming.has_media
            ? 'El cliente mandó un archivo; revísalo antes de responder.'
            : null,
          send_requires_approval: true,
        },
      }
    }

    const pending = input.pieces_total - input.pieces_approved
    const waitingTooLong = (input.last_client_response_days_ago ?? 0) >= 5

    return {
      kind: 'resultado',
      data: {
        task: 'presentacion_mensual',
        presentation: {
          title: `${input.client_name} · plan del mes`,
          month: input.month,
          intro:
            `${input.pieces_approved} de ${input.pieces_total} piezas aprobadas al corte del ` +
            `${clock.now().toISOString().slice(0, 10)}. ` +
            (input.previous_month_headline ?? 'Primer mes del cliente en el sistema.'),
          sections: [
            {
              heading: 'Lo que sale este mes',
              body: 'Veintidós piezas de feed y cuarenta y seis stories, con la Noche de Jazz como eje del 12 al 14.',
            },
            {
              heading: 'Lo que aprendimos del mes pasado',
              body: 'El ambiente en video rinde más que el producto solo. Subimos carruseles y movimos las publicaciones a la tarde.',
            },
            {
              heading: 'Lo que necesitamos de ustedes',
              body: `Aprobar ${pending} piezas y confirmar el line-up del trío invitado.`,
            },
          ],
          closing: 'Cualquier cambio, se marca en la misma vista y nos llega directo.',
        },
        follow_ups: [
          ...input.client_comments.map((comment) => ({
            piece_id: comment.piece_id,
            owner: 'yo',
            what: `Corregir según comentario del cliente: ${comment.body}`,
            field_to_change: 'copy_out',
            due_on: null,
          })),
          ...input.pending_approvals.map((approval) => ({
            piece_id: approval.piece_id,
            owner: 'cliente',
            what: `Aprobar la pieza del ${approval.scheduled_on} (${approval.days_waiting} días esperando).`,
            field_to_change: null,
            due_on: approval.scheduled_on,
          })),
        ],
        nudges: waitingTooLong
          ? [
              {
                reason: `El cliente lleva ${input.last_client_response_days_ago} días sin responder y hay piezas que se publican esta semana.`,
                draft_message:
                  'Hola, buen día. Nos faltan un par de aprobaciones para poder programar ' +
                  'lo de esta semana. ¿Te late si las revisamos hoy?',
                send_requires_approval: true,
              },
            ]
          : [],
      },
    }
  },

  investigador: (input) => ({
    kind: 'resultado',
    data: {
      resumen:
        'El video explica cómo grabar contenido de bar sin mostrar la cara del staff, con planos ' +
        'de manos y de la barra, y por qué la música en vivo sostiene la retención al inicio del reel.',
      puntos_clave: [
        'Planos de manos y de la barra funcionan sin mostrar al equipo.',
        'La música en vivo ayuda a la retención en los primeros tres segundos.',
      ],
      acciones_sugeridas: [
        {
          tipo: 'guion_propio',
          titulo: 'Serie "detrás de la barra" sin caras',
          detalle: `Adaptar la idea de "${input.video_title ?? 'este video'}" a un reel propio con planos de manos y hielo.`,
        },
        {
          tipo: 'post',
          titulo: 'Post sobre por qué la música en vivo sube la retención',
          detalle:
            'Carrusel corto citando el hallazgo del video para justificar más música en vivo.',
        },
      ],
    },
  }),
}

/* -------------------------------------------------------------------------- */
/*  El proveedor                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Costo simulado a partir del tamaño del payload. No es una tarifa real: es un
 * número estable y distinto de cero, para que el chequeo de presupuesto y la
 * bitácora se puedan probar de verdad. Un mock que siempre cuesta 0 esconde
 * exactamente el bug que el tope de gasto existe para atrapar.
 */
function fakeUsage(input: unknown, output: unknown) {
  const inputTokens = Math.ceil(JSON.stringify(input).length / 4)
  const outputTokens = Math.ceil(JSON.stringify(output).length / 4)
  return {
    inputTokens,
    outputTokens,
    costCents: Math.max(1, Math.round((inputTokens * 3 + outputTokens * 15) / 10_000)),
  }
}

export function createMockProvider(clock: Clock): AgentProvider {
  return {
    name: 'mock',
    async complete<K extends AgentKey>(request: ProviderRequest<K>): Promise<ProviderResult> {
      // Un solo cast, aquí: TypeScript no correlaciona `agent` con `input` a
      // través del tipo mapeado. El `parse` de la línea siguiente devuelve la
      // garantía que el cast suelta.
      const build = BUILDERS[request.agent] as (input: unknown, clock: Clock) => unknown

      // Se valida contra el MISMO schema que usará el runner: si una salida
      // ficticia no cumple el contrato, truena aquí y no en producción.
      const output = contractFor(request.agent).output.parse(build(request.input, clock))

      return { output, model: 'mock-1', ...fakeUsage(request.input, output) }
    },
  }
}
