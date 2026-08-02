-- =============================================================================
-- 0013 · Notas de marca y edición de reglas.
--
-- Agrega un bloque de texto libre para referencias, briefs, notas de marca
-- que el equipo comparte. Visibilidad del estudio, no del portal.
-- =============================================================================

create table public.brand_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  body        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index brand_notes_client_idx on public.brand_notes (client_id);

alter table public.brand_notes enable row level security;
alter table public.brand_notes force row level security;

create policy "brand_notes: solo el estudio"
  on public.brand_notes for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

grant select, insert, update, delete on public.brand_notes to authenticated;

create trigger brand_notes_touch before update on public.brand_notes
  for each row execute function app.touch_updated_at();
create trigger brand_notes_org_guard before insert or update on public.brand_notes
  for each row execute function app.enforce_client_org();
