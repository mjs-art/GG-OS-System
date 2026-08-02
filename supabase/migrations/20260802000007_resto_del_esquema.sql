-- =============================================================================
-- 0007 · El resto del esquema: redes, resultados, volumen, fechas, tendencias,
--        guiones, pauta, pendientes y eventos.
--
-- Tres ideas atraviesan todo el archivo:
--
--   1. El dinero es un entero de centavos. Nunca un float. Una campaña de
--      $2,000 que se guarda como 1999.9999999 es un reporte que no cuadra y una
--      discusión con el cliente que no se puede ganar.
--   2. El agente propone, la persona ejecuta. La sección de pauta lo hace
--      cumplir con triggers, no con buena voluntad de la interfaz.
--   3. La tenencia no se puede desincronizar. `org_id` y `client_id` viajan
--      desnormalizados en cada tabla para que las políticas no hagan join, y
--      hay llaves compuestas y triggers que impiden que mientan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos nuevos. Sin acentos ni eñes, como el resto del dominio: estos valores
-- viajan a la URL, al JSON y al CSV, y un 'promoción' con tilde termina siendo
-- tres cadenas distintas según quién lo escribió.
-- -----------------------------------------------------------------------------

create type app.metric_source as enum ('manual', 'csv', 'api');

create type app.key_date_kind as enum (
  'festividad',
  'aniversario',
  'evento',
  'promocion',
  'temporada'
);

create type app.trend_kind as enum ('audio', 'formato', 'reto', 'tema');

-- Dónde va la tendencia. Sirve para decidir si vale la pena producir: subir a
-- una tendencia en 'bajando' es llegar tarde y gastar una grabación.
create type app.trend_momentum as enum ('subiendo', 'pico', 'bajando');

create type app.script_status as enum ('propuesto', 'aceptado', 'editado', 'descartado');

create type app.campaign_status as enum ('borrador', 'activa', 'pausada', 'cerrada');

create type app.ad_set_status as enum ('activo', 'pausado', 'cerrado');

create type app.ad_creative_status as enum ('propuesto', 'activo', 'pausado');

create type app.audience_type as enum (
  'interes',
  'similares',
  'retargeting',
  'amplio',
  'personalizado'
);

-- Qué pide la propuesta. Todos son verbos que se ejecutan EN EL ADS MANAGER,
-- no en esta base: aquí solo se registra la decisión.
create type app.ad_proposal_kind as enum (
  'pausar',
  'reactivar',
  'mover_presupuesto',
  'subir_presupuesto',
  'bajar_presupuesto',
  'cambiar_creativo',
  'cambiar_publico',
  'extender',
  'cerrar'
);

-- 'aprobada_alternativa' es un estado propio y no un booleano aparte porque la
-- alternativa es OTRA instrucción: quien la aplica necesita saber cuál de las
-- dos aprobó su jefa.
create type app.ad_proposal_status as enum (
  'propuesta',
  'aprobada',
  'aprobada_alternativa',
  'rechazada',
  'aplicada'
);

-- De quién depende una tarea. Es la columna que hace útil la lista: separa lo
-- que Ana puede resolver hoy de lo que lleva cuatro días esperando al cliente.
create type app.task_owner as enum ('yo', 'cliente', 'agente');

create type app.task_status as enum ('pendiente', 'en_curso', 'bloqueada', 'hecha');

-- -----------------------------------------------------------------------------
-- Llaves compuestas sobre lo que ya existía.
--
-- No son redundantes con la PK: habilitan llaves foráneas compuestas desde las
-- tablas nuevas, que es la forma de garantizar —sin un solo trigger— que una
-- pieza referenciada pertenece al mismo cliente que la referencia.
-- -----------------------------------------------------------------------------
alter table public.pieces
  add constraint pieces_id_client_key unique (id, client_id);

-- =============================================================================
-- Salud de cuentas
-- =============================================================================

-- Retrato actual de cada red del cliente. Una fila por red, se sobrescribe en
-- cada auditoría: el histórico de la auditoría vive en account_audits, aquí
-- solo interesa "cómo está hoy" para pintar el semáforo.
create table public.social_accounts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  client_id           uuid not null references public.clients (id) on delete cascade,
  platform            app.platform not null,

  handle              text,
  url                 text check (url is null or url ~ '^https?://'),

  followers           integer not null default 0 check (followers >= 0),
  -- Variación del mes. Puede ser negativa: perder seguidores es un dato, no un
  -- error, y es justo el que dispara la conversación con el cliente.
  followers_delta     integer not null default 0,

  last_post_at        timestamptz,

  -- {"bio": true, "link": false, "highlights": true, "foto": true}
  profile_checklist   jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(profile_checklist) = 'object'),

  unanswered_dms      integer not null default 0 check (unanswered_dms >= 0),
  unanswered_comments integer not null default 0 check (unanswered_comments >= 0),

  -- Publicaciones por semana observadas contra las comprometidas. Es un
  -- promedio, por eso numeric y no integer; no es dinero.
  posts_per_week      numeric(5, 2) not null default 0 check (posts_per_week >= 0),
  target_per_week     numeric(5, 2) not null default 0 check (target_per_week >= 0),

  checked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (client_id, platform)
);

-- Bitácora de auditorías. Append-only: la gracia es poder decir "hace un mes
-- estabas en 40 y hoy en 72", y eso se pierde si se sobrescribe.
create table public.account_audits (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  platform    app.platform not null,
  score       smallint not null check (score between 0 and 100),
  -- [{"area": "bio", "severity": "alta", "finding": "..."}]
  findings    jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  created_at  timestamptz not null default now()
);

create index account_audits_client_idx
  on public.account_audits (client_id, platform, created_at desc);

-- =============================================================================
-- Resultados
-- =============================================================================

-- Cierre mensual por cliente. Una sola fila por mes: si hubiera dos, cualquier
-- comparación contra el mes anterior daría un número distinto según el orden.
create table public.results_monthly (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  month           app.month_key not null,

  reach           integer not null default 0 check (reach >= 0),
  impressions     integer not null default 0 check (impressions >= 0),
  saves           integer not null default 0 check (saves >= 0),
  shares          integer not null default 0 check (shares >= 0),
  interactions    integer not null default 0 check (interactions >= 0),
  -- Sin CHECK de no negativo, a propósito: un mes se pueden perder seguidores.
  new_followers   integer not null default 0,
  profile_visits  integer not null default 0 check (profile_visits >= 0),
  link_clicks     integer not null default 0 check (link_clicks >= 0),

  -- Arrancamos capturando a mano y por CSV. Guardar de dónde salió el número
  -- es lo que permite, el día que entre la API, saber qué revisar.
  source          app.metric_source not null default 'manual',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (client_id, month)
);

-- Resultados por pieza. La FK compuesta contra (id, client_id) impide medir una
-- pieza de otro cliente, que es como se contamina un reporte sin que se note.
create table public.results_piece (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  piece_id      uuid not null,

  reach         integer not null default 0 check (reach >= 0),
  impressions   integer not null default 0 check (impressions >= 0),
  saves         integer not null default 0 check (saves >= 0),
  shares        integer not null default 0 check (shares >= 0),
  interactions  integer not null default 0 check (interactions >= 0),

  measured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete cascade,
  -- Se puede medir la misma pieza varias veces, pero no dos veces el mismo
  -- instante: eso siempre es un doble envío del importador.
  unique (piece_id, measured_at)
);

create index results_piece_client_idx on public.results_piece (client_id, measured_at desc);

-- =============================================================================
-- Volumen del mes
-- =============================================================================

-- El plan del Estratega. `rationale` guarda la razón por renglón CON la métrica
-- que la respalda: un plan de volumen sin el porqué es un número que nadie
-- puede defender frente al cliente el día que pregunte.
create table public.volume_plans (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  month             app.month_key not null,

  -- {"post": 6, "carrusel": 6, "reel": 10}
  feed_counts       jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(feed_counts) = 'object'),
  -- {"diaria": 30, "campana": 8, "interactiva": 4}
  story_counts      jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(story_counts) = 'object'),
  -- {"<pillar_id>": 40, ...} en porcentaje objetivo
  pillar_mix        jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(pillar_mix) = 'object'),
  rationale         jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(rationale) = 'object'),

  -- Piezas que el estudio declaró que puede producir ese mes. El Estratega no
  -- puede proponer más que esto; sin el tope, propone planes preciosos e
  -- imposibles y el mes cierra en rojo.
  capacity_declared integer check (capacity_declared is null or capacity_declared >= 0),

  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (client_id, month),

  -- Aprobado sin quién, o quién sin cuándo, es una aprobación que no se puede
  -- demostrar. Y el portal decide qué mostrar mirando approved_at.
  constraint volume_plans_approval_is_complete
    check (num_nonnulls(approved_by, approved_at) <> 1)
);

-- =============================================================================
-- Fechas clave
-- =============================================================================

create table public.key_dates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  date          date not null,
  title         text not null check (length(trim(title)) between 1 and 160),
  kind          app.key_date_kind not null,
  notes         text,
  -- Lo que propone el Estratega para esa fecha. Vive aquí y no en una pieza
  -- porque nace antes de que exista contenido: es la idea, no el entregable.
  campaign_idea text,
  has_budget    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index key_dates_client_date_idx on public.key_dates (client_id, date);

-- =============================================================================
-- Tendencias — de la ORG, no de un cliente
-- =============================================================================

-- Un audio que despega sirve para varios clientes a la vez. Amarrar la
-- tendencia a un cliente obligaría a capturarla N veces y perdería justo lo que
-- la hace valiosa: el radar es del estudio. Por eso solo lleva org_id y su RLS
-- va por membresía de org, no por cliente.
create table public.trends (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  platform      app.platform not null,
  kind          app.trend_kind not null,
  title         text not null check (length(trim(title)) between 1 and 200),
  audio_url     text check (audio_url is null or audio_url ~ '^https?://'),
  reference_url text check (reference_url is null or reference_url ~ '^https?://'),

  spotted_at    timestamptz not null default now(),
  spotted_by    uuid references auth.users (id) on delete set null,
  momentum      app.trend_momentum not null default 'subiendo',
  notes         text,
  -- A qué giros le queda: ['bar', 'restaurante']. Es el filtro que usa el
  -- Guionista para no proponerle a un hotel el reto de la barra.
  verticals     text[] not null default '{}',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Habilita la FK compuesta desde scripts: una tendencia de otra agencia no
  -- puede entrar a un guion de esta.
  unique (id, org_id)
);

create index trends_org_idx on public.trends (org_id, spotted_at desc);

-- =============================================================================
-- Guiones
-- =============================================================================

create table public.scripts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  piece_id      uuid,
  trend_id      uuid,

  -- Qué tanto le queda a la marca, 0–100. Es el número que evita el reel
  -- gracioso que ningún cliente habría aprobado.
  fit_score     smallint check (fit_score is null or fit_score between 0 and 100),
  fit_reason    text,

  duration_s    integer check (duration_s is null or duration_s between 1 and 3600),
  -- [{"from": 0, "to": 3, "shot": "...", "action": "...", "on_screen_text": "...", "vo": "..."}]
  scenes        jsonb not null default '[]'::jsonb check (jsonb_typeof(scenes) = 'array'),
  requirements  text,
  -- Siempre una versión más simple. Un guion que exige tres personas y un
  -- dolly no se graba nunca, y sin plan B el hueco del mes queda igual.
  alternative   text,

  status        app.script_status not null default 'propuesto',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- SET NULL acotado a una columna (Postgres 15+): sin la lista, borrar la
  -- pieza intentaría anular también client_id, que es NOT NULL, y el DELETE
  -- fallaría con un error que no dice nada de lo que pasó.
  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete set null (piece_id),
  foreign key (trend_id, org_id)
    references public.trends (id, org_id) on delete set null (trend_id)
);

create index scripts_client_idx on public.scripts (client_id, created_at desc);
create index scripts_trend_idx on public.scripts (trend_id);

-- =============================================================================
-- Pauta
-- =============================================================================

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,

  name          text not null check (length(trim(name)) between 1 and 160),
  objective     text not null check (length(trim(objective)) between 1 and 200),
  platform      app.platform not null,

  budget_cents  integer not null default 0 check (budget_cents >= 0),
  spent_cents   integer not null default 0 check (spent_cents >= 0),

  start_date    date not null,
  end_date      date not null,

  status        app.campaign_status not null default 'borrador',

  -- Qué vamos a aprender. Es obligatorio en el discurso del Pautero y opcional
  -- en la base a propósito: se escribe al planear, no al capturar el borrador.
  learning_goal text,
  result_metric text,
  -- Se llena al cerrar. Es lo que lee el Pautero para la campaña siguiente;
  -- sin esto cada campaña arranca de cero.
  learned       text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint campaigns_dates_in_order check (end_date >= start_date),
  unique (id, client_id)
);

create index campaigns_client_idx on public.campaigns (client_id, start_date desc);

comment on column public.campaigns.budget_cents is
  'Centavos, entero. Ningún agente puede moverlo: ver app.guard_budget_move().';

create table public.ad_sets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  campaign_id   uuid not null,

  name          text not null check (length(trim(name)) between 1 and 160),
  audience_type app.audience_type not null,
  -- {"intereses": ["jazz"], "edad": [25, 45], "geo": ["Tijuana"]}
  audience_def  jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(audience_def) = 'object'),

  budget_cents  integer not null default 0 check (budget_cents >= 0),
  spent_cents   integer not null default 0 check (spent_cents >= 0),

  status        app.ad_set_status not null default 'activo',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  foreign key (campaign_id, client_id)
    references public.campaigns (id, client_id) on delete cascade,
  unique (id, client_id)
);

create index ad_sets_campaign_idx on public.ad_sets (campaign_id);

-- Qué pieza del planner se está impulsando en qué ad set. No duplica el
-- creativo: apunta a la pieza, para que el reporte diga "el reel del 14" y no
-- "creativo 3".
create table public.ad_creatives (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  ad_set_id   uuid not null,
  piece_id    uuid not null,
  status      app.ad_creative_status not null default 'propuesto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,
  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete cascade,
  unique (ad_set_id, piece_id)
);

-- Métricas diarias por ad set, capturadas a mano o por CSV de Meta/TikTok.
-- Todo el dinero en centavos; ctr es un porcentaje y por eso sí es numeric.
create table public.ad_metrics (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  client_id             uuid not null references public.clients (id) on delete cascade,
  ad_set_id             uuid not null,
  date                  date not null,

  spend_cents           integer not null default 0 check (spend_cents >= 0),
  impressions           integer not null default 0 check (impressions >= 0),
  reach                 integer not null default 0 check (reach >= 0),
  clicks                integer not null default 0 check (clicks >= 0),

  ctr                   numeric(6, 3) check (ctr is null or ctr between 0 and 100),
  cpm_cents             integer check (cpm_cents is null or cpm_cents >= 0),
  cpc_cents             integer check (cpc_cents is null or cpc_cents >= 0),

  results               integer not null default 0 check (results >= 0),
  cost_per_result_cents integer check (cost_per_result_cents is null or cost_per_result_cents >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,
  -- Un día, una fila. Sin esto, reimportar el CSV duplica el gasto del mes.
  unique (ad_set_id, date)
);

create index ad_metrics_client_date_idx on public.ad_metrics (client_id, date desc);

-- -----------------------------------------------------------------------------
-- Propuestas del Pautero.
--
-- Esta tabla es el corazón del trato con el sistema: el agente propone y la
-- persona ejecuta en el ads manager. Aprobar aquí NO mueve dinero — genera
-- instrucciones. Quien las aplicó lo marca después, con hora y nota.
-- -----------------------------------------------------------------------------
create table public.ad_proposals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  campaign_id     uuid not null,
  ad_set_id       uuid,

  kind            app.ad_proposal_kind not null,
  rationale       text not null check (length(trim(rationale)) between 1 and 4000),
  expected_impact text,
  -- El riesgo va junto al impacto porque una propuesta que solo enseña lo bueno
  -- no es una recomendación, es una venta.
  risk            text,
  -- {"kind": "bajar_presupuesto", "rationale": "...", "instructions": "..."}
  alternative     jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(alternative) = 'object'),

  status          app.ad_proposal_status not null default 'propuesta',
  -- Los pasos exactos a dar en Meta/TikTok Ads. Es el entregable real de la
  -- aprobación: sin esto, "aprobado" no le dice a nadie qué hacer.
  instructions    text,

  approved_by     uuid references auth.users (id) on delete set null,
  applied_at      timestamptz,
  applied_note    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (campaign_id, client_id)
    references public.campaigns (id, client_id) on delete cascade,
  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,

  constraint ad_proposals_decision_has_author
    check (
      status in ('propuesta', 'rechazada')
      or approved_by is not null
    ),
  constraint ad_proposals_approval_has_instructions
    check (
      status in ('propuesta', 'rechazada')
      or (instructions is not null and length(trim(instructions)) > 0)
    ),
  constraint ad_proposals_applied_has_time
    check (status <> 'aplicada' or applied_at is not null)
);

create index ad_proposals_campaign_idx on public.ad_proposals (campaign_id, created_at desc);
create index ad_proposals_open_idx
  on public.ad_proposals (client_id, created_at desc)
  where status = 'propuesta';

-- =============================================================================
-- Pendientes y eventos
-- =============================================================================

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 300),
  depends_on  app.task_owner not null default 'yo',
  status      app.task_status not null default 'pendiente',
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_client_open_idx
  on public.tasks (client_id, due_date nulls last)
  where status <> 'hecha';

-- Sesiones de foto, coberturas, visitas. Van aparte de las tareas porque tienen
-- lugar y hora y se planean con el cliente, no se "cierran".
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 300),
  scheduled_on  date not null,
  place         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index events_client_idx on public.events (client_id, scheduled_on);

-- =============================================================================
-- La regla que no se negocia: aprobar no mueve dinero.
--
-- El riesgo real no es que hoy exista código que mueva un presupuesto al
-- aprobar — no existe. Es que dentro de seis meses alguien escriba un trigger
-- "de conveniencia" que sincronice la propuesta con la campaña, y que eso pase
-- desapercibido en un review. Estos dos triggers hacen que ese código falle a
-- la primera, en la base, con un mensaje que dice exactamente por qué.
--
-- Cómo funciona: aprobar marca la transacción. Mientras esa marca esté puesta,
-- cualquier UPDATE que cambie `budget_cents` en campaigns o ad_sets truena. Y a
-- la inversa: no se puede aprobar en una transacción donde ya se movió un
-- presupuesto, para que no baste con invertir el orden de los statements.
--
-- Marcar la propuesta como 'aplicada' NO cuenta como aprobar: en ese momento la
-- persona ya hizo el cambio en el ads manager y viene a registrar la realidad,
-- que muchas veces incluye el presupuesto nuevo.
-- =============================================================================

create or replace function app.guard_proposal_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('aprobada', 'aprobada_alternativa')
     and new.status is distinct from old.status then

    if coalesce(current_setting('app.budget_touched', true), '')
       = pg_current_xact_id()::text then
      raise exception
        'No se puede aprobar una propuesta en la misma transacción en que se movió un presupuesto. El agente propone; la persona ejecuta en el ads manager.';
    end if;

    perform set_config('app.approving_proposal', pg_current_xact_id()::text, true);
  end if;

  return new;
end;
$$;

create or replace function app.guard_budget_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.budget_cents is distinct from old.budget_cents then

    if coalesce(current_setting('app.approving_proposal', true), '')
       = pg_current_xact_id()::text then
      raise exception
        'Aprobar una propuesta no puede mover el presupuesto de % (% → %). El cambio se hace en el ads manager y se registra marcando la propuesta como aplicada.',
        tg_table_name, old.budget_cents, new.budget_cents;
    end if;

    perform set_config('app.budget_touched', pg_current_xact_id()::text, true);
  end if;

  return new;
end;
$$;

comment on function app.guard_budget_move() is
  'Impide que aprobar una propuesta del Pautero mueva un presupuesto. Es tu dinero y el del cliente: ningún agente lo toca.';

create trigger ad_proposals_approval_guard before update on public.ad_proposals
  for each row execute function app.guard_proposal_approval();

create trigger campaigns_budget_guard before update on public.campaigns
  for each row execute function app.guard_budget_move();

create trigger ad_sets_budget_guard before update on public.ad_sets
  for each row execute function app.guard_budget_move();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.social_accounts enable row level security;
alter table public.account_audits  enable row level security;
alter table public.results_monthly enable row level security;
alter table public.results_piece   enable row level security;
alter table public.volume_plans    enable row level security;
alter table public.key_dates       enable row level security;
alter table public.trends          enable row level security;
alter table public.scripts         enable row level security;
alter table public.campaigns       enable row level security;
alter table public.ad_sets         enable row level security;
alter table public.ad_creatives    enable row level security;
alter table public.ad_metrics      enable row level security;
alter table public.ad_proposals    enable row level security;
alter table public.tasks           enable row level security;
alter table public.events          enable row level security;

alter table public.social_accounts force row level security;
alter table public.account_audits  force row level security;
alter table public.results_monthly force row level security;
alter table public.results_piece   force row level security;
alter table public.volume_plans    force row level security;
alter table public.key_dates       force row level security;
alter table public.trends          force row level security;
alter table public.scripts         force row level security;
alter table public.campaigns       force row level security;
alter table public.ad_sets         force row level security;
alter table public.ad_creatives    force row level security;
alter table public.ad_metrics      force row level security;
alter table public.ad_proposals    force row level security;
alter table public.tasks           force row level security;
alter table public.events          force row level security;

-- --- Interno del estudio ------------------------------------------------------
-- Ninguna de estas tiene política para el portal, y esa ausencia es la política:
-- sin renglón que lo permita, RLS niega. El cliente no ve la maquinaria.

create policy "social_accounts: solo el estudio"
  on public.social_accounts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "account_audits: el estudio lee"
  on public.account_audits for select to authenticated
  using (app.is_staff_of_client(client_id));

create policy "results_piece: solo el estudio"
  on public.results_piece for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "scripts: solo el estudio"
  on public.scripts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "tasks: solo el estudio"
  on public.tasks for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "events: solo el estudio"
  on public.events for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- El radar es del estudio completo, no de un cliente: por eso va por membresía
-- de org. Es la única tabla del archivo cuya RLS no menciona client_id.
create policy "trends: el radar es de toda la org"
  on public.trends for all to authenticated
  using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

-- --- Compartido con el portal --------------------------------------------------

create policy "results_monthly: el estudio tiene control total"
  on public.results_monthly for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Los resultados del mes son la razón por la que el cliente entra al portal.
create policy "results_monthly: el portal lee"
  on public.results_monthly for select to authenticated
  using (app.is_portal_user_of_client(client_id));

create policy "key_dates: el estudio tiene control total"
  on public.key_dates for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "key_dates: el portal lee"
  on public.key_dates for select to authenticated
  using (app.is_portal_user_of_client(client_id));

create policy "volume_plans: el estudio tiene control total"
  on public.volume_plans for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Solo lo aprobado. Un plan en borrador enseña conteos que todavía se están
-- discutiendo internamente; que el cliente los vea antes de tiempo convierte
-- una propuesta en un compromiso.
create policy "volume_plans: el portal lee solo lo aprobado"
  on public.volume_plans for select to authenticated
  using (
    app.is_portal_user_of_client(client_id)
    and approved_at is not null
  );

-- --- Pauta ---------------------------------------------------------------------

create policy "campaigns: solo el estudio"
  on public.campaigns for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_sets: solo el estudio"
  on public.ad_sets for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_creatives: solo el estudio"
  on public.ad_creatives for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_metrics: solo el estudio"
  on public.ad_metrics for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_proposals: el estudio lee"
  on public.ad_proposals for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Las propuestas las escribe el Pautero con service_role. Desde el navegador
-- solo se decide sobre ellas; nadie se auto-propone un movimiento de dinero.
create policy "ad_proposals: el estudio decide"
  on public.ad_proposals for update to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- =============================================================================
-- Vista de campañas para el cliente.
--
-- El portal necesita ver que hay pauta corriendo, pero no el presupuesto, ni lo
-- gastado, ni lo que el estudio está aprendiendo de su cuenta.
--
-- Postgres filtra renglones (RLS), no columnas: los GRANT por columna existen
-- pero son por ROL, y aquí el usuario del portal y el del estudio son el mismo
-- rol `authenticated` — distinguirlos por columna es imposible. Por eso la
-- vista NO es security_invoker: corre como su dueño, se salta la RLS de
-- campaigns y hace su propio filtro por portal. Es la única forma de dar acceso
-- a un subconjunto de columnas y a la vez no dar acceso a la tabla.
--
-- La contraparte de esa decisión: `public.campaigns` no tiene NINGUNA política
-- para el portal. Si algún día se agrega, la restricción por columna se cae y
-- esta vista deja de servir para nada.
-- =============================================================================
create view public.campaigns_para_cliente
with (security_barrier = true)
as
  select
    c.id,
    c.client_id,
    c.name,
    c.objective,
    c.platform,
    c.start_date,
    c.end_date,
    c.status,
    c.result_metric
  from public.campaigns c
  where app.is_portal_user_of_client(c.client_id);

comment on view public.campaigns_para_cliente is
  'Campañas en versión simple para el portal: sin presupuesto, sin gasto y sin el aprendizaje interno del estudio.';

-- =============================================================================
-- Permisos. RLS filtra renglones; el GRANT decide si la tabla existe para el
-- rol. `anon` no recibe nada en ninguna de las dos capas.
-- =============================================================================

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select                        on public.account_audits  to authenticated;
grant select, insert, update, delete on public.results_monthly to authenticated;
grant select, insert, update, delete on public.results_piece   to authenticated;
grant select, insert, update, delete on public.volume_plans    to authenticated;
grant select, insert, update, delete on public.key_dates       to authenticated;
grant select, insert, update, delete on public.trends          to authenticated;
grant select, insert, update, delete on public.scripts         to authenticated;
grant select, insert, update, delete on public.campaigns       to authenticated;
grant select, insert, update, delete on public.ad_sets         to authenticated;
grant select, insert, update, delete on public.ad_creatives    to authenticated;
grant select, insert, update, delete on public.ad_metrics      to authenticated;
grant select, update                 on public.ad_proposals    to authenticated;
grant select, insert, update, delete on public.tasks           to authenticated;
grant select, insert, update, delete on public.events          to authenticated;

grant select on public.campaigns_para_cliente to authenticated;

-- =============================================================================
-- Triggers de mantenimiento
-- =============================================================================

create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function app.touch_updated_at();
create trigger results_monthly_touch before update on public.results_monthly
  for each row execute function app.touch_updated_at();
create trigger volume_plans_touch before update on public.volume_plans
  for each row execute function app.touch_updated_at();
create trigger key_dates_touch before update on public.key_dates
  for each row execute function app.touch_updated_at();
create trigger trends_touch before update on public.trends
  for each row execute function app.touch_updated_at();
create trigger scripts_touch before update on public.scripts
  for each row execute function app.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
  for each row execute function app.touch_updated_at();
create trigger ad_sets_touch before update on public.ad_sets
  for each row execute function app.touch_updated_at();
create trigger ad_creatives_touch before update on public.ad_creatives
  for each row execute function app.touch_updated_at();
create trigger ad_metrics_touch before update on public.ad_metrics
  for each row execute function app.touch_updated_at();
create trigger ad_proposals_touch before update on public.ad_proposals
  for each row execute function app.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function app.touch_updated_at();

-- Coherencia de tenencia en toda tabla con client_id. `trends` no lleva: es de
-- la org y no cuelga de ningún cliente.
create trigger social_accounts_org_guard before insert or update on public.social_accounts
  for each row execute function app.enforce_client_org();
create trigger account_audits_org_guard before insert or update on public.account_audits
  for each row execute function app.enforce_client_org();
create trigger results_monthly_org_guard before insert or update on public.results_monthly
  for each row execute function app.enforce_client_org();
create trigger results_piece_org_guard before insert or update on public.results_piece
  for each row execute function app.enforce_client_org();
create trigger volume_plans_org_guard before insert or update on public.volume_plans
  for each row execute function app.enforce_client_org();
create trigger key_dates_org_guard before insert or update on public.key_dates
  for each row execute function app.enforce_client_org();
create trigger scripts_org_guard before insert or update on public.scripts
  for each row execute function app.enforce_client_org();
create trigger campaigns_org_guard before insert or update on public.campaigns
  for each row execute function app.enforce_client_org();
create trigger ad_sets_org_guard before insert or update on public.ad_sets
  for each row execute function app.enforce_client_org();
create trigger ad_creatives_org_guard before insert or update on public.ad_creatives
  for each row execute function app.enforce_client_org();
create trigger ad_metrics_org_guard before insert or update on public.ad_metrics
  for each row execute function app.enforce_client_org();
create trigger ad_proposals_org_guard before insert or update on public.ad_proposals
  for each row execute function app.enforce_client_org();
create trigger tasks_org_guard before insert or update on public.tasks
  for each row execute function app.enforce_client_org();
create trigger events_org_guard before insert or update on public.events
  for each row execute function app.enforce_client_org();
