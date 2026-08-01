-- =============================================================================
-- 0004 · Marca, reglas duras y notas privadas.
--
-- Todo lo de este archivo es INTERNO DEL ESTUDIO. Ni una sola política le da
-- acceso al usuario del portal. El Context Card es el insumo de los agentes y
-- las notas privadas son de Ana y de nadie más.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Context Card, versionado.
--
-- Versionado y no editable en sitio porque es el prompt efectivo de todos los
-- agentes: cuando una corrida sale rara, la primera pregunta es "¿con qué
-- versión del contexto corrió?" y tiene que haber respuesta.
-- -----------------------------------------------------------------------------
create table public.context_card_versions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  version       integer not null check (version > 0),

  what_it_is        text,
  positioning       text,
  differentiators   text[] not null default '{}',
  faqs              jsonb not null default '[]'::jsonb check (jsonb_typeof(faqs) = 'array'),
  audience          text,
  tone              text[] not null default '{}',
  banned_words      text[] not null default '{}',
  approved_examples text[] not null default '{}',
  cadence           text,

  -- Escrito por el Analista tras cada cierre de mes. Marcado como generado en
  -- la interfaz para que se distinga de lo que escribió una persona.
  learnings         jsonb not null default '{}'::jsonb,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (client_id, version)
);

create index context_card_current_idx
  on public.context_card_versions (client_id, version desc);

-- -----------------------------------------------------------------------------
-- Reglas duras.
--
-- `check_by = 'codigo'` significa que la regla se evalúa de forma determinista
-- y NO pasa por un modelo. Conteo de hashtags, minúsculas, palabra prohibida
-- presente. Un modelo se puede convencer; un CHECK no.
-- -----------------------------------------------------------------------------
create table public.brand_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  kind        text not null,
  rule        text not null check (length(trim(rule)) between 1 and 500),
  severity    app.rule_severity not null default 'media',
  check_by    app.rule_check not null default 'modelo',
  -- Parámetros de la verificación por código: {"exact": 5} para hashtags.
  params      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index brand_rules_client_idx on public.brand_rules (client_id) where active;

-- -----------------------------------------------------------------------------
-- Archivos y accesos.
--
-- Solo links. Ninguna credencial vive en esta base: la tarjeta de "Accesos"
-- guarda la URL del gestor de contraseñas y nada más. Un CHECK lo hace
-- explícito para que nadie meta una contraseña en `notes` "de rapidez".
-- -----------------------------------------------------------------------------
create table public.brand_assets (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  kind        text not null,
  name        text not null,
  url         text check (url is null or url ~ '^https?://'),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.brand_assets is
  'Solo links y metadatos. Las contraseñas viven en el gestor del estudio, jamás aquí.';

create index brand_assets_client_idx on public.brand_assets (client_id);

-- -----------------------------------------------------------------------------
-- Notas privadas. La tabla con la superficie de acceso más chica del sistema.
-- -----------------------------------------------------------------------------
create table public.private_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index private_notes_author_idx on public.private_notes (client_id, author_id);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.context_card_versions enable row level security;
alter table public.brand_rules           enable row level security;
alter table public.brand_assets          enable row level security;
alter table public.private_notes         enable row level security;

alter table public.context_card_versions force row level security;
alter table public.brand_rules           force row level security;
alter table public.brand_assets          force row level security;
alter table public.private_notes         force row level security;

create policy "context_card: solo el estudio, lectura"
  on public.context_card_versions for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Append-only: una versión nueva se agrega, nunca se corrige la anterior.
create policy "context_card: solo el estudio, alta"
  on public.context_card_versions for insert to authenticated
  with check (app.is_staff_of_client(client_id));

create policy "brand_rules: solo el estudio"
  on public.brand_rules for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "brand_assets: solo el estudio"
  on public.brand_assets for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Privado es privado incluso dentro del estudio: cada quien ve las suyas.
create policy "private_notes: solo quien las escribió"
  on public.private_notes for all to authenticated
  using (
    author_id = (select auth.uid())
    and app.is_staff_of_client(client_id)
  )
  with check (
    author_id = (select auth.uid())
    and app.is_staff_of_client(client_id)
  );

grant select, insert on public.context_card_versions to authenticated;
grant select, insert, update, delete on public.brand_rules to authenticated;
grant select, insert, update, delete on public.brand_assets to authenticated;
grant select, insert, update, delete on public.private_notes to authenticated;

create trigger brand_rules_touch before update on public.brand_rules
  for each row execute function app.touch_updated_at();
create trigger brand_assets_touch before update on public.brand_assets
  for each row execute function app.touch_updated_at();
create trigger private_notes_touch before update on public.private_notes
  for each row execute function app.touch_updated_at();

create trigger context_card_org_guard before insert or update on public.context_card_versions
  for each row execute function app.enforce_client_org();
create trigger brand_rules_org_guard before insert or update on public.brand_rules
  for each row execute function app.enforce_client_org();
create trigger brand_assets_org_guard before insert or update on public.brand_assets
  for each row execute function app.enforce_client_org();
create trigger private_notes_org_guard before insert or update on public.private_notes
  for each row execute function app.enforce_client_org();
