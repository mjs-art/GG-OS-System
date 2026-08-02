-- =============================================================================
-- 0012 · Sembrar las agent_policies al dar de alta un cliente.
--
-- Un cliente sin renglón de política por agente es un cliente roto: el switch
-- de "encender agente" hace un UPDATE que afecta cero renglones y regresa en
-- silencio (Postgres no lanza error con un UPDATE filtrado por RLS). El seed lo
-- resolvía a mano con un `unnest(enum_range(...))`; en producción no hay seed.
--
-- Por qué un trigger y no TypeScript: `agent_policies` solo deja INSERTAR al
-- owner (agents.sql). El alta de clientes la puede hacer cualquier miembro del
-- estudio, así que sembrar las policies desde la sesión fallaría para un staff.
-- Meterlo por el cliente admin en una ruta de usuario está prohibido (ESLint).
-- La regla vive donde debe: en la base. La función es SECURITY DEFINER —dueño
-- `postgres`, que saltea RLS y FORCE igual que el resto de funciones de `app`—
-- así que siembra sin depender del rol de quien insertó el cliente.
-- =============================================================================

create or replace function app.seed_agent_policies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Las ocho, APAGADAS y con el tope por default (500¢). Encender cada una es
  -- una decisión consciente y aparte, exactamente como en el seed.
  insert into public.agent_policies (org_id, client_id, agent, enabled, monthly_cap_cents)
  select new.org_id, new.id, a, false, 500
  from unnest(enum_range(null::app.agent_key)) as a
  on conflict (client_id, agent) do nothing;

  return new;
end;
$$;

create trigger clients_seed_agent_policies
  after insert on public.clients
  for each row execute function app.seed_agent_policies();
