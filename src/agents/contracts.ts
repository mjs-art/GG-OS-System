import { z } from 'zod'
import { isMonthKey, type MonthKey } from '@/lib/time'

/**
 * Los contratos de los ocho agentes: qué reciben y qué devuelven.
 *
 * Por qué existe este archivo y no un `any` con un prompt bonito: la salida de
 * un modelo es entrada no confiable. Si no se valida contra un schema, un
 * campo faltante no truena aquí — truena tres pantallas después, en el mes que
 * ya se le presentó al cliente.
 *
 * Regla de todo el archivo: los nombres de agente son los del enum
 * `app.agent_key` de la base, y los campos que se guardan en jsonb usan
 * snake_case para que lo que viaja al modelo, lo que se persiste y lo que se
 * lee en la bitácora sean el mismo objeto.
 */

/* -------------------------------------------------------------------------- */
/*  Primitivas compartidas — espejo de los enums del dominio.                  */
/* -------------------------------------------------------------------------- */

/** Orden y valores idénticos a `app.agent_key`. La prueba lo verifica contra el SQL. */
export const AGENT_KEYS = [
  'estratega',
  'analista',
  'guionista',
  'redactor',
  'editor_marca',
  'pautero',
  'auditor',
  'cuenta',
] as const

export type AgentKey = (typeof AGENT_KEYS)[number]

export const agentKeySchema = z.enum(AGENT_KEYS)

export const platformSchema = z.enum(['instagram', 'facebook', 'tiktok', 'linkedin'])
export const pieceFormatSchema = z.enum(['post', 'carrusel', 'reel'])
export const pieceStatusSchema = z.enum([
  'idea',
  'escrito',
  'revisado',
  'con_cliente',
  'aprobado',
  'publicado',
])
export const storyKindSchema = z.enum(['diaria', 'campana', 'interactiva'])
export const ruleSeveritySchema = z.enum(['critica', 'alta', 'media', 'baja'])
export const ruleCheckSchema = z.enum(['codigo', 'modelo'])

/**
 * `z.custom` y no `z.string().refine`: así el tipo inferido es `MonthKey` y no
 * `string`, y el resto de la app no tiene que volver a validar el formato.
 */
export const monthKeySchema = z.custom<MonthKey>(
  (value) => typeof value === 'string' && isMonthKey(value),
  { message: 'Mes inválido: se espera el formato AAAA-MM, por ejemplo 2026-09.' },
)

const uuidSchema = z.uuid()
const nonEmpty = z.string().trim().min(1)
const percent = z.number().min(0).max(100)

/** Dinero siempre en centavos enteros. Un float de pesos acaba en $284.99999. */
const cents = z.number().int().min(0)

/**
 * Evidencia numérica. El Analista y el Estratega no pueden afirmar nada sin
 * uno de estos: el número que sostiene la frase, y cómo se lee esa frase en la
 * presentación al cliente.
 */
export const evidenceSchema = z.object({
  metric: nonEmpty,
  value: z.number(),
  unit: z.enum(['porcentaje', 'conteo', 'segundos', 'pesos', 'razon']),
  /** Contra qué se compara. `null` cuando el número se sostiene solo. */
  benchmark: z.number().nullable(),
  /** 'alcance 38% bajo el promedio del mes' — se muestra tal cual. */
  text: nonEmpty,
})

export type Evidence = z.infer<typeof evidenceSchema>

/* -------------------------------------------------------------------------- */
/*  El sobre de salida: resultado o escalamiento.                              */
/* -------------------------------------------------------------------------- */

/**
 * Escalar es el comportamiento correcto, no una falla — por eso es una rama
 * legítima del tipo de salida y no un error. Un agente que inventa cuando no
 * sabe cuesta más caro que uno que pregunta.
 *
 * Los límites (2000 caracteres, arreglo de opciones) son los mismos CHECK que
 * tiene `public.escalations`, para que nunca se pueda producir un escalamiento
 * válido en TypeScript que la base rechace.
 */
export const escalationSchema = z.object({
  kind: z.literal('escalamiento'),
  pregunta: z.string().trim().min(1).max(2000),
  /** Las opciones se pintan como botones en la Bandeja. Más de cinco no se leen. */
  opciones: z
    .array(z.object({ key: nonEmpty, label: nonEmpty }))
    .min(1)
    .max(5),
  severidad: ruleSeveritySchema,
  /** La pieza que disparó la duda, si la hay: la Bandeja la abre de un click. */
  piece_id: uuidSchema.optional(),
})

export type Escalation = z.infer<typeof escalationSchema>

/**
 * Envoltura común de toda salida. Se discrimina por `kind` para que consumir
 * `data` sin haber descartado el escalamiento sea un error de compilación.
 */
function outputOf<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('resultado'), data }),
    escalationSchema,
  ])
}

/**
 * Toda corrida es de un cliente, para un mes, con una versión del Context Card.
 * La versión no es decorativa: sin ella no se puede explicar por qué el agente
 * dijo lo que dijo tres semanas después.
 */
const baseInput = z.object({
  client_id: uuidSchema,
  month: monthKeySchema,
  context_version: z.number().int().positive(),
})

/* -------------------------------------------------------------------------- */
/*  ① ESTRATEGA — cuánto contenido va al mes y en qué formatos.                */
/* -------------------------------------------------------------------------- */

const formatPerformanceSchema = z.object({
  format: pieceFormatSchema,
  pieces: z.number().int().min(0),
  avg_reach: z.number().min(0),
  avg_saves: z.number().min(0),
  avg_engagement_pct: percent,
  /** Alcance en no seguidores: el número con el que se decide subir reels. */
  avg_non_follower_reach: z.number().min(0),
})

const pillarPerformanceSchema = z.object({
  pillar: nonEmpty,
  target_pct: percent,
  actual_pct: percent,
  avg_reach: z.number().min(0),
})

const keyDateSchema = z.object({
  month: monthKeySchema,
  title: nonEmpty,
  kind: z.enum(['temporada', 'promocion', 'evento', 'efemeride']),
  starts_on: z.iso.date(),
  ends_on: z.iso.date().nullable(),
  notes: z.string().nullable(),
})

export const estrategaInputSchema = baseInput.extend({
  tier: nonEmpty,
  /** Piezas al mes que la persona declara poder producir. El tope real. */
  capacity_declared: z.number().int().min(0),
  /** Últimos 90 días. Sin esto el Estratega adivina, y adivinar no se presenta. */
  format_performance: z.array(formatPerformanceSchema),
  pillar_performance: z.array(pillarPerformanceSchema).min(1),
  previous_counts: z.object({
    feed: z.record(pieceFormatSchema, z.number().int().min(0)),
    stories: z.record(storyKindSchema, z.number().int().min(0)),
  }),
  /** Próximos 3–6 meses: el Estratega también propone hacia adelante. */
  key_dates: z.array(keyDateSchema),
  planned_ad_budget_cents: cents,
})

/**
 * Un renglón del plan de volumen. `reason` y `metric` son obligatorios porque
 * el plan se presenta al cliente sin traducir: un número sin su porqué no se
 * puede defender en junta.
 */
const volumeRowSchema = z.object({
  count: z.number().int().min(0),
  /** Cuántas iban el mes pasado. `null` en el primer mes del cliente. */
  previous_count: z.number().int().min(0).nullable(),
  reason: nonEmpty,
  metric: nonEmpty,
})

const volumePlanSchema = z
  .object({
    month: monthKeySchema,
    total_pieces: z.number().int().min(0),
    feed: z.record(pieceFormatSchema, volumeRowSchema),
    stories: z.record(storyKindSchema, volumeRowSchema),
    pillar_mix: z
      .array(
        z.object({
          pillar: nonEmpty,
          pct: percent,
          target_pct: percent,
          on_target: z.boolean(),
        }),
      )
      .min(1),
    /** El bloque "POR QUÉ ESTA MEZCLA". Cada cambio con la métrica que lo respalda. */
    rationale: z
      .array(z.object({ change: nonEmpty, because: nonEmpty, evidence: evidenceSchema }))
      .min(1),
    /** Fechas y campañas propuestas para los meses que siguen, no solo el actual. */
    upcoming: z.array(
      z.object({
        month: monthKeySchema,
        title: nonEmpty,
        campaign_idea: nonEmpty,
        needs_ads: z.boolean(),
      }),
    ),
    /** Cómo queda el plan contra la capacidad declarada. */
    capacity_note: nonEmpty,
  })
  .check((ctx) => {
    const plan = ctx.value
    const feed = Object.values(plan.feed).reduce((sum, row) => sum + row.count, 0)
    const stories = Object.values(plan.stories).reduce((sum, row) => sum + row.count, 0)
    // El total es el titular del plan. Si no cuadra con sus renglones, el
    // documento se contradice a sí mismo enfrente del cliente.
    if (feed + stories !== plan.total_pieces) {
      ctx.issues.push({
        code: 'custom',
        input: plan.total_pieces,
        path: ['total_pieces'],
        message: `El total (${plan.total_pieces}) no cuadra con los renglones (${feed + stories}).`,
      })
    }
  })

export const estrategaOutputSchema = outputOf(volumePlanSchema)

/* -------------------------------------------------------------------------- */
/*  ② ANALISTA — qué quitar, qué meter más, qué mejorar.                       */
/* -------------------------------------------------------------------------- */

const piecePerformanceSchema = z.object({
  piece_id: uuidSchema,
  format: pieceFormatSchema,
  pillar: nonEmpty,
  published_at: z.iso.datetime(),
  hook: z.string().nullable(),
  reach: z.number().min(0),
  saves: z.number().min(0),
  shares: z.number().min(0),
  engagement_pct: percent,
  /** Retención a 3 segundos. Solo aplica a reel; `null` en los demás formatos. */
  retention_3s_pct: percent.nullable(),
})

const unpublishedPieceSchema = z.object({
  piece_id: uuidSchema,
  scheduled_on: z.iso.date(),
  format: pieceFormatSchema,
  pillar: nonEmpty,
  hook: z.string().nullable(),
  status: pieceStatusSchema,
})

export const analistaInputSchema = baseInput.extend({
  /**
   * `cierre` corre el día 3 con el mes completo. `mitad_de_mes` corre ligero y
   * solo puede tocar lo que todavía no sale: trabajando con un mes de adelanto
   * los resultados no alcanzan para replanear, pero sí para corregir tres piezas.
   */
  mode: z.enum(['cierre', 'mitad_de_mes']),
  piece_performance: z.array(piecePerformanceSchema),
  monthly_totals: z.object({
    reach: z.number().min(0),
    impressions: z.number().min(0),
    saves: z.number().min(0),
    shares: z.number().min(0),
    profile_visits: z.number().min(0),
    link_clicks: z.number().min(0),
    new_followers: z.number().int(),
  }),
  unpublished_pieces: z.array(unpublishedPieceSchema),
  /** El objetivo declarado del mes: cambia qué CTA es el correcto. */
  month_goal: nonEmpty,
})

const findingSchema = z.object({
  finding: nonEmpty,
  evidence: evidenceSchema,
  pieces_affected: z.number().int().min(0),
})

const improvementSchema = findingSchema.extend({
  /** Sin el cambio concreto la lista es un diagnóstico, no una instrucción. */
  suggested_change: nonEmpty,
})

const analistaReportSchema = z.object({
  quitar: z.array(findingSchema),
  meter_mas: z.array(findingSchema),
  mejorar: z.array(improvementSchema),
  /**
   * El bloque que hace útil correr a mitad de mes: solo piezas que todavía no
   * se publican, con el cambio exacto. Vacío cuando `mode = 'cierre'`.
   */
  para_mitad_de_mes: z.object({
    unpublished_count: z.number().int().min(0),
    changes: z.array(
      z.object({
        piece_id: uuidSchema,
        scheduled_on: z.iso.date(),
        field: z.enum(['format', 'publish_at', 'hook', 'cta', 'pillar']),
        from: nonEmpty,
        to: nonEmpty,
        reason: nonEmpty,
      }),
    ),
  }),
  /** Se escribe de vuelta al Context Card como aprendizaje de la marca. */
  learnings: z.object({
    top_pieces: z.array(uuidSchema).max(5),
    last_pieces: z.array(uuidSchema).max(3),
    corrections: z.array(nonEmpty),
  }),
  /** El párrafo firmado que se lee en la sección Resultados. */
  lectura_del_mes: nonEmpty,
})

export const analistaOutputSchema = outputOf(analistaReportSchema)

/* -------------------------------------------------------------------------- */
/*  ③ GUIONISTA — guiones sobre una tendencia, con fit de marca.               */
/* -------------------------------------------------------------------------- */

/**
 * El agente NO descubre la tendencia: no existe una API limpia de audios en
 * tendencia y el scraping se rompe solo. La tendencia entra por el radar
 * manual y el agente la traduce a guion. Por eso `trend` es entrada obligatoria.
 */
export const trendSchema = z.object({
  trend_id: uuidSchema,
  platform: platformSchema,
  kind: z.enum(['formato', 'audio', 'angulo', 'reto']),
  title: nonEmpty,
  audio_url: z.url().nullable(),
  reference_url: z.url().nullable(),
  momentum: z.enum(['subiendo', 'estable', 'bajando']),
  spotted_at: z.iso.date(),
  notes: z.string().nullable(),
})

export const guionistaInputSchema = baseInput.extend({
  piece_id: uuidSchema,
  pillar: nonEmpty,
  scheduled_on: z.iso.date(),
  trend: trendSchema,
  /** Lo que la marca no hace: 'sin caras al frente', 'nada de precios en pantalla'. */
  brand_constraints: z.array(nonEmpty),
  /** Equipo real disponible. Define si la alternativa simple es la principal. */
  available_gear: z.array(nonEmpty),
  max_duration_s: z.number().min(3).max(180),
})

const sceneSchema = z.object({
  from_s: z.number().min(0),
  to_s: z.number().min(0),
  shot: nonEmpty,
  action: nonEmpty,
  on_screen_text: z.string().nullable(),
  /** Voz en off. `null` cuando el audio lleva la pieza. */
  vo: z.string().nullable(),
})

const scriptSchema = z
  .object({
    piece_id: uuidSchema,
    trend_id: uuidSchema,
    /** Qué se está copiando, en una línea legible. */
    trend_base: nonEmpty,
    fit_score: z.number().int().min(0).max(100),
    /** Un score sin razón no se puede discutir, y este se discute con el cliente. */
    fit_reason: nonEmpty,
    audio_url: z.url().nullable(),
    duration_s: z.number().min(3).max(180),
    scenes: z.array(sceneSchema).min(1),
    /** Qué hace falta para grabarlo: tomas, horarios, equipo. */
    requirements: nonEmpty,
    /** Siempre una versión más simple: la principal a veces no se puede grabar. */
    alternative: nonEmpty,
  })
  .check((ctx) => {
    const script = ctx.value
    let cursor = 0
    script.scenes.forEach((scene, index) => {
      if (scene.to_s <= scene.from_s) {
        ctx.issues.push({
          code: 'custom',
          input: scene,
          path: ['scenes', index, 'to_s'],
          message: 'Cada escena tiene que terminar después de empezar.',
        })
      }
      // Escenas encimadas o fuera de orden producen un guion que no se puede
      // grabar. Es más barato rechazar la salida que descubrirlo en locación.
      if (scene.from_s < cursor) {
        ctx.issues.push({
          code: 'custom',
          input: scene,
          path: ['scenes', index, 'from_s'],
          message: 'Las escenas se enciman o van fuera de orden.',
        })
      }
      cursor = Math.max(cursor, scene.to_s)
    })
    if (cursor > script.duration_s) {
      ctx.issues.push({
        code: 'custom',
        input: cursor,
        path: ['duration_s'],
        message: `Las escenas suman ${cursor}s y la duración declarada es ${script.duration_s}s.`,
      })
    }
  })

export const guionistaOutputSchema = outputOf(scriptSchema)

/* -------------------------------------------------------------------------- */
/*  ④ REDACTOR — hook, copy y hashtags.                                        */
/* -------------------------------------------------------------------------- */

/** Reglas de caption del cliente que sí se verifican por código. */
export const captionRulesSchema = z.object({
  lowercase_only: z.boolean(),
  /** Conteo exacto de hashtags. `null` cuando el cliente no lo pide exacto. */
  hashtag_count: z.number().int().min(0).max(30).nullable(),
  max_length: z.number().int().positive().nullable(),
  banned_words: z.array(nonEmpty),
  emojis_allowed: z.boolean(),
})

export const redactorInputSchema = baseInput.extend({
  piece_id: uuidSchema,
  format: pieceFormatSchema,
  platforms: z.array(platformSchema).min(1),
  pillar: nonEmpty,
  idea: nonEmpty,
  caption_rules: captionRulesSchema,
  tone: z.array(nonEmpty),
  approved_examples: z.array(nonEmpty),
})

const hashtagSchema = z
  .string()
  .regex(/^#[\p{L}\p{N}_]+$/u, 'Un hashtag empieza con # y no lleva espacios.')

const copySchema = z.object({
  piece_id: uuidSchema,
  /** La primera línea. Lo único que casi todos van a leer. */
  hook: nonEmpty,
  /** Copy dentro de la pieza (texto en pantalla del carrusel o del reel). */
  copy_in: nonEmpty,
  /** Caption del post. */
  copy_out: nonEmpty,
  cta: nonEmpty,
  hashtags: z.array(hashtagSchema).max(30),
})

export const redactorOutputSchema = outputOf(copySchema)

/* -------------------------------------------------------------------------- */
/*  ⑤ EDITOR DE MARCA — verdicto por regla.                                    */
/* -------------------------------------------------------------------------- */

export const brandRuleSchema = z.object({
  rule_id: uuidSchema,
  kind: nonEmpty,
  rule: z.string().trim().min(1).max(500),
  severity: ruleSeveritySchema,
  check_by: ruleCheckSchema,
  /** Parámetros de la verificación por código: `{ "exact": 5 }` para hashtags. */
  params: z.record(z.string(), z.unknown()),
})

export const editorMarcaInputSchema = baseInput.extend({
  piece_id: uuidSchema,
  piece: z.object({
    format: pieceFormatSchema,
    platforms: z.array(platformSchema),
    hook: z.string().nullable(),
    copy_in: z.string().nullable(),
    copy_out: z.string().nullable(),
    cta: z.string().nullable(),
    hashtags: z.array(z.string()),
  }),
  rules: z.array(brandRuleSchema).min(1),
})

const verdictSchema = z.object({
  rule_id: uuidSchema,
  rule: nonEmpty,
  severity: ruleSeveritySchema,
  /**
   * Quién dictó el verdicto. A un modelo se le puede convencer; a un conteo de
   * hashtags no. Que quede escrito por regla es lo que permite confiar en el
   * tablero sin releer las 2,000 piezas.
   */
  checked_by: ruleCheckSchema,
  verdict: z.enum(['cumple', 'no_cumple', 'no_aplica']),
  detail: nonEmpty,
  /** El arreglo propuesto. `null` cuando cumple o cuando no hay arreglo obvio. */
  suggested_fix: z.string().nullable(),
})

const brandReviewSchema = z
  .object({
    piece_id: uuidSchema,
    verdicts: z.array(verdictSchema).min(1),
    /** `true` frena el avance de la pieza en el pipeline. */
    blocking: z.boolean(),
  })
  .check((ctx) => {
    const review = ctx.value
    const failsCritical = review.verdicts.some(
      (v) => v.severity === 'critica' && v.verdict === 'no_cumple',
    )
    // Una crítica incumplida que no bloquea es exactamente el bug que este
    // agente existe para evitar. No se negocia en la capa de datos.
    if (failsCritical && !review.blocking) {
      ctx.issues.push({
        code: 'custom',
        input: review.blocking,
        path: ['blocking'],
        message: 'Hay una regla crítica incumplida: la revisión tiene que bloquear.',
      })
    }
  })

export const editorMarcaOutputSchema = outputOf(brandReviewSchema)

/* -------------------------------------------------------------------------- */
/*  ⑥ PAUTERO — planea, mide y propone. Nunca ejecuta.                         */
/* -------------------------------------------------------------------------- */

const adSetMetricsSchema = z.object({
  ad_set_id: uuidSchema,
  name: nonEmpty,
  budget_cents: cents,
  spent_cents: cents,
  impressions: z.number().int().min(0),
  clicks: z.number().int().min(0),
  ctr_pct: percent,
  cpm_cents: cents,
  cpc_cents: cents,
  results: z.number().int().min(0),
  cost_per_result_cents: cents,
})

export const pauteroInputSchema = baseInput.extend({
  mode: z.enum(['planear', 'medir', 'ajustar']),
  campaign: z.object({
    campaign_id: uuidSchema.nullable(),
    name: nonEmpty,
    objective: nonEmpty,
    platform: platformSchema,
    budget_cents: cents,
    start_date: z.iso.date(),
    end_date: z.iso.date(),
  }),
  ad_sets: z.array(adSetMetricsSchema),
  /** Piezas del planner disponibles para impulsar. */
  candidate_piece_ids: z.array(uuidSchema),
  day_of_campaign: z.number().int().min(0),
  total_days: z.number().int().positive(),
  /** Campañas cerradas: de aquí sale qué estructura funciona en esta cuenta. */
  history: z.array(
    z.object({
      name: nonEmpty,
      objective: nonEmpty,
      spent_cents: cents,
      results: z.number().int().min(0),
      cost_per_result_cents: cents,
    }),
  ),
})

const adsPlanSchema = z.object({
  mode: z.literal('planear'),
  name: nonEmpty,
  objective: nonEmpty,
  platform: platformSchema,
  budget_cents: cents,
  daily_cents: cents,
  ad_sets: z
    .array(
      z.object({
        name: nonEmpty,
        audience_type: z.enum(['interes', 'similares', 'retargeting', 'amplio']),
        audience_def: nonEmpty,
        budget_cents: cents,
        piece_ids: z.array(uuidSchema),
      }),
    )
    // Dos ad sets mínimo: con uno solo no hay contra qué comparar y la campaña
    // no enseña nada para el mes siguiente.
    .min(2),
  /** "Qué vamos a aprender". Una campaña sin pregunta es dinero sin lectura. */
  learning_goal: nonEmpty,
})

const adsReadingSchema = z.object({
  mode: z.literal('medir'),
  spent_cents: cents,
  budget_cents: cents,
  days_left: z.number().int().min(0),
  per_ad_set: z.array(adSetMetricsSchema),
  summary: nonEmpty,
})

/**
 * Una propuesta de ajuste. El campo `manual_steps` no es decoración: el agente
 * jamás toca un presupuesto ni pausa un anuncio, así que su entregable es la
 * instrucción exacta para que una persona lo haga en el ads manager.
 */
const adProposalSchema = z.object({
  kind: z.enum([
    'pausar',
    'mover_presupuesto',
    'subir_presupuesto',
    'bajar_presupuesto',
    'cambiar_creativo',
    'extender',
    'no_tocar',
  ]),
  target_ad_set_id: uuidSchema.nullable(),
  rationale: nonEmpty,
  expected_impact: nonEmpty,
  risk: nonEmpty,
  /** La versión conservadora, para poder aprobar algo intermedio. */
  alternative: z.object({ label: nonEmpty, rationale: nonEmpty }).nullable(),
  manual_steps: z.array(nonEmpty).min(1),
  /**
   * Literal `true` a propósito: hace imposible construir en TypeScript una
   * propuesta que se marque como auto-ejecutable. Es tu dinero y el del
   * cliente; un agente con escritura a la cuenta publicitaria es un riesgo
   * desproporcionado al clic que ahorra.
   */
  requires_human_execution: z.literal(true),
})

const adsAdjustmentSchema = z.object({
  mode: z.literal('ajustar'),
  day_of: nonEmpty,
  proposals: z.array(adProposalSchema).min(1),
})

export const pauteroOutputSchema = outputOf(
  z.discriminatedUnion('mode', [adsPlanSchema, adsReadingSchema, adsAdjustmentSchema]),
)

/* -------------------------------------------------------------------------- */
/*  ⑦ AUDITOR — semáforo por red.                                              */
/* -------------------------------------------------------------------------- */

export const auditorInputSchema = baseInput.extend({
  accounts: z
    .array(
      z.object({
        platform: platformSchema,
        handle: nonEmpty,
        url: z.url().nullable(),
        followers: z.number().int().min(0),
        followers_delta_30d: z.number().int(),
        last_post_at: z.iso.datetime().nullable(),
        posts_per_week: z.number().min(0),
        target_posts_per_week: z.number().min(0),
        profile_checklist: z.object({
          bio: z.boolean(),
          link: z.boolean(),
          highlights: z.boolean(),
          photo: z.boolean(),
        }),
        unanswered_dms: z.number().int().min(0),
        unanswered_comments: z.number().int().min(0),
      }),
    )
    .min(1),
  checked_at: z.iso.datetime(),
})

const auditSchema = z.object({
  accounts: z
    .array(
      z.object({
        platform: platformSchema,
        /** El semáforo de la tarjeta en la sección Redes. */
        light: z.enum(['verde', 'amarillo', 'rojo']),
        score: z.number().int().min(0).max(100),
        findings: z.array(
          z.object({
            area: z.enum(['perfil', 'cadencia', 'crecimiento', 'conversacion', 'contenido']),
            severity: ruleSeveritySchema,
            finding: nonEmpty,
            /** Qué hacer. Un hallazgo sin arreglo es ruido en el tablero. */
            fix: nonEmpty,
          }),
        ),
      }),
    )
    .min(1),
  headline: nonEmpty,
})

export const auditorOutputSchema = outputOf(auditSchema)

/* -------------------------------------------------------------------------- */
/*  ⑧ CUENTA — presentación mensual y seguimiento.                             */
/* -------------------------------------------------------------------------- */

export const cuentaInputSchema = baseInput.extend({
  client_name: nonEmpty,
  pieces_total: z.number().int().min(0),
  pieces_approved: z.number().int().min(0),
  pending_approvals: z.array(
    z.object({
      piece_id: uuidSchema,
      scheduled_on: z.iso.date(),
      status: pieceStatusSchema,
      days_waiting: z.number().int().min(0),
    }),
  ),
  /** Comentarios del cliente que hay que convertir en tareas. */
  client_comments: z.array(
    z.object({ piece_id: uuidSchema, body: nonEmpty, created_at: z.iso.datetime() }),
  ),
  previous_month_headline: z.string().nullable(),
  last_client_response_days_ago: z.number().int().min(0).nullable(),
})

const accountUpdateSchema = z.object({
  presentation: z.object({
    title: nonEmpty,
    month: monthKeySchema,
    intro: nonEmpty,
    sections: z.array(z.object({ heading: nonEmpty, body: nonEmpty })).min(1),
    closing: nonEmpty,
  }),
  /** Comentario del cliente traducido a tarea con el campo exacto a cambiar. */
  follow_ups: z.array(
    z.object({
      piece_id: uuidSchema.nullable(),
      owner: z.enum(['yo', 'cliente', 'agente']),
      what: nonEmpty,
      field_to_change: z.string().nullable(),
      due_on: z.iso.date().nullable(),
    }),
  ),
  /**
   * Borradores de mensaje al cliente. `true` literal por la misma razón que en
   * el Pautero: nunca sale un mensaje sin que una persona lo apruebe.
   */
  nudges: z.array(
    z.object({
      reason: nonEmpty,
      draft_message: nonEmpty,
      send_requires_approval: z.literal(true),
    }),
  ),
})

export const cuentaOutputSchema = outputOf(accountUpdateSchema)
