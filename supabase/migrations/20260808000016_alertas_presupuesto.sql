-- =============================================================================
-- 0016 · Alertas de presupuesto: el registro append-only de cada cruce del tope.
--
-- El cruce del 80% ya llega a la Bandeja como escalamiento (la parte
-- accionable). Esta tabla es su contraparte inmutable: el LOG de auditoría de
-- cuándo un agente tocó su tope, cuál, cuánto llevaba gastado y contra qué tope,
-- y con qué corrida. Append-only de verdad — `authenticated` solo lee; la
-- escribe el runner con service_role, junto a la corrida que la disparó. Un
-- aviso que se puede editar o borrar no sirve como auditoría (regla #5).
-- =============================================================================

create table public.budget_alerts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  agent       app.agent_key not null,
  -- La corrida que cruzó el umbral. `set null` si algún día se purga la corrida:
  -- el aviso sobrevive a su corrida, no al revés.
  run_id      uuid references public.agent_runs (id) on delete set null,

  -- El gasto del mes TRAS la corrida que cruzó, y el tope contra el que se midió.
  -- Guardar ambos hace el aviso legible sin recomputar nada: "820¢ de 1000¢".
  spent_cents integer not null check (spent_cents >= 0),
  cap_cents   integer not null check (cap_cents >= 0),

  -- 'aviso' al tocar el 80%, 'agotado' al llegar (o pasar) el tope.
  estado      text not null check (estado in ('aviso', 'agotado')),

  created_at  timestamptz not null default now()
);

create index budget_alerts_client_idx on public.budget_alerts (client_id, created_at desc);
create index budget_alerts_agent_idx on public.budget_alerts (agent, created_at desc);

-- =============================================================================
-- RLS — solo el estudio lee, y NADIE escribe desde el navegador. FORCE para que
-- ni el dueño de la tabla la evada (lo exige rls_cobertura_test). El portal de
-- cliente no tiene ni una política: los avisos de gasto son maquinaria interna.
-- =============================================================================
alter table public.budget_alerts enable row level security;
alter table public.budget_alerts force row level security;

create policy "budget_alerts: solo el estudio lee"
  on public.budget_alerts for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Sin INSERT/UPDATE/DELETE para `authenticated`: la escribe el runner con
-- service_role. Si el navegador pudiera escribir aquí, podría fabricar o borrar
-- avisos y el log dejaría de ser confiable — que es justo lo que un log de
-- auditoría no puede permitirse.

grant select on public.budget_alerts to authenticated;

-- Coherencia org ↔ cliente, igual que en el resto del esquema: un aviso cuyo
-- org_id no corresponde a su client_id es imposible, aun con service_role.
create trigger budget_alerts_org_guard before insert or update on public.budget_alerts
  for each row execute function app.enforce_client_org();
