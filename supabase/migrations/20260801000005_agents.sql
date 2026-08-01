-- =============================================================================
-- 0005 · Agentes: políticas, corridas, escalamientos y aprendizaje.
--
-- Tres reglas de producto que la base hace cumplir, no la interfaz:
--
--   1. Un agente NUNCA ejecuta un cambio irreversible. Escribe borradores y
--      propone. La aprobación humana es un renglón aparte, con nombre y hora.
--   2. Toda corrida queda registrada con su costo, su entrada y su salida.
--      Un agente que no se puede auditar no se puede operar.
--   3. El usuario del portal no sabe que los agentes existen. Cero políticas
--      de lectura para él en todo este archivo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Política por agente y por cliente. El interruptor de apagado vive aquí.
-- -----------------------------------------------------------------------------
create table public.agent_policies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  agent           app.agent_key not null,
  enabled         boolean not null default false,
  -- Tope de gasto mensual del agente en ESTE cliente, en centavos de USD.
  -- Al alcanzarlo, el runner se niega a correr. Un bug de reintentos no debe
  -- poder costar mil dólares mientras nadie ve.
  monthly_cap_cents integer not null default 500 check (monthly_cap_cents >= 0),
  model           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, agent)
);

-- -----------------------------------------------------------------------------
-- Bitácora de corridas. Append-only.
-- -----------------------------------------------------------------------------
create table public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  agent           app.agent_key not null,
  status          app.run_status not null default 'pendiente',

  -- Qué disparó la corrida: 'manual', 'cron', 'evento'.
  trigger         text not null default 'manual',
  triggered_by    uuid references auth.users (id) on delete set null,

  -- Con qué versión del Context Card corrió. Sin esto no se puede reproducir
  -- ni explicar por qué el agente dijo lo que dijo.
  context_version integer,

  model           text,
  input           jsonb,
  output          jsonb,
  error           text,

  input_tokens    integer check (input_tokens is null or input_tokens >= 0),
  output_tokens   integer check (output_tokens is null or output_tokens >= 0),
  cost_cents      integer not null default 0 check (cost_cents >= 0),
  duration_ms     integer check (duration_ms is null or duration_ms >= 0),

  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

create index agent_runs_client_idx on public.agent_runs (client_id, started_at desc);
create index agent_runs_agent_idx on public.agent_runs (agent, started_at desc);
-- Índice que usa el chequeo de presupuesto en cada corrida.
create index agent_runs_cost_idx on public.agent_runs (client_id, agent, started_at)
  where cost_cents > 0;

-- -----------------------------------------------------------------------------
-- Escalamientos: lo que llega a la Bandeja.
--
-- Un agente que no sabe, pregunta. Escalar es el comportamiento correcto, no
-- una falla — por eso tiene su propia tabla y su propia cola.
-- -----------------------------------------------------------------------------
create table public.escalations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  agent         app.agent_key not null,
  run_id        uuid references public.agent_runs (id) on delete set null,
  piece_id      uuid references public.pieces (id) on delete cascade,

  severity      app.rule_severity not null default 'media',
  question      text not null check (length(trim(question)) between 1 and 2000),
  -- [{"key":"confirmar","label":"Confirmar"}, ...]
  options       jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),

  resolved_at   timestamptz,
  resolved_by   uuid references auth.users (id) on delete set null,
  resolution    text,

  created_at    timestamptz not null default now()
);

create index escalations_open_idx
  on public.escalations (org_id, severity, created_at desc)
  where resolved_at is null;

-- -----------------------------------------------------------------------------
-- Ediciones humanas sobre lo que escribió un agente.
--
-- Esta tabla es el activo real del sistema: cada corrección es una señal de
-- entrenamiento del criterio de la marca. Sin ella, los agentes cometen el
-- mismo error el mes que entra.
-- -----------------------------------------------------------------------------
create table public.human_edits (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  piece_id      uuid references public.pieces (id) on delete cascade,
  run_id        uuid references public.agent_runs (id) on delete set null,
  agent         app.agent_key,
  field         text not null,
  old_value     text,
  new_value     text,
  edited_by     uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

create index human_edits_client_idx on public.human_edits (client_id, created_at desc);
create index human_edits_agent_idx on public.human_edits (agent, field);

-- =============================================================================
-- RLS — solo estudio, en todas.
-- =============================================================================

alter table public.agent_policies enable row level security;
alter table public.agent_runs     enable row level security;
alter table public.escalations    enable row level security;
alter table public.human_edits    enable row level security;

alter table public.agent_policies force row level security;
alter table public.agent_runs     force row level security;
alter table public.escalations    force row level security;
alter table public.human_edits    force row level security;

create policy "agent_policies: solo el estudio lee"
  on public.agent_policies for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Encender un agente o subirle el presupuesto es decisión del owner.
create policy "agent_policies: solo el owner configura"
  on public.agent_policies for all to authenticated
  using (app.is_org_owner(org_id))
  with check (app.is_org_owner(org_id));

create policy "agent_runs: solo el estudio lee"
  on public.agent_runs for select to authenticated
  using (app.is_staff_of_client(client_id));

-- La bitácora la escribe el runner con service_role, nunca el navegador.
-- Sin INSERT/UPDATE para `authenticated`: si el cliente pudiera escribir aquí,
-- podría falsear costos y borrar el rastro de una corrida.

create policy "escalations: el estudio lee"
  on public.escalations for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Resolver un escalamiento sí es una acción humana desde la Bandeja.
create policy "escalations: el estudio resuelve"
  on public.escalations for update to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "human_edits: el estudio lee"
  on public.human_edits for select to authenticated
  using (app.is_staff_of_client(client_id));

create policy "human_edits: se registra a nombre propio"
  on public.human_edits for insert to authenticated
  with check (
    app.is_staff_of_client(client_id)
    and edited_by = (select auth.uid())
  );

grant select on public.agent_policies to authenticated;
grant insert, update, delete on public.agent_policies to authenticated;
grant select on public.agent_runs to authenticated;
grant select, update on public.escalations to authenticated;
grant select, insert on public.human_edits to authenticated;

create trigger agent_policies_touch before update on public.agent_policies
  for each row execute function app.touch_updated_at();

create trigger agent_policies_org_guard before insert or update on public.agent_policies
  for each row execute function app.enforce_client_org();
create trigger agent_runs_org_guard before insert or update on public.agent_runs
  for each row execute function app.enforce_client_org();
create trigger escalations_org_guard before insert or update on public.escalations
  for each row execute function app.enforce_client_org();
create trigger human_edits_org_guard before insert or update on public.human_edits
  for each row execute function app.enforce_client_org();

-- -----------------------------------------------------------------------------
-- Gasto del mes por agente y cliente. El runner consulta esto ANTES de cada
-- llamada y se detiene si ya se pasó del tope.
-- -----------------------------------------------------------------------------
create or replace function app.agent_spend_cents_this_month(
  target_client uuid,
  target_agent app.agent_key
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(r.cost_cents), 0)::integer
  from public.agent_runs r
  where r.client_id = target_client
    and r.agent = target_agent
    and r.started_at >= date_trunc('month', now());
$$;

grant execute on function app.agent_spend_cents_this_month(uuid, app.agent_key)
  to authenticated, service_role;
