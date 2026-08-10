-- =============================================================================
-- 0019 · El agente investigador: resume un video de YouTube y propone acciones.
--
-- A diferencia de los otros ocho, no está atado a un cliente: `client_id` es
-- opcional en su entrada (migración 0017 ya lo permite en toda la capa de
-- agentes). Si al correrlo se elige un cliente, el resultado queda marcado con
-- ese cliente desde el inicio — no hay "atribuir después": `video_summaries`
-- es append-only, igual que `agent_runs`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · El resultado persistido. `agent_runs.output` ya lo guarda validado, pero
-- no es consultable (jsonb sin índice útil); esta tabla es la que se lee para
-- pintar la lista de investigaciones.
-- -----------------------------------------------------------------------------
create table public.video_summaries (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  run_id            uuid not null references public.agent_runs (id) on delete cascade,
  -- Nulo = investigación general. Se fija al correr el agente, no se reasigna.
  client_id         uuid references public.clients (id) on delete cascade,

  youtube_url       text not null check (youtube_url ~ '^https?://'),
  video_title       text,
  transcript        text not null check (length(trim(transcript)) > 0),
  summary           text not null check (length(trim(summary)) > 0),
  key_points        jsonb not null default '[]'::jsonb check (jsonb_typeof(key_points) = 'array'),
  suggested_actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(suggested_actions) = 'array'),

  created_at        timestamptz not null default now()
);

create index video_summaries_org_idx on public.video_summaries (org_id, created_at desc);
create index video_summaries_client_idx on public.video_summaries (client_id, created_at desc)
  where client_id is not null;

alter table public.video_summaries enable row level security;
alter table public.video_summaries force row level security;

-- Solo el estudio lee, con o sin cliente asociado — regla #3: el portal de
-- cliente no tiene ni una política aquí, esto es maquinaria interna.
create policy "video_summaries: solo el estudio lee"
  on public.video_summaries for select to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );

-- Sin INSERT/UPDATE/DELETE para `authenticated`: lo escribe el compositor con
-- service_role, junto con la corrida que lo produjo. Append-only de verdad.
grant select on public.video_summaries to authenticated;

create trigger video_summaries_org_guard before insert or update on public.video_summaries
  for each row execute function app.enforce_client_org();

-- -----------------------------------------------------------------------------
-- 2 · Sembrar la política del investigador.
--
-- Por cliente: `seed_agent_policies()` ya lo hace solo para clientes nuevos
-- (recorre `enum_range` sobre `app.agent_key`, que ya incluye 'investigador'
-- desde 0018) — esto es el backfill de los que ya existían.
-- -----------------------------------------------------------------------------
insert into public.agent_policies (org_id, client_id, agent, enabled, monthly_cap_cents)
select org_id, id, 'investigador', false, 500
from public.clients
on conflict (client_id, agent) do nothing;

-- Por org, sin cliente — la política "de investigación general". Una por org,
-- protegida por el índice único parcial de la migración 0017.
insert into public.agent_policies (org_id, client_id, agent, enabled, monthly_cap_cents)
select id, null, 'investigador', false, 500
from public.orgs
on conflict (org_id, agent) where client_id is null do nothing;
