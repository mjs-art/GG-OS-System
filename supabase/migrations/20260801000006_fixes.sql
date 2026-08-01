-- =============================================================================
-- 0006 · Dos correcciones que salieron al escribir los contratos de agentes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · El tope de gasto contaba el mes en UTC.
--
-- `date_trunc('month', now())` corta el mes en UTC, pero todo el sistema opera
-- en la zona del cliente. Una corrida del 30 de septiembre a las 5 pm en
-- Tijuana ya es 1 de octubre en UTC: contaba contra el mes equivocado, así que
-- en los bordes de mes el tope se rebasaba o bloqueaba de más.
--
-- El corte ahora usa la zona horaria del propio cliente.
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
  join public.clients c on c.id = r.client_id
  where r.client_id = target_client
    and r.agent = target_agent
    and r.started_at >= (
      date_trunc('month', timezone(c.timezone, now())) at time zone c.timezone
    );
$$;

comment on function app.agent_spend_cents_this_month(uuid, app.agent_key) is
  'Gasto del mes en curso, cortado en la zona horaria del cliente. El runner lo consulta antes de cada llamada.';

-- -----------------------------------------------------------------------------
-- 2 · El Analista escribe de vuelta al Context Card, pero no había cómo saberlo.
--
-- `created_by` apunta a auth.users, y una corrida de agente corre con
-- service_role: dejaba el renglón sin autor. Sin esta columna la interfaz no
-- puede pintar el chip de procedencia, y el bloque "Aprendizaje" se vería como
-- si lo hubiera escrito una persona.
-- -----------------------------------------------------------------------------
alter table public.context_card_versions
  add column created_by_agent app.agent_key,
  add column created_by_run uuid references public.agent_runs (id) on delete set null;

-- Una versión la escribe una persona o un agente. Las dos a la vez no
-- significa nada, y ninguna de las dos deja el renglón sin dueño.
alter table public.context_card_versions
  add constraint context_card_has_one_author
  check (num_nonnulls(created_by, created_by_agent) = 1);

comment on column public.context_card_versions.created_by_agent is
  'Si la versión la escribió un agente. Excluyente con created_by.';
