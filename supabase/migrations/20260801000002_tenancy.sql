-- =============================================================================
-- 0002 · Multi-tenancy y control de acceso.
--
-- Jerarquía:
--   org (agencia)  →  org_members (Ana y su equipo)
--                  →  clients      →  client_users (la gente del cliente)
--
-- Hoy solo existe una org. El diseño es multi-tenant desde el inicio porque
-- meter org_id después obliga a reescribir cada política de RLS del sistema.
--
-- Dos tipos de sujeto, con superficies distintas por completo:
--   · Miembro de la org  — ve TODOS los clientes de su org.
--   · Usuario de cliente — ve UN cliente, en modo lectura, y solo lo que ya
--     está en estado `con_cliente` o más adelante. Jamás ve notas privadas,
--     agentes, costos ni propuestas de pauta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organizaciones
-- -----------------------------------------------------------------------------
create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text not null check (length(trim(name)) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.org_members (
  org_id      uuid not null references public.orgs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        app.member_role not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- -----------------------------------------------------------------------------
-- Clientes
-- -----------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (length(trim(name)) between 1 and 120),
  handle        text,
  tier          text,
  -- Color de marca DEL CLIENTE. Es el acento del modo cliente; el rojo quemado
  -- del estudio nunca aparece de ese lado.
  brand_color   text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  timezone      text not null default 'America/Tijuana',
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, slug)
);

create index clients_org_idx on public.clients (org_id) where archived_at is null;

-- -----------------------------------------------------------------------------
-- Gente del cliente que puede entrar al portal de aprobación.
--
-- La llave es el correo, no el user_id: así el acceso funciona desde el primer
-- magic link sin un paso previo de vinculación. Supabase solo emite sesión
-- después de que la persona abrió el link en ESE buzón, así que el correo del
-- JWT está verificado.
-- -----------------------------------------------------------------------------
create table public.client_users (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  email       extensions.citext not null,
  name        text,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Revocar es poner fecha, no borrar: queremos el rastro de quién tuvo acceso.
  revoked_at  timestamptz,
  last_seen_at timestamptz,
  unique (client_id, email)
);

create index client_users_email_idx on public.client_users (email) where revoked_at is null;

-- =============================================================================
-- Funciones de acceso.
--
-- SECURITY DEFINER a propósito: leen las tablas de membresía saltándose RLS,
-- que es la única forma de evitar recursión infinita en las políticas.
-- Por eso mismo llevan search_path fijado y viven en un esquema no expuesto.
-- =============================================================================

-- Orgs donde el usuario actual es miembro del estudio.
create or replace function app.member_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id
  from public.org_members m
  where m.user_id = (select auth.uid());
$$;

create or replace function app.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- Clientes que el usuario actual puede ver COMO ESTUDIO (acceso completo).
create or replace function app.staff_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.clients c
  join public.org_members m on m.org_id = c.org_id
  where m.user_id = (select auth.uid());
$$;

-- Clientes que el usuario actual puede ver COMO CLIENTE (lectura acotada).
-- Se cruza contra el correo verificado del JWT.
create or replace function app.portal_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cu.client_id
  from public.client_users cu
  where cu.revoked_at is null
    and cu.email = ((select auth.jwt()) ->> 'email')::extensions.citext;
$$;

create or replace function app.is_staff_of_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clients c
    join public.org_members m on m.org_id = c.org_id
    where c.id = target_client
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_portal_user_of_client(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_users cu
    where cu.client_id = target_client
      and cu.revoked_at is null
      and cu.email = ((select auth.jwt()) ->> 'email')::extensions.citext
  );
$$;

revoke all on function
  app.member_org_ids(),
  app.is_org_member(uuid),
  app.is_org_owner(uuid),
  app.staff_client_ids(),
  app.portal_client_ids(),
  app.is_staff_of_client(uuid),
  app.is_portal_user_of_client(uuid)
from public, anon;

grant execute on function
  app.member_org_ids(),
  app.is_org_member(uuid),
  app.is_org_owner(uuid),
  app.staff_client_ids(),
  app.portal_client_ids(),
  app.is_staff_of_client(uuid),
  app.is_portal_user_of_client(uuid)
to authenticated;

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.clients enable row level security;
alter table public.client_users enable row level security;

-- Forzar RLS también para el dueño de la tabla. Sin esto, una conexión que
-- corra como el rol dueño (una migración, un script) evade las políticas sin
-- darse cuenta.
alter table public.orgs force row level security;
alter table public.org_members force row level security;
alter table public.clients force row level security;
alter table public.client_users force row level security;

-- --- orgs ---------------------------------------------------------------------
create policy "orgs: los miembros leen su org"
  on public.orgs for select to authenticated
  using (app.is_org_member(id));

create policy "orgs: solo el owner modifica"
  on public.orgs for update to authenticated
  using (app.is_org_owner(id))
  with check (app.is_org_owner(id));

-- Crear y borrar orgs no pasa por la API pública: es una operación de
-- aprovisionamiento que corre con service_role.

-- --- org_members ---------------------------------------------------------------
create policy "org_members: los miembros ven a su equipo"
  on public.org_members for select to authenticated
  using (app.is_org_member(org_id));

create policy "org_members: solo el owner administra el equipo"
  on public.org_members for all to authenticated
  using (app.is_org_owner(org_id))
  with check (app.is_org_owner(org_id));

-- --- clients -------------------------------------------------------------------
create policy "clients: el estudio ve a sus clientes"
  on public.clients for select to authenticated
  using (app.is_org_member(org_id));

-- El usuario del portal ve la ficha mínima de SU cliente y nada más.
-- Los campos sensibles no viven en esta tabla justamente por esto.
create policy "clients: el portal ve solo su cliente"
  on public.clients for select to authenticated
  using (app.is_portal_user_of_client(id));

create policy "clients: el estudio escribe"
  on public.clients for insert to authenticated
  with check (app.is_org_member(org_id));

create policy "clients: el estudio actualiza"
  on public.clients for update to authenticated
  using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

create policy "clients: solo el owner borra"
  on public.clients for delete to authenticated
  using (app.is_org_owner(org_id));

-- --- client_users ---------------------------------------------------------------
-- Quién tiene acceso al portal es información del estudio. El propio usuario
-- del portal NO necesita leer esta tabla, y dejarlo leerla le mostraría los
-- correos de los demás contactos del cliente.
create policy "client_users: solo el estudio"
  on public.client_users for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- =============================================================================
-- Permisos de tabla. RLS filtra renglones; los GRANT deciden si la tabla
-- siquiera existe para ese rol. Se necesitan los dos.
-- =============================================================================

grant select on public.orgs to authenticated;
grant update (name, updated_at) on public.orgs to authenticated;

grant select, insert, update, delete on public.org_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.client_users to authenticated;

-- `anon` no toca absolutamente nada. El portal de cliente exige sesión.
-- Si algún día algo necesita ser público, se otorga aquí, explícito y solo.

create trigger orgs_touch before update on public.orgs
  for each row execute function app.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function app.touch_updated_at();
