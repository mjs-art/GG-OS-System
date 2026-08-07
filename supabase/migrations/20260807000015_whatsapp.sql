-- =============================================================================
-- 0015 · WhatsApp: conversaciones, mensajes (borrador → aprobado → enviado)
--         y retro del cliente.
--
-- Reglas del proyecto que la BASE hace cumplir aquí, no la interfaz:
--
--   #1  El agente propone, la persona ejecuta. Un mensaje saliente NO puede
--       quedar 'enviado' sin aprobación humana (nombre y hora). El webhook
--       entrante y el emisor corren con service_role; `authenticated` solo puede
--       redactar borradores y aprobarlos — nunca marcar enviado.
--   #4  Ninguna credencial vive en la base. Aquí NO hay tokens de WhatsApp:
--       el phone number id, el token, el verify token y el app secret viven en
--       .env.local. Esta migración solo guarda el número del cliente (dato de
--       contacto para enrutar) y el hilo.
--   ·   Append-only donde importa: los mensajes y la retro no se editan ni se
--       borran; la retro se resuelve.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Un hilo por cliente y número. El número en E.164 es dato de contacto, no una
-- credencial: sirve para enrutar, no da acceso a nada.
-- -----------------------------------------------------------------------------
create table public.wa_conversations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  wa_phone        text not null check (wa_phone ~ '^\+[1-9][0-9]{7,15}$'),
  display_name    text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, wa_phone)
);
create index wa_conversations_client_idx
  on public.wa_conversations (client_id, last_message_at desc);

-- -----------------------------------------------------------------------------
-- Bitácora de mensajes. Los entrantes ('received') los escribe el webhook con
-- service_role. Los salientes: 'borrador' → 'aprobado' → 'enviado' | 'fallido'.
-- -----------------------------------------------------------------------------
create table public.wa_messages (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  conversation_id   uuid not null references public.wa_conversations (id) on delete cascade,

  direction         text not null check (direction in ('inbound', 'outbound')),
  status            text not null
                      check (status in ('received', 'borrador', 'aprobado', 'enviado', 'fallido')),

  body              text,
  -- [{"kind":"image","url":"...","caption":"..."}] — el archivo vive en Storage
  -- o en un enlace; el binario NUNCA en Postgres.
  media             jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  -- Las piezas que este mensaje presenta (una propuesta). Enlaza sin duplicar.
  piece_ids         uuid[] not null default '{}',

  -- Id del proveedor, para no duplicar un webhook reintentado.
  wa_message_id     text,
  -- Qué agente redactó el borrador. null = lo escribió una persona.
  authored_by_agent app.agent_key,

  -- Regla #1: la firma de quién autorizó la salida. Ambos o ninguno.
  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,
  sent_at           timestamptz,

  created_at        timestamptz not null default now(),

  -- Un entrante no se aprueba ni se envía.
  constraint wa_inbound_sin_salida check (
    direction = 'outbound'
    or (approved_by is null and approved_at is null and sent_at is null and wa_message_id is null)
  ),
  -- Aprobado sin quién, o quién sin cuándo, es una aprobación indemostrable.
  constraint wa_aprobacion_completa check (num_nonnulls(approved_by, approved_at) <> 1),
  -- El corazón de la regla #1: un saliente 'enviado' TUVO que ser aprobado.
  -- Ni siquiera service_role puede saltarse esto: es un CHECK, no una política.
  constraint wa_enviado_exige_aprobacion check (status <> 'enviado' or approved_at is not null),
  -- Dedupe de webhooks. Los null no colisionan: los borradores aún no tienen id.
  unique (org_id, wa_message_id)
);
create index wa_messages_conv_idx on public.wa_messages (conversation_id, created_at);
create index wa_messages_pendientes_idx
  on public.wa_messages (org_id, created_at)
  where direction = 'outbound' and status = 'borrador';

-- -----------------------------------------------------------------------------
-- La RETRO del cliente. Append-only: no se edita, se RESUELVE cuando el estudio
-- ya hizo el ajuste. El cambio al copy queda además en human_edits.
-- -----------------------------------------------------------------------------
create table public.wa_feedback (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  conversation_id uuid references public.wa_conversations (id) on delete set null,
  -- De qué mensaje entrante salió la retro.
  message_id      uuid references public.wa_messages (id) on delete set null,
  -- La pieza a la que se refiere, o null si es del mes en general.
  piece_id        uuid references public.pieces (id) on delete cascade,
  month           app.month_key,

  kind            text not null default 'comentario'
                    check (kind in ('aprobacion', 'cambio', 'comentario')),
  body            text not null check (length(trim(body)) between 1 and 4000),

  resolved_at     timestamptz,
  resolved_by     uuid references auth.users (id) on delete set null,
  resolution      text,

  created_at      timestamptz not null default now()
);
create index wa_feedback_abierta_idx
  on public.wa_feedback (org_id, created_at desc)
  where resolved_at is null;

-- =============================================================================
-- RLS — solo estudio, en las tres. FORCE para que ni el dueño de la tabla lea
-- sin política (lo exige rls_cobertura_test). El portal de cliente NO tiene ni
-- una política aquí: el cliente está del otro lado de WhatsApp, no lee la app.
-- =============================================================================
alter table public.wa_conversations enable row level security;
alter table public.wa_messages       enable row level security;
alter table public.wa_feedback        enable row level security;

alter table public.wa_conversations force row level security;
alter table public.wa_messages       force row level security;
alter table public.wa_feedback        force row level security;

create policy "wa_conversations: el estudio lee"
  on public.wa_conversations for select to authenticated
  using (app.is_staff_of_client(client_id));
create policy "wa_conversations: el estudio inicia un hilo"
  on public.wa_conversations for insert to authenticated
  with check (app.is_staff_of_client(client_id));
create policy "wa_conversations: el estudio actualiza"
  on public.wa_conversations for update to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "wa_messages: el estudio lee"
  on public.wa_messages for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Una persona solo puede meter un BORRADOR saliente. Los entrantes y los
-- borradores de agente entran por service_role (webhook / runner).
create policy "wa_messages: el estudio redacta un borrador"
  on public.wa_messages for insert to authenticated
  with check (
    app.is_staff_of_client(client_id)
    and direction = 'outbound'
    and status = 'borrador'
    and approved_by is null
    and approved_at is null
    and sent_at is null
    and wa_message_id is null
    and authored_by_agent is null
  );

-- El estudio APRUEBA firmando con su propio uid, pero no puede marcar 'enviado'
-- ni sellar sent_at: eso lo hace el emisor con service_role. El `with check`
-- deja el status solo en borrador/aprobado y sent_at en null, así que "aprobar"
-- y "enviar" quedan separados de verdad, sin necesidad de un trigger.
create policy "wa_messages: el estudio aprueba"
  on public.wa_messages for update to authenticated
  using (app.is_staff_of_client(client_id) and direction = 'outbound' and sent_at is null)
  with check (
    app.is_staff_of_client(client_id)
    and status in ('borrador', 'aprobado')
    and sent_at is null
    and (approved_by is null or approved_by = (select auth.uid()))
  );

create policy "wa_feedback: el estudio lee"
  on public.wa_feedback for select to authenticated
  using (app.is_staff_of_client(client_id));
create policy "wa_feedback: el estudio registra"
  on public.wa_feedback for insert to authenticated
  with check (app.is_staff_of_client(client_id));
create policy "wa_feedback: el estudio resuelve"
  on public.wa_feedback for update to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

grant select, insert, update on public.wa_conversations to authenticated;
grant select, insert, update on public.wa_messages       to authenticated;
grant select, insert, update on public.wa_feedback        to authenticated;

-- Coherencia org ↔ cliente, igual que en el resto del esquema.
create trigger wa_conversations_org_guard before insert or update on public.wa_conversations
  for each row execute function app.enforce_client_org();
create trigger wa_messages_org_guard before insert or update on public.wa_messages
  for each row execute function app.enforce_client_org();
create trigger wa_feedback_org_guard before insert or update on public.wa_feedback
  for each row execute function app.enforce_client_org();

create trigger wa_conversations_touch before update on public.wa_conversations
  for each row execute function app.touch_updated_at();
