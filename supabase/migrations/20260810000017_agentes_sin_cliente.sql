-- =============================================================================
-- 0017 · client_id opcional en la capa de agentes.
--
-- Hasta hoy toda corrida de agente es de un cliente. Pero un agente de
-- investigación (resumen de video, research general) no tiene cliente hasta
-- que alguien decide para quién es — y a veces nunca lo tiene, porque es
-- investigación de la agencia. Esta migración NO agrega ese agente: solo abre
-- la posibilidad de `client_id = null` en las cuatro tablas que hoy lo exigen,
-- para que el agente que sí lo necesite (PRO-26) no tenga que pelear contra el
-- esquema.
--
-- Los 8 agentes actuales no cambian: siguen atados a un cliente en
-- `baseInput` (contracts.ts) y nada aquí los afecta en la práctica.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · client_id deja de ser obligatorio.
-- -----------------------------------------------------------------------------
alter table public.agent_policies alter column client_id drop not null;
alter table public.agent_runs      alter column client_id drop not null;
alter table public.escalations     alter column client_id drop not null;
alter table public.budget_alerts   alter column client_id drop not null;

-- -----------------------------------------------------------------------------
-- 2 · El guard de coherencia org↔cliente tiene que saber que "sin cliente" es
-- un estado válido, no un cliente que no existe.
-- -----------------------------------------------------------------------------
create or replace function app.enforce_client_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owning_org uuid;
begin
  if new.client_id is null then
    return new;
  end if;

  select c.org_id into owning_org
  from public.clients c
  where c.id = new.client_id;

  if owning_org is null then
    raise exception 'El cliente % no existe.', new.client_id;
  end if;

  if new.org_id is distinct from owning_org then
    raise exception
      'org_id (%) no corresponde al cliente % (org %).',
      new.org_id, new.client_id, owning_org;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3 · Una sola política "de la agencia" (sin cliente) por agente.
--
-- `unique (client_id, agent)` no protege el caso general: Postgres trata cada
-- NULL como distinto, así que sin este índice se podrían sembrar dos filas
-- "sin cliente" para el mismo agente y el runner no sabría cuál leer.
-- -----------------------------------------------------------------------------
create unique index agent_policies_org_agent_sin_cliente_idx
  on public.agent_policies (org_id, agent)
  where client_id is null;

-- -----------------------------------------------------------------------------
-- 4 · RLS: quien puede ver una corrida sin cliente es cualquier miembro de la
-- org (no hace falta ser "staff de un cliente" porque no hay cliente). Se
-- reemplazan las políticas de lectura (y las de escritura humana) de las
-- cuatro tablas para agregar esa rama.
-- -----------------------------------------------------------------------------
drop policy "agent_policies: solo el estudio lee" on public.agent_policies;
create policy "agent_policies: solo el estudio lee"
  on public.agent_policies for select to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );

drop policy "agent_policies: solo el owner configura" on public.agent_policies;
create policy "agent_policies: solo el owner configura"
  on public.agent_policies for all to authenticated
  using (app.is_org_owner(org_id))
  with check (app.is_org_owner(org_id));

drop policy "agent_runs: solo el estudio lee" on public.agent_runs;
create policy "agent_runs: solo el estudio lee"
  on public.agent_runs for select to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );

drop policy "escalations: el estudio lee" on public.escalations;
create policy "escalations: el estudio lee"
  on public.escalations for select to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );

drop policy "escalations: el estudio resuelve" on public.escalations;
create policy "escalations: el estudio resuelve"
  on public.escalations for update to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  )
  with check (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );

drop policy "budget_alerts: solo el estudio lee" on public.budget_alerts;
create policy "budget_alerts: solo el estudio lee"
  on public.budget_alerts for select to authenticated
  using (
    (client_id is not null and app.is_staff_of_client(client_id))
    or (client_id is null and app.is_org_member(org_id))
  );
