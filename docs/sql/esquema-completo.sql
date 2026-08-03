-- =============================================================================
-- STUDIO OS · ESQUEMA COMPLETO
--
-- Las 15 migraciones concatenadas en orden, para pegar en el editor SQL de
-- Supabase cuando la CLI no esté disponible.
--
-- ESTO ES UN RESPALDO, NO LA FUENTE DE VERDAD.
--
-- La forma correcta de aplicar cambios es la CLI:
--
--     supabase link --project-ref <ref>
--     supabase db push
--
-- Se genera con `pnpm sql:bundle`. Si lo editas a mano, la próxima
-- generación se lo lleva.
--
-- CÓMO USARLO
--
--   · Base VACÍA: pega todo de corrido.
--   · Base que YA tiene parte aplicada: NO pegues todo. Revisa antes cuáles
--     faltan con `supabase migration list`, o en el panel:
--     Database → Migrations. Pegar una ya aplicada truena en el primer
--     `create table` que exista — molesto pero no destructivo, porque
--     ninguna de estas migraciones borra nada.
--   · Después de pegar, corre el INSERT del final o la CLI va a querer
--     aplicarlas otra vez.
--
-- Lo que NO incluye, a propósito:
--   · `supabase/seed.sql` — datos FICTICIOS de desarrollo. No van a producción.
--   · La configuración de auth (site_url, redirect URLs, registro cerrado).
--     Vive en el panel, no en SQL.
-- =============================================================================


-- =============================================================================
-- 20260801000001_foundation.sql
-- =============================================================================

-- =============================================================================
-- 0001 · Cimientos: extensiones, esquema privado, tipos y utilidades.
--
-- Postura de seguridad de todo el esquema:
--   · RLS ENCENDIDO en cada tabla, sin excepción, incluidas las de catálogo.
--   · Sin políticas permisivas por default: si no hay política, nadie ve nada.
--   · Toda función de ayuda vive en el esquema `app`, que NO se expone por
--     PostgREST, es SECURITY DEFINER y trae search_path fijado.
--   · `anon` y `authenticated` no reciben permisos por default: se otorgan
--     tabla por tabla y columna por columna donde hace falta.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- -----------------------------------------------------------------------------
-- Esquema privado. Nada aquí se expone por la API.
-- -----------------------------------------------------------------------------
create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- Cortar el default de Postgres de que cualquiera puede crear en `public`.
revoke create on schema public from public;

-- No conceder nada automáticamente sobre objetos futuros: cada grant se escribe
-- a mano donde se necesita.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos del dominio. Un enum es una regla de negocio que la base hace cumplir;
-- un `text` con valores válidos "por convención" es un bug esperando su turno.
-- -----------------------------------------------------------------------------

create type app.member_role as enum ('owner', 'staff');

create type app.platform as enum ('instagram', 'facebook', 'tiktok', 'linkedin');

create type app.piece_format as enum ('post', 'carrusel', 'reel');

create type app.piece_status as enum (
  'idea',
  'escrito',
  'revisado',
  'con_cliente',
  'aprobado',
  'publicado'
);

create type app.story_kind as enum ('diaria', 'campana', 'interactiva');

create type app.asset_status as enum ('pendiente', 'recibido');

create type app.rule_severity as enum ('critica', 'alta', 'media', 'baja');

-- Quién verifica la regla. `codigo` = determinista, se corre sin modelo y no
-- se puede "convencer". `modelo` = juicio, siempre revisable por humano.
create type app.rule_check as enum ('codigo', 'modelo');

create type app.agent_key as enum (
  'estratega',
  'analista',
  'guionista',
  'redactor',
  'editor_marca',
  'pautero',
  'auditor',
  'cuenta'
);

create type app.run_status as enum ('pendiente', 'corriendo', 'ok', 'error', 'cancelada');

create type app.approval_decision as enum ('aprobado', 'cambios');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- `updated_at` mantenido por la base. Confiar en que la aplicación lo mande
-- siempre es confiar en que nadie va a escribir un UPDATE a mano nunca.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Un mes de planeación es 'AAAA-MM'. Se guarda como text con CHECK en lugar de
-- date para que el mes sea el identificador natural y no haya "día 1" fantasma.
create domain app.month_key as text
  check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');

comment on domain app.month_key is
  'Mes de planeación en formato AAAA-MM, por ejemplo 2026-09.';


-- =============================================================================
-- 20260801000002_tenancy.sql
-- =============================================================================

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


-- =============================================================================
-- 20260801000003_content.sql
-- =============================================================================

-- =============================================================================
-- 0003 · Contenido: pilares, piezas, stories, comentarios y aprobaciones.
--
-- La regla de negocio que más importa aquí y que la base hace cumplir sola:
-- el cliente NUNCA ve una pieza que no ha llegado a `con_cliente`. No es un
-- filtro de la interfaz — es una política de RLS. Si mañana alguien escribe
-- una consulta nueva y se le olvida el WHERE, la base lo detiene.
-- =============================================================================

-- Estados a partir de los cuales una pieza es visible para el cliente.
create or replace function app.is_client_visible(status app.piece_status)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select status in ('con_cliente', 'aprobado', 'publicado');
$$;

grant execute on function app.is_client_visible(app.piece_status) to authenticated;

-- -----------------------------------------------------------------------------
-- Pilares de contenido
-- -----------------------------------------------------------------------------
create table public.pillars (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 80),
  color       text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  target_pct  numeric(5, 2) not null default 0 check (target_pct between 0 and 100),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, name)
);

create index pillars_client_idx on public.pillars (client_id);

-- -----------------------------------------------------------------------------
-- Piezas de feed (post, carrusel, reel). Las stories son otra entidad: se
-- planean y se cuentan aparte, y mezclarlas aquí fue el error del v1.
-- -----------------------------------------------------------------------------
create table public.pieces (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  pillar_id     uuid references public.pillars (id) on delete set null,

  month         app.month_key not null,
  format        app.piece_format not null,
  status        app.piece_status not null default 'idea',
  platforms     app.platform[] not null default '{}',

  publish_at    timestamptz,
  -- Orden dentro del mes. El drag & drop del grid intercambia este valor entre
  -- dos piezas dentro de UNA transacción; nunca se recalcula toda la lista.
  slot_index    integer not null default 0,
  -- Pieza amarrada a su fecha: el grid se niega a moverla.
  date_locked   boolean not null default false,

  idea          text,
  hook          text,
  script        text,
  copy_in       text,
  copy_out      text,
  cta           text,
  hashtags      text[] not null default '{}',

  asset_status  app.asset_status not null default 'pendiente',
  boosted       boolean not null default false,

  -- Procedencia por campo: {"hook": "redactor", "script": "guionista"}.
  -- Cuando una persona edita un campo, su llave se borra de aquí y el cambio
  -- se registra en human_edits. Así el grid puede pintar el punto de "pasó por
  -- el pipeline sin que yo la tocara".
  authored_by   jsonb not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Publicada sin fecha es un dato roto que rompe el planner y los reportes.
  constraint pieces_published_needs_date
    check (status <> 'publicado' or publish_at is not null)
);

create index pieces_client_month_idx on public.pieces (client_id, month, slot_index);
create index pieces_client_status_idx on public.pieces (client_id, status);
create index pieces_publish_idx on public.pieces (client_id, publish_at desc nulls last);

-- -----------------------------------------------------------------------------
-- Stories
-- -----------------------------------------------------------------------------
create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  month         app.month_key not null,
  scheduled_on  date not null,
  kind          app.story_kind not null default 'diaria',
  status        app.piece_status not null default 'idea',
  -- [{"copy": "...", "sticker": "encuesta"}]
  slides        jsonb not null default '[]'::jsonb check (jsonb_typeof(slides) = 'array'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index stories_client_month_idx on public.stories (client_id, month, scheduled_on);

-- -----------------------------------------------------------------------------
-- Comentarios del cliente sobre una pieza.
-- Es la ÚNICA tabla de contenido donde el cliente puede escribir.
-- -----------------------------------------------------------------------------
create table public.piece_comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  piece_id    uuid not null references public.pieces (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  -- Se congela en el insert. Si mañana esa persona deja de ser del cliente,
  -- el comentario histórico no debe cambiar de bando.
  from_client boolean not null,
  body        text not null check (length(trim(body)) between 1 and 4000),
  created_at  timestamptz not null default now()
);

create index piece_comments_piece_idx on public.piece_comments (piece_id, created_at);

-- -----------------------------------------------------------------------------
-- Aprobaciones. Append-only: se registra cada decisión, nunca se sobrescribe.
-- "Ya lo habías aprobado" tiene que ser demostrable.
-- -----------------------------------------------------------------------------
create table public.approvals (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  piece_id    uuid not null references public.pieces (id) on delete cascade,
  decided_by  uuid not null references auth.users (id) on delete cascade,
  decision    app.approval_decision not null,
  note        text check (note is null or length(note) <= 4000),
  created_at  timestamptz not null default now(),

  -- Pedir un cambio sin decir cuál no le sirve a nadie.
  constraint approvals_change_needs_note
    check (decision <> 'cambios' or (note is not null and length(trim(note)) > 0))
);

create index approvals_piece_idx on public.approvals (piece_id, created_at desc);

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.pillars        enable row level security;
alter table public.pieces         enable row level security;
alter table public.stories        enable row level security;
alter table public.piece_comments enable row level security;
alter table public.approvals      enable row level security;

alter table public.pillars        force row level security;
alter table public.pieces         force row level security;
alter table public.stories        force row level security;
alter table public.piece_comments force row level security;
alter table public.approvals      force row level security;

-- --- pillars --------------------------------------------------------------------
create policy "pillars: el estudio tiene control total"
  on public.pillars for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- El portal necesita los pilares para pintar los colores del grid.
create policy "pillars: el portal lee"
  on public.pillars for select to authenticated
  using (app.is_portal_user_of_client(client_id));

-- --- pieces ----------------------------------------------------------------------
create policy "pieces: el estudio tiene control total"
  on public.pieces for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Aquí vive la regla. Lectura, nada más, y solo de lo que ya se le mostró.
create policy "pieces: el portal lee solo lo que ya salió a revisión"
  on public.pieces for select to authenticated
  using (
    app.is_portal_user_of_client(client_id)
    and app.is_client_visible(status)
  );

-- --- stories -----------------------------------------------------------------------
create policy "stories: el estudio tiene control total"
  on public.stories for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "stories: el portal lee solo lo que ya salió a revisión"
  on public.stories for select to authenticated
  using (
    app.is_portal_user_of_client(client_id)
    and app.is_client_visible(status)
  );

-- --- piece_comments -------------------------------------------------------------
create policy "piece_comments: el estudio tiene control total"
  on public.piece_comments for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "piece_comments: el portal lee los del hilo de sus piezas"
  on public.piece_comments for select to authenticated
  using (
    app.is_portal_user_of_client(client_id)
    and exists (
      select 1 from public.pieces p
      where p.id = piece_id and app.is_client_visible(p.status)
    )
  );

-- El cliente comenta solo en sus piezas visibles, solo como él mismo, y solo
-- marcándose como cliente. Los tres WITH CHECK importan: sin el tercero podría
-- insertar un comentario haciéndose pasar por el estudio.
create policy "piece_comments: el portal comenta"
  on public.piece_comments for insert to authenticated
  with check (
    app.is_portal_user_of_client(client_id)
    and author_id = (select auth.uid())
    and from_client = true
    and exists (
      select 1 from public.pieces p
      where p.id = piece_id
        and p.client_id = piece_comments.client_id
        and app.is_client_visible(p.status)
    )
  );

-- --- approvals ---------------------------------------------------------------------
create policy "approvals: el estudio lee"
  on public.approvals for select to authenticated
  using (app.is_staff_of_client(client_id));

create policy "approvals: el estudio registra"
  on public.approvals for insert to authenticated
  with check (
    app.is_staff_of_client(client_id)
    and decided_by = (select auth.uid())
  );

create policy "approvals: el portal lee sus decisiones"
  on public.approvals for select to authenticated
  using (app.is_portal_user_of_client(client_id));

create policy "approvals: el portal decide"
  on public.approvals for insert to authenticated
  with check (
    app.is_portal_user_of_client(client_id)
    and decided_by = (select auth.uid())
    and exists (
      select 1 from public.pieces p
      where p.id = piece_id
        and p.client_id = approvals.client_id
        and app.is_client_visible(p.status)
    )
  );

-- Sin UPDATE ni DELETE para nadie: la bitácora de aprobaciones es inmutable.

-- =============================================================================
-- Permisos
-- =============================================================================

grant select, insert, update, delete on public.pillars to authenticated;
grant select, insert, update, delete on public.pieces to authenticated;
grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.piece_comments to authenticated;
grant select, insert on public.approvals to authenticated;

create trigger pillars_touch before update on public.pillars
  for each row execute function app.touch_updated_at();
create trigger pieces_touch before update on public.pieces
  for each row execute function app.touch_updated_at();
create trigger stories_touch before update on public.stories
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Coherencia de tenencia.
--
-- org_id está desnormalizado en cada tabla para que las políticas no tengan que
-- hacer join. Eso solo es seguro si es imposible que se desincronice del
-- cliente al que apunta. Este trigger lo garantiza.
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

create trigger pillars_org_guard before insert or update on public.pillars
  for each row execute function app.enforce_client_org();
create trigger pieces_org_guard before insert or update on public.pieces
  for each row execute function app.enforce_client_org();
create trigger stories_org_guard before insert or update on public.stories
  for each row execute function app.enforce_client_org();
create trigger piece_comments_org_guard before insert or update on public.piece_comments
  for each row execute function app.enforce_client_org();
create trigger approvals_org_guard before insert or update on public.approvals
  for each row execute function app.enforce_client_org();


-- =============================================================================
-- 20260801000004_brand_and_private.sql
-- =============================================================================

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


-- =============================================================================
-- 20260801000005_agents.sql
-- =============================================================================

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


-- =============================================================================
-- 20260801000006_fixes.sql
-- =============================================================================

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


-- =============================================================================
-- 20260802000007_resto_del_esquema.sql
-- =============================================================================

-- =============================================================================
-- 0007 · El resto del esquema: redes, resultados, volumen, fechas, tendencias,
--        guiones, pauta, pendientes y eventos.
--
-- Tres ideas atraviesan todo el archivo:
--
--   1. El dinero es un entero de centavos. Nunca un float. Una campaña de
--      $2,000 que se guarda como 1999.9999999 es un reporte que no cuadra y una
--      discusión con el cliente que no se puede ganar.
--   2. El agente propone, la persona ejecuta. La sección de pauta lo hace
--      cumplir con triggers, no con buena voluntad de la interfaz.
--   3. La tenencia no se puede desincronizar. `org_id` y `client_id` viajan
--      desnormalizados en cada tabla para que las políticas no hagan join, y
--      hay llaves compuestas y triggers que impiden que mientan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipos nuevos. Sin acentos ni eñes, como el resto del dominio: estos valores
-- viajan a la URL, al JSON y al CSV, y un 'promoción' con tilde termina siendo
-- tres cadenas distintas según quién lo escribió.
-- -----------------------------------------------------------------------------

create type app.metric_source as enum ('manual', 'csv', 'api');

create type app.key_date_kind as enum (
  'festividad',
  'aniversario',
  'evento',
  'promocion',
  'temporada'
);

create type app.trend_kind as enum ('audio', 'formato', 'reto', 'tema');

-- Dónde va la tendencia. Sirve para decidir si vale la pena producir: subir a
-- una tendencia en 'bajando' es llegar tarde y gastar una grabación.
create type app.trend_momentum as enum ('subiendo', 'pico', 'bajando');

create type app.script_status as enum ('propuesto', 'aceptado', 'editado', 'descartado');

create type app.campaign_status as enum ('borrador', 'activa', 'pausada', 'cerrada');

create type app.ad_set_status as enum ('activo', 'pausado', 'cerrado');

create type app.ad_creative_status as enum ('propuesto', 'activo', 'pausado');

create type app.audience_type as enum (
  'interes',
  'similares',
  'retargeting',
  'amplio',
  'personalizado'
);

-- Qué pide la propuesta. Todos son verbos que se ejecutan EN EL ADS MANAGER,
-- no en esta base: aquí solo se registra la decisión.
create type app.ad_proposal_kind as enum (
  'pausar',
  'reactivar',
  'mover_presupuesto',
  'subir_presupuesto',
  'bajar_presupuesto',
  'cambiar_creativo',
  'cambiar_publico',
  'extender',
  'cerrar'
);

-- 'aprobada_alternativa' es un estado propio y no un booleano aparte porque la
-- alternativa es OTRA instrucción: quien la aplica necesita saber cuál de las
-- dos aprobó su jefa.
create type app.ad_proposal_status as enum (
  'propuesta',
  'aprobada',
  'aprobada_alternativa',
  'rechazada',
  'aplicada'
);

-- De quién depende una tarea. Es la columna que hace útil la lista: separa lo
-- que Ana puede resolver hoy de lo que lleva cuatro días esperando al cliente.
create type app.task_owner as enum ('yo', 'cliente', 'agente');

create type app.task_status as enum ('pendiente', 'en_curso', 'bloqueada', 'hecha');

-- -----------------------------------------------------------------------------
-- Llaves compuestas sobre lo que ya existía.
--
-- No son redundantes con la PK: habilitan llaves foráneas compuestas desde las
-- tablas nuevas, que es la forma de garantizar —sin un solo trigger— que una
-- pieza referenciada pertenece al mismo cliente que la referencia.
-- -----------------------------------------------------------------------------
alter table public.pieces
  add constraint pieces_id_client_key unique (id, client_id);

-- =============================================================================
-- Salud de cuentas
-- =============================================================================

-- Retrato actual de cada red del cliente. Una fila por red, se sobrescribe en
-- cada auditoría: el histórico de la auditoría vive en account_audits, aquí
-- solo interesa "cómo está hoy" para pintar el semáforo.
create table public.social_accounts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id) on delete cascade,
  client_id           uuid not null references public.clients (id) on delete cascade,
  platform            app.platform not null,

  handle              text,
  url                 text check (url is null or url ~ '^https?://'),

  followers           integer not null default 0 check (followers >= 0),
  -- Variación del mes. Puede ser negativa: perder seguidores es un dato, no un
  -- error, y es justo el que dispara la conversación con el cliente.
  followers_delta     integer not null default 0,

  last_post_at        timestamptz,

  -- {"bio": true, "link": false, "highlights": true, "foto": true}
  profile_checklist   jsonb not null default '{}'::jsonb
                        check (jsonb_typeof(profile_checklist) = 'object'),

  unanswered_dms      integer not null default 0 check (unanswered_dms >= 0),
  unanswered_comments integer not null default 0 check (unanswered_comments >= 0),

  -- Publicaciones por semana observadas contra las comprometidas. Es un
  -- promedio, por eso numeric y no integer; no es dinero.
  posts_per_week      numeric(5, 2) not null default 0 check (posts_per_week >= 0),
  target_per_week     numeric(5, 2) not null default 0 check (target_per_week >= 0),

  checked_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (client_id, platform)
);

-- Bitácora de auditorías. Append-only: la gracia es poder decir "hace un mes
-- estabas en 40 y hoy en 72", y eso se pierde si se sobrescribe.
create table public.account_audits (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  platform    app.platform not null,
  score       smallint not null check (score between 0 and 100),
  -- [{"area": "bio", "severity": "alta", "finding": "..."}]
  findings    jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  created_at  timestamptz not null default now()
);

create index account_audits_client_idx
  on public.account_audits (client_id, platform, created_at desc);

-- =============================================================================
-- Resultados
-- =============================================================================

-- Cierre mensual por cliente. Una sola fila por mes: si hubiera dos, cualquier
-- comparación contra el mes anterior daría un número distinto según el orden.
create table public.results_monthly (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  month           app.month_key not null,

  reach           integer not null default 0 check (reach >= 0),
  impressions     integer not null default 0 check (impressions >= 0),
  saves           integer not null default 0 check (saves >= 0),
  shares          integer not null default 0 check (shares >= 0),
  interactions    integer not null default 0 check (interactions >= 0),
  -- Sin CHECK de no negativo, a propósito: un mes se pueden perder seguidores.
  new_followers   integer not null default 0,
  profile_visits  integer not null default 0 check (profile_visits >= 0),
  link_clicks     integer not null default 0 check (link_clicks >= 0),

  -- Arrancamos capturando a mano y por CSV. Guardar de dónde salió el número
  -- es lo que permite, el día que entre la API, saber qué revisar.
  source          app.metric_source not null default 'manual',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (client_id, month)
);

-- Resultados por pieza. La FK compuesta contra (id, client_id) impide medir una
-- pieza de otro cliente, que es como se contamina un reporte sin que se note.
create table public.results_piece (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  piece_id      uuid not null,

  reach         integer not null default 0 check (reach >= 0),
  impressions   integer not null default 0 check (impressions >= 0),
  saves         integer not null default 0 check (saves >= 0),
  shares        integer not null default 0 check (shares >= 0),
  interactions  integer not null default 0 check (interactions >= 0),

  measured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),

  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete cascade,
  -- Se puede medir la misma pieza varias veces, pero no dos veces el mismo
  -- instante: eso siempre es un doble envío del importador.
  unique (piece_id, measured_at)
);

create index results_piece_client_idx on public.results_piece (client_id, measured_at desc);

-- =============================================================================
-- Volumen del mes
-- =============================================================================

-- El plan del Estratega. `rationale` guarda la razón por renglón CON la métrica
-- que la respalda: un plan de volumen sin el porqué es un número que nadie
-- puede defender frente al cliente el día que pregunte.
create table public.volume_plans (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.orgs (id) on delete cascade,
  client_id         uuid not null references public.clients (id) on delete cascade,
  month             app.month_key not null,

  -- {"post": 6, "carrusel": 6, "reel": 10}
  feed_counts       jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(feed_counts) = 'object'),
  -- {"diaria": 30, "campana": 8, "interactiva": 4}
  story_counts      jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(story_counts) = 'object'),
  -- {"<pillar_id>": 40, ...} en porcentaje objetivo
  pillar_mix        jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(pillar_mix) = 'object'),
  rationale         jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(rationale) = 'object'),

  -- Piezas que el estudio declaró que puede producir ese mes. El Estratega no
  -- puede proponer más que esto; sin el tope, propone planes preciosos e
  -- imposibles y el mes cierra en rojo.
  capacity_declared integer check (capacity_declared is null or capacity_declared >= 0),

  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (client_id, month),

  -- Aprobado sin quién, o quién sin cuándo, es una aprobación que no se puede
  -- demostrar. Y el portal decide qué mostrar mirando approved_at.
  constraint volume_plans_approval_is_complete
    check (num_nonnulls(approved_by, approved_at) <> 1)
);

-- =============================================================================
-- Fechas clave
-- =============================================================================

create table public.key_dates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  date          date not null,
  title         text not null check (length(trim(title)) between 1 and 160),
  kind          app.key_date_kind not null,
  notes         text,
  -- Lo que propone el Estratega para esa fecha. Vive aquí y no en una pieza
  -- porque nace antes de que exista contenido: es la idea, no el entregable.
  campaign_idea text,
  has_budget    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index key_dates_client_date_idx on public.key_dates (client_id, date);

-- =============================================================================
-- Tendencias — de la ORG, no de un cliente
-- =============================================================================

-- Un audio que despega sirve para varios clientes a la vez. Amarrar la
-- tendencia a un cliente obligaría a capturarla N veces y perdería justo lo que
-- la hace valiosa: el radar es del estudio. Por eso solo lleva org_id y su RLS
-- va por membresía de org, no por cliente.
create table public.trends (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,

  platform      app.platform not null,
  kind          app.trend_kind not null,
  title         text not null check (length(trim(title)) between 1 and 200),
  audio_url     text check (audio_url is null or audio_url ~ '^https?://'),
  reference_url text check (reference_url is null or reference_url ~ '^https?://'),

  spotted_at    timestamptz not null default now(),
  spotted_by    uuid references auth.users (id) on delete set null,
  momentum      app.trend_momentum not null default 'subiendo',
  notes         text,
  -- A qué giros le queda: ['bar', 'restaurante']. Es el filtro que usa el
  -- Guionista para no proponerle a un hotel el reto de la barra.
  verticals     text[] not null default '{}',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Habilita la FK compuesta desde scripts: una tendencia de otra agencia no
  -- puede entrar a un guion de esta.
  unique (id, org_id)
);

create index trends_org_idx on public.trends (org_id, spotted_at desc);

-- =============================================================================
-- Guiones
-- =============================================================================

create table public.scripts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  piece_id      uuid,
  trend_id      uuid,

  -- Qué tanto le queda a la marca, 0–100. Es el número que evita el reel
  -- gracioso que ningún cliente habría aprobado.
  fit_score     smallint check (fit_score is null or fit_score between 0 and 100),
  fit_reason    text,

  duration_s    integer check (duration_s is null or duration_s between 1 and 3600),
  -- [{"from": 0, "to": 3, "shot": "...", "action": "...", "on_screen_text": "...", "vo": "..."}]
  scenes        jsonb not null default '[]'::jsonb check (jsonb_typeof(scenes) = 'array'),
  requirements  text,
  -- Siempre una versión más simple. Un guion que exige tres personas y un
  -- dolly no se graba nunca, y sin plan B el hueco del mes queda igual.
  alternative   text,

  status        app.script_status not null default 'propuesto',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- SET NULL acotado a una columna (Postgres 15+): sin la lista, borrar la
  -- pieza intentaría anular también client_id, que es NOT NULL, y el DELETE
  -- fallaría con un error que no dice nada de lo que pasó.
  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete set null (piece_id),
  foreign key (trend_id, org_id)
    references public.trends (id, org_id) on delete set null (trend_id)
);

create index scripts_client_idx on public.scripts (client_id, created_at desc);
create index scripts_trend_idx on public.scripts (trend_id);

-- =============================================================================
-- Pauta
-- =============================================================================

create table public.campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,

  name          text not null check (length(trim(name)) between 1 and 160),
  objective     text not null check (length(trim(objective)) between 1 and 200),
  platform      app.platform not null,

  budget_cents  integer not null default 0 check (budget_cents >= 0),
  spent_cents   integer not null default 0 check (spent_cents >= 0),

  start_date    date not null,
  end_date      date not null,

  status        app.campaign_status not null default 'borrador',

  -- Qué vamos a aprender. Es obligatorio en el discurso del Pautero y opcional
  -- en la base a propósito: se escribe al planear, no al capturar el borrador.
  learning_goal text,
  result_metric text,
  -- Se llena al cerrar. Es lo que lee el Pautero para la campaña siguiente;
  -- sin esto cada campaña arranca de cero.
  learned       text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint campaigns_dates_in_order check (end_date >= start_date),
  unique (id, client_id)
);

create index campaigns_client_idx on public.campaigns (client_id, start_date desc);

comment on column public.campaigns.budget_cents is
  'Centavos, entero. Ningún agente puede moverlo: ver app.guard_budget_move().';

create table public.ad_sets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  campaign_id   uuid not null,

  name          text not null check (length(trim(name)) between 1 and 160),
  audience_type app.audience_type not null,
  -- {"intereses": ["jazz"], "edad": [25, 45], "geo": ["Tijuana"]}
  audience_def  jsonb not null default '{}'::jsonb
                  check (jsonb_typeof(audience_def) = 'object'),

  budget_cents  integer not null default 0 check (budget_cents >= 0),
  spent_cents   integer not null default 0 check (spent_cents >= 0),

  status        app.ad_set_status not null default 'activo',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  foreign key (campaign_id, client_id)
    references public.campaigns (id, client_id) on delete cascade,
  unique (id, client_id)
);

create index ad_sets_campaign_idx on public.ad_sets (campaign_id);

-- Qué pieza del planner se está impulsando en qué ad set. No duplica el
-- creativo: apunta a la pieza, para que el reporte diga "el reel del 14" y no
-- "creativo 3".
create table public.ad_creatives (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  ad_set_id   uuid not null,
  piece_id    uuid not null,
  status      app.ad_creative_status not null default 'propuesto',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,
  foreign key (piece_id, client_id)
    references public.pieces (id, client_id) on delete cascade,
  unique (ad_set_id, piece_id)
);

-- Métricas diarias por ad set, capturadas a mano o por CSV de Meta/TikTok.
-- Todo el dinero en centavos; ctr es un porcentaje y por eso sí es numeric.
create table public.ad_metrics (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs (id) on delete cascade,
  client_id             uuid not null references public.clients (id) on delete cascade,
  ad_set_id             uuid not null,
  date                  date not null,

  spend_cents           integer not null default 0 check (spend_cents >= 0),
  impressions           integer not null default 0 check (impressions >= 0),
  reach                 integer not null default 0 check (reach >= 0),
  clicks                integer not null default 0 check (clicks >= 0),

  ctr                   numeric(6, 3) check (ctr is null or ctr between 0 and 100),
  cpm_cents             integer check (cpm_cents is null or cpm_cents >= 0),
  cpc_cents             integer check (cpc_cents is null or cpc_cents >= 0),

  results               integer not null default 0 check (results >= 0),
  cost_per_result_cents integer check (cost_per_result_cents is null or cost_per_result_cents >= 0),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,
  -- Un día, una fila. Sin esto, reimportar el CSV duplica el gasto del mes.
  unique (ad_set_id, date)
);

create index ad_metrics_client_date_idx on public.ad_metrics (client_id, date desc);

-- -----------------------------------------------------------------------------
-- Propuestas del Pautero.
--
-- Esta tabla es el corazón del trato con el sistema: el agente propone y la
-- persona ejecuta en el ads manager. Aprobar aquí NO mueve dinero — genera
-- instrucciones. Quien las aplicó lo marca después, con hora y nota.
-- -----------------------------------------------------------------------------
create table public.ad_proposals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  campaign_id     uuid not null,
  ad_set_id       uuid,

  kind            app.ad_proposal_kind not null,
  rationale       text not null check (length(trim(rationale)) between 1 and 4000),
  expected_impact text,
  -- El riesgo va junto al impacto porque una propuesta que solo enseña lo bueno
  -- no es una recomendación, es una venta.
  risk            text,
  -- {"kind": "bajar_presupuesto", "rationale": "...", "instructions": "..."}
  alternative     jsonb not null default '{}'::jsonb
                    check (jsonb_typeof(alternative) = 'object'),

  status          app.ad_proposal_status not null default 'propuesta',
  -- Los pasos exactos a dar en Meta/TikTok Ads. Es el entregable real de la
  -- aprobación: sin esto, "aprobado" no le dice a nadie qué hacer.
  instructions    text,

  approved_by     uuid references auth.users (id) on delete set null,
  applied_at      timestamptz,
  applied_note    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  foreign key (campaign_id, client_id)
    references public.campaigns (id, client_id) on delete cascade,
  foreign key (ad_set_id, client_id)
    references public.ad_sets (id, client_id) on delete cascade,

  constraint ad_proposals_decision_has_author
    check (
      status in ('propuesta', 'rechazada')
      or approved_by is not null
    ),
  constraint ad_proposals_approval_has_instructions
    check (
      status in ('propuesta', 'rechazada')
      or (instructions is not null and length(trim(instructions)) > 0)
    ),
  constraint ad_proposals_applied_has_time
    check (status <> 'aplicada' or applied_at is not null)
);

create index ad_proposals_campaign_idx on public.ad_proposals (campaign_id, created_at desc);
create index ad_proposals_open_idx
  on public.ad_proposals (client_id, created_at desc)
  where status = 'propuesta';

-- =============================================================================
-- Pendientes y eventos
-- =============================================================================

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  client_id   uuid not null references public.clients (id) on delete cascade,
  title       text not null check (length(trim(title)) between 1 and 300),
  depends_on  app.task_owner not null default 'yo',
  status      app.task_status not null default 'pendiente',
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_client_open_idx
  on public.tasks (client_id, due_date nulls last)
  where status <> 'hecha';

-- Sesiones de foto, coberturas, visitas. Van aparte de las tareas porque tienen
-- lugar y hora y se planean con el cliente, no se "cierran".
create table public.events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs (id) on delete cascade,
  client_id     uuid not null references public.clients (id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 300),
  scheduled_on  date not null,
  place         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index events_client_idx on public.events (client_id, scheduled_on);

-- =============================================================================
-- La regla que no se negocia: aprobar no mueve dinero.
--
-- El riesgo real no es que hoy exista código que mueva un presupuesto al
-- aprobar — no existe. Es que dentro de seis meses alguien escriba un trigger
-- "de conveniencia" que sincronice la propuesta con la campaña, y que eso pase
-- desapercibido en un review. Estos dos triggers hacen que ese código falle a
-- la primera, en la base, con un mensaje que dice exactamente por qué.
--
-- Cómo funciona: aprobar marca la transacción. Mientras esa marca esté puesta,
-- cualquier UPDATE que cambie `budget_cents` en campaigns o ad_sets truena. Y a
-- la inversa: no se puede aprobar en una transacción donde ya se movió un
-- presupuesto, para que no baste con invertir el orden de los statements.
--
-- Marcar la propuesta como 'aplicada' NO cuenta como aprobar: en ese momento la
-- persona ya hizo el cambio en el ads manager y viene a registrar la realidad,
-- que muchas veces incluye el presupuesto nuevo.
-- =============================================================================

create or replace function app.guard_proposal_approval()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('aprobada', 'aprobada_alternativa')
     and new.status is distinct from old.status then

    if coalesce(current_setting('app.budget_touched', true), '')
       = pg_current_xact_id()::text then
      raise exception
        'No se puede aprobar una propuesta en la misma transacción en que se movió un presupuesto. El agente propone; la persona ejecuta en el ads manager.';
    end if;

    perform set_config('app.approving_proposal', pg_current_xact_id()::text, true);
  end if;

  return new;
end;
$$;

create or replace function app.guard_budget_move()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.budget_cents is distinct from old.budget_cents then

    if coalesce(current_setting('app.approving_proposal', true), '')
       = pg_current_xact_id()::text then
      raise exception
        'Aprobar una propuesta no puede mover el presupuesto de % (% → %). El cambio se hace en el ads manager y se registra marcando la propuesta como aplicada.',
        tg_table_name, old.budget_cents, new.budget_cents;
    end if;

    perform set_config('app.budget_touched', pg_current_xact_id()::text, true);
  end if;

  return new;
end;
$$;

comment on function app.guard_budget_move() is
  'Impide que aprobar una propuesta del Pautero mueva un presupuesto. Es tu dinero y el del cliente: ningún agente lo toca.';

create trigger ad_proposals_approval_guard before update on public.ad_proposals
  for each row execute function app.guard_proposal_approval();

create trigger campaigns_budget_guard before update on public.campaigns
  for each row execute function app.guard_budget_move();

create trigger ad_sets_budget_guard before update on public.ad_sets
  for each row execute function app.guard_budget_move();

-- =============================================================================
-- RLS
-- =============================================================================

alter table public.social_accounts enable row level security;
alter table public.account_audits  enable row level security;
alter table public.results_monthly enable row level security;
alter table public.results_piece   enable row level security;
alter table public.volume_plans    enable row level security;
alter table public.key_dates       enable row level security;
alter table public.trends          enable row level security;
alter table public.scripts         enable row level security;
alter table public.campaigns       enable row level security;
alter table public.ad_sets         enable row level security;
alter table public.ad_creatives    enable row level security;
alter table public.ad_metrics      enable row level security;
alter table public.ad_proposals    enable row level security;
alter table public.tasks           enable row level security;
alter table public.events          enable row level security;

alter table public.social_accounts force row level security;
alter table public.account_audits  force row level security;
alter table public.results_monthly force row level security;
alter table public.results_piece   force row level security;
alter table public.volume_plans    force row level security;
alter table public.key_dates       force row level security;
alter table public.trends          force row level security;
alter table public.scripts         force row level security;
alter table public.campaigns       force row level security;
alter table public.ad_sets         force row level security;
alter table public.ad_creatives    force row level security;
alter table public.ad_metrics      force row level security;
alter table public.ad_proposals    force row level security;
alter table public.tasks           force row level security;
alter table public.events          force row level security;

-- --- Interno del estudio ------------------------------------------------------
-- Ninguna de estas tiene política para el portal, y esa ausencia es la política:
-- sin renglón que lo permita, RLS niega. El cliente no ve la maquinaria.

create policy "social_accounts: solo el estudio"
  on public.social_accounts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "account_audits: el estudio lee"
  on public.account_audits for select to authenticated
  using (app.is_staff_of_client(client_id));

create policy "results_piece: solo el estudio"
  on public.results_piece for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "scripts: solo el estudio"
  on public.scripts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "tasks: solo el estudio"
  on public.tasks for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "events: solo el estudio"
  on public.events for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- El radar es del estudio completo, no de un cliente: por eso va por membresía
-- de org. Es la única tabla del archivo cuya RLS no menciona client_id.
create policy "trends: el radar es de toda la org"
  on public.trends for all to authenticated
  using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

-- --- Compartido con el portal --------------------------------------------------

create policy "results_monthly: el estudio tiene control total"
  on public.results_monthly for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Los resultados del mes son la razón por la que el cliente entra al portal.
create policy "results_monthly: el portal lee"
  on public.results_monthly for select to authenticated
  using (app.is_portal_user_of_client(client_id));

create policy "key_dates: el estudio tiene control total"
  on public.key_dates for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "key_dates: el portal lee"
  on public.key_dates for select to authenticated
  using (app.is_portal_user_of_client(client_id));

create policy "volume_plans: el estudio tiene control total"
  on public.volume_plans for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- Solo lo aprobado. Un plan en borrador enseña conteos que todavía se están
-- discutiendo internamente; que el cliente los vea antes de tiempo convierte
-- una propuesta en un compromiso.
create policy "volume_plans: el portal lee solo lo aprobado"
  on public.volume_plans for select to authenticated
  using (
    app.is_portal_user_of_client(client_id)
    and approved_at is not null
  );

-- --- Pauta ---------------------------------------------------------------------

create policy "campaigns: solo el estudio"
  on public.campaigns for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_sets: solo el estudio"
  on public.ad_sets for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_creatives: solo el estudio"
  on public.ad_creatives for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_metrics: solo el estudio"
  on public.ad_metrics for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

create policy "ad_proposals: el estudio lee"
  on public.ad_proposals for select to authenticated
  using (app.is_staff_of_client(client_id));

-- Las propuestas las escribe el Pautero con service_role. Desde el navegador
-- solo se decide sobre ellas; nadie se auto-propone un movimiento de dinero.
create policy "ad_proposals: el estudio decide"
  on public.ad_proposals for update to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

-- =============================================================================
-- Vista de campañas para el cliente.
--
-- El portal necesita ver que hay pauta corriendo, pero no el presupuesto, ni lo
-- gastado, ni lo que el estudio está aprendiendo de su cuenta.
--
-- Postgres filtra renglones (RLS), no columnas: los GRANT por columna existen
-- pero son por ROL, y aquí el usuario del portal y el del estudio son el mismo
-- rol `authenticated` — distinguirlos por columna es imposible. Por eso la
-- vista NO es security_invoker: corre como su dueño, se salta la RLS de
-- campaigns y hace su propio filtro por portal. Es la única forma de dar acceso
-- a un subconjunto de columnas y a la vez no dar acceso a la tabla.
--
-- La contraparte de esa decisión: `public.campaigns` no tiene NINGUNA política
-- para el portal. Si algún día se agrega, la restricción por columna se cae y
-- esta vista deja de servir para nada.
-- =============================================================================
create view public.campaigns_para_cliente
with (security_barrier = true)
as
  select
    c.id,
    c.client_id,
    c.name,
    c.objective,
    c.platform,
    c.start_date,
    c.end_date,
    c.status,
    c.result_metric
  from public.campaigns c
  where app.is_portal_user_of_client(c.client_id);

comment on view public.campaigns_para_cliente is
  'Campañas en versión simple para el portal: sin presupuesto, sin gasto y sin el aprendizaje interno del estudio.';

-- =============================================================================
-- Permisos. RLS filtra renglones; el GRANT decide si la tabla existe para el
-- rol. `anon` no recibe nada en ninguna de las dos capas.
-- =============================================================================

grant select, insert, update, delete on public.social_accounts to authenticated;
grant select                        on public.account_audits  to authenticated;
grant select, insert, update, delete on public.results_monthly to authenticated;
grant select, insert, update, delete on public.results_piece   to authenticated;
grant select, insert, update, delete on public.volume_plans    to authenticated;
grant select, insert, update, delete on public.key_dates       to authenticated;
grant select, insert, update, delete on public.trends          to authenticated;
grant select, insert, update, delete on public.scripts         to authenticated;
grant select, insert, update, delete on public.campaigns       to authenticated;
grant select, insert, update, delete on public.ad_sets         to authenticated;
grant select, insert, update, delete on public.ad_creatives    to authenticated;
grant select, insert, update, delete on public.ad_metrics      to authenticated;
grant select, update                 on public.ad_proposals    to authenticated;
grant select, insert, update, delete on public.tasks           to authenticated;
grant select, insert, update, delete on public.events          to authenticated;

grant select on public.campaigns_para_cliente to authenticated;

-- =============================================================================
-- Triggers de mantenimiento
-- =============================================================================

create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function app.touch_updated_at();
create trigger results_monthly_touch before update on public.results_monthly
  for each row execute function app.touch_updated_at();
create trigger volume_plans_touch before update on public.volume_plans
  for each row execute function app.touch_updated_at();
create trigger key_dates_touch before update on public.key_dates
  for each row execute function app.touch_updated_at();
create trigger trends_touch before update on public.trends
  for each row execute function app.touch_updated_at();
create trigger scripts_touch before update on public.scripts
  for each row execute function app.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
  for each row execute function app.touch_updated_at();
create trigger ad_sets_touch before update on public.ad_sets
  for each row execute function app.touch_updated_at();
create trigger ad_creatives_touch before update on public.ad_creatives
  for each row execute function app.touch_updated_at();
create trigger ad_metrics_touch before update on public.ad_metrics
  for each row execute function app.touch_updated_at();
create trigger ad_proposals_touch before update on public.ad_proposals
  for each row execute function app.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function app.touch_updated_at();
create trigger events_touch before update on public.events
  for each row execute function app.touch_updated_at();

-- Coherencia de tenencia en toda tabla con client_id. `trends` no lleva: es de
-- la org y no cuelga de ningún cliente.
create trigger social_accounts_org_guard before insert or update on public.social_accounts
  for each row execute function app.enforce_client_org();
create trigger account_audits_org_guard before insert or update on public.account_audits
  for each row execute function app.enforce_client_org();
create trigger results_monthly_org_guard before insert or update on public.results_monthly
  for each row execute function app.enforce_client_org();
create trigger results_piece_org_guard before insert or update on public.results_piece
  for each row execute function app.enforce_client_org();
create trigger volume_plans_org_guard before insert or update on public.volume_plans
  for each row execute function app.enforce_client_org();
create trigger key_dates_org_guard before insert or update on public.key_dates
  for each row execute function app.enforce_client_org();
create trigger scripts_org_guard before insert or update on public.scripts
  for each row execute function app.enforce_client_org();
create trigger campaigns_org_guard before insert or update on public.campaigns
  for each row execute function app.enforce_client_org();
create trigger ad_sets_org_guard before insert or update on public.ad_sets
  for each row execute function app.enforce_client_org();
create trigger ad_creatives_org_guard before insert or update on public.ad_creatives
  for each row execute function app.enforce_client_org();
create trigger ad_metrics_org_guard before insert or update on public.ad_metrics
  for each row execute function app.enforce_client_org();
create trigger ad_proposals_org_guard before insert or update on public.ad_proposals
  for each row execute function app.enforce_client_org();
create trigger tasks_org_guard before insert or update on public.tasks
  for each row execute function app.enforce_client_org();
create trigger events_org_guard before insert or update on public.events
  for each row execute function app.enforce_client_org();


-- =============================================================================
-- 20260803000010_swap_slots.sql
-- =============================================================================

-- =============================================================================
-- 0010 · Los movimientos del Planner, en transacción.
--
-- Tres operaciones del grid que NO pueden quedar a medias:
--
--   1 · Intercambiar dos piezas de fecha. Si se hace con dos UPDATE sueltos
--       desde la aplicación y el segundo falla, el mes queda con dos piezas el
--       mismo día y una fecha vacía. Nadie se entera hasta que el cliente ve
--       el calendario.
--   2 · "Insertar y correr", que mueve N piezas de un jalón.
--   3 · Editar un campo que escribió un agente: el cambio y su renglón en
--       human_edits tienen que viajar juntos. Esa tabla es el criterio de la
--       marca aprendido, y un cambio guardado cuyo aprendizaje se perdió es
--       peor que no haber guardado.
--
-- Patrón del esquema, y por qué hay dos capas:
--   · La lógica vive en `app`, que NO se expone por PostgREST, es SECURITY
--     DEFINER y trae search_path fijado.
--   · Encima va una envoltura delgada en `public`, que es lo único que el
--     Data API alcanza. Sin ella, `supabase.rpc()` no puede llamar nada de
--     `app` — y meter la lógica directo en `public` rompería la regla de que
--     las funciones de ayuda no se exponen.
--
-- SECURITY DEFINER salta RLS, así que cada función verifica el acceso a mano
-- con `app.is_staff_of_client` y exige que TODAS las piezas involucradas sean
-- del mismo cliente. Un intercambio entre clientes es un cruce de datos, no un
-- error de dedo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Intercambiar los slots de dos piezas
-- -----------------------------------------------------------------------------
create or replace function app.swap_piece_slots(a uuid, b uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pa public.pieces%rowtype;
  pb public.pieces%rowtype;
begin
  if a is null or b is null or a = b then
    raise exception 'Se necesitan dos piezas distintas para intercambiar.'
      using errcode = '22023';
  end if;

  -- Se toman los candados SIEMPRE en el mismo orden (por id). Dos intercambios
  -- simultáneos que toquen el mismo par se formarían en fila en vez de
  -- abrazarse en un deadlock.
  select * into pa from public.pieces where id = least(a, b) for update;
  select * into pb from public.pieces where id = greatest(a, b) for update;

  if pa.id is null or pb.id is null then
    raise exception 'Alguna de las dos piezas ya no existe. Recarga el planner.'
      using errcode = 'P0002';
  end if;

  if pa.client_id <> pb.client_id then
    raise exception 'Las dos piezas tienen que ser del mismo cliente.'
      using errcode = '42501';
  end if;

  if not app.is_staff_of_client(pa.client_id) then
    raise exception 'No tienes acceso a estas piezas.'
      using errcode = '42501';
  end if;

  if pa.date_locked or pb.date_locked then
    raise exception 'Una de las piezas está amarrada a su fecha. Quita el candado para moverla.'
      using errcode = '42501';
  end if;

  -- La base ya prohíbe una pieza publicada sin fecha; el mensaje crudo de ese
  -- CHECK no le sirve a nadie, así que se explica antes de provocarlo.
  if (pa.status = 'publicado' and pb.publish_at is null)
     or (pb.status = 'publicado' and pa.publish_at is null) then
    raise exception 'Una pieza ya publicada no se puede quedar sin fecha.'
      using errcode = '22023';
  end if;

  update public.pieces
     set publish_at = pb.publish_at, slot_index = pb.slot_index
   where id = pa.id;

  update public.pieces
     set publish_at = pa.publish_at, slot_index = pa.slot_index
   where id = pb.id;
end;
$$;

comment on function app.swap_piece_slots(uuid, uuid) is
  'Intercambia publish_at y slot_index de dos piezas del mismo cliente, en una transacción.';

-- -----------------------------------------------------------------------------
-- 2 · Insertar y correr: aplica los slots ya calculados a N piezas
--
-- Recibe SOLO las piezas que cambian, calculadas por src/domain/planner.ts. No
-- recalcula el mes completo a propósito: reescribir 68 renglones para mover uno
-- convierte cada arrastre en un conflicto con cualquier otra edición en curso.
-- -----------------------------------------------------------------------------
create or replace function app.shift_piece_slots(target_client uuid, moves jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  esperadas integer;
  aplicadas integer;
begin
  if not app.is_staff_of_client(target_client) then
    raise exception 'No tienes acceso a las piezas de este cliente.'
      using errcode = '42501';
  end if;

  if moves is null or jsonb_typeof(moves) <> 'array' or jsonb_array_length(moves) = 0 then
    raise exception 'No hay movimientos que aplicar.'
      using errcode = '22023';
  end if;

  esperadas := jsonb_array_length(moves);

  perform p.id
     from public.pieces p
    where p.id = any (
            select (m.value ->> 'id')::uuid
              from jsonb_array_elements(moves) as m(value)
          )
    order by p.id
      for update;

  if (
    select count(*)
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.client_id = target_client
  ) <> esperadas then
    raise exception 'Alguna pieza del reacomodo no existe o no es de este cliente.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.date_locked
  ) then
    raise exception 'Hay una pieza amarrada a su fecha dentro del reacomodo.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(moves) as m(value)
      join public.pieces p on p.id = (m.value ->> 'id')::uuid
     where p.status = 'publicado'
       and nullif(m.value ->> 'publish_at', '') is null
  ) then
    raise exception 'Una pieza ya publicada no se puede quedar sin fecha.'
      using errcode = '22023';
  end if;

  update public.pieces p
     set publish_at = nullif(m.value ->> 'publish_at', '')::timestamptz,
         slot_index = (m.value ->> 'slot_index')::integer
    from jsonb_array_elements(moves) as m(value)
   where p.id = (m.value ->> 'id')::uuid
     and p.client_id = target_client;

  get diagnostics aplicadas = row_count;
  return aplicadas;
end;
$$;

comment on function app.shift_piece_slots(uuid, jsonb) is
  'Aplica en una transacción los slots calculados por el planner. moves = [{id, publish_at, slot_index}].';

-- -----------------------------------------------------------------------------
-- 3 · Editar un campo de copy y registrar el aprendizaje
--
-- Al editar, la llave del campo se borra de `authored_by`. Eso es lo que hace
-- que el punto del tile pase de lleno a hueco: la pieza ya no llegó sola.
-- -----------------------------------------------------------------------------
create or replace function app.edit_piece_field(
  p_piece uuid,
  p_field text,
  p_value text,
  p_tags  text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  pieza     public.pieces%rowtype;
  anterior  text;
  nuevo     text;
  agente    app.agent_key;
begin
  if p_field is null or p_field not in
     ('idea', 'hook', 'script', 'copy_in', 'copy_out', 'cta', 'hashtags') then
    raise exception 'El campo "%" no se edita por aquí.', coalesce(p_field, '(vacío)')
      using errcode = '22023';
  end if;

  select * into pieza from public.pieces where id = p_piece for update;

  if pieza.id is null then
    raise exception 'La pieza ya no existe. Recarga el planner.'
      using errcode = 'P0002';
  end if;

  if not app.is_staff_of_client(pieza.client_id) then
    raise exception 'No tienes acceso a esta pieza.'
      using errcode = '42501';
  end if;

  -- La procedencia se lee ANTES de borrarla: es la que queda registrada como
  -- "a quién se le corrigió". Se valida contra el enum en vez de castear a
  -- ciegas, porque un authored_by con basura no debe tumbar la edición.
  if pieza.authored_by ? p_field
     and (pieza.authored_by ->> p_field) = any (enum_range(null::app.agent_key)::text[]) then
    agente := (pieza.authored_by ->> p_field)::app.agent_key;
  end if;

  if p_field = 'hashtags' then
    anterior := array_to_string(pieza.hashtags, ' ');
    nuevo    := array_to_string(coalesce(p_tags, '{}'::text[]), ' ');

    update public.pieces
       set hashtags    = coalesce(p_tags, '{}'::text[]),
           authored_by = authored_by - p_field
     where id = p_piece;
  else
    anterior := to_jsonb(pieza) ->> p_field;
    nuevo    := nullif(p_value, '');

    execute format(
      'update public.pieces set %I = $1, authored_by = authored_by - $2 where id = $3',
      p_field
    ) using nuevo, p_field, p_piece;
  end if;

  -- Se escribe siempre, aunque el campo no lo hubiera tocado un agente: la
  -- lista de correcciones es el criterio de la marca, y las que Ana hace sobre
  -- su propio texto también lo son.
  insert into public.human_edits
    (org_id, client_id, piece_id, agent, field, old_value, new_value, edited_by)
  values
    (pieza.org_id, pieza.client_id, p_piece, agente, p_field, anterior, nuevo,
     (select auth.uid()));
end;
$$;

comment on function app.edit_piece_field(uuid, text, text, text[]) is
  'Edita un campo de copy, limpia su procedencia de agente y registra la corrección en human_edits, todo en una transacción.';

-- =============================================================================
-- Envolturas públicas: lo único que el Data API puede llamar.
-- =============================================================================

create or replace function public.swap_piece_slots(a uuid, b uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.swap_piece_slots(a, b);
$$;

create or replace function public.shift_piece_slots(target_client uuid, moves jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select app.shift_piece_slots(target_client, moves);
$$;

create or replace function public.edit_piece_field(
  p_piece uuid,
  p_field text,
  p_value text,
  p_tags  text[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.edit_piece_field(p_piece, p_field, p_value, p_tags);
$$;

-- Postgres otorga EXECUTE a PUBLIC en toda función nueva. Se quita y se da
-- solo a quien tiene sesión: el portal de cliente no reordena nada.
revoke all on function
  app.swap_piece_slots(uuid, uuid),
  app.shift_piece_slots(uuid, jsonb),
  app.edit_piece_field(uuid, text, text, text[]),
  public.swap_piece_slots(uuid, uuid),
  public.shift_piece_slots(uuid, jsonb),
  public.edit_piece_field(uuid, text, text, text[])
from public, anon;

grant execute on function
  app.swap_piece_slots(uuid, uuid),
  app.shift_piece_slots(uuid, jsonb),
  app.edit_piece_field(uuid, text, text, text[])
to authenticated, service_role;

grant execute on function
  public.swap_piece_slots(uuid, uuid),
  public.shift_piece_slots(uuid, jsonb),
  public.edit_piece_field(uuid, text, text, text[])
to authenticated, service_role;


-- =============================================================================
-- 20260804000011_produccion_real.sql
-- =============================================================================

-- =============================================================================
-- 0011 · Lo que hace falta para operar de verdad.
--
-- Sale de mirar cómo se trabaja hoy en Notion, no de la especificación
-- original. Tres campos y una tabla que el diseño de origen no tenía y que el
-- uso real sí exige:
--
--   · Fecha de ENTREGA aparte de la de publicación. No son la misma: el
--     material se entrega días antes de que salga, y el atraso que importa
--     perseguir es el de la entrega.
--   · Responsable por pieza. "Lo hace el estudio" no alcanza cuando son cuatro
--     personas y treinta piezas.
--   · Sprints. El trabajo se organiza en bloques, no solo por mes.
--
-- Y el que más se nota: la imagen de la pieza. Sin ella el grid del planner es
-- una tabla con colores, no un grid.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sprints
--
-- Viven en la ORG, no en el cliente: un bloque de trabajo del estudio cruza
-- clientes. Misma decisión que `trends`, y por la misma razón.
-- -----------------------------------------------------------------------------
create table public.sprints (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  starts_on   date not null,
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint sprints_rango_valido check (ends_on >= starts_on),
  unique (org_id, name)
);

create index sprints_org_idx on public.sprints (org_id, starts_on desc);

alter table public.sprints enable row level security;
alter table public.sprints force row level security;

create policy "sprints: el estudio los administra"
  on public.sprints for all to authenticated
  using (app.is_org_member(org_id))
  with check (app.is_org_member(org_id));

grant select, insert, update, delete on public.sprints to authenticated;

create trigger sprints_touch before update on public.sprints
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Campos nuevos en pieces
-- -----------------------------------------------------------------------------

alter table public.pieces
  -- De dónde salió la imagen. `subido` vive en nuestro Storage; `enlace` es de
  -- Canva, Drive o donde sea. Los dos son válidos y por eso se distingue: un
  -- enlace externo puede caerse o volverse privado sin avisar, y cuando el
  -- tile salga roto conviene saber de inmediato si el archivo era nuestro.
  add column asset_url text check (asset_url is null or asset_url ~ '^(https?://|/)'),
  add column asset_source text check (asset_source in ('subido', 'enlace')),

  -- La fecha que de verdad se persigue. Publicar es el resultado; entregar es
  -- el compromiso que se puede incumplir.
  add column due_date date,

  -- Quién la saca. Se valida contra la membresía con un trigger: una FK a
  -- auth.users dejaría asignarle una pieza a alguien de otra agencia.
  add column assignee_id uuid references auth.users (id) on delete set null,

  add column sprint_id uuid references public.sprints (id) on delete set null;

-- Si hay imagen, hay asset. Si no, no. Que las dos columnas puedan
-- contradecirse es una forma barata de acumular datos que mienten.
alter table public.pieces
  add constraint pieces_asset_coherente
  check (
    (asset_url is null and asset_source is null)
    or (asset_url is not null and asset_source is not null)
  );

create index pieces_due_idx on public.pieces (client_id, due_date)
  where due_date is not null;
create index pieces_assignee_idx on public.pieces (assignee_id)
  where assignee_id is not null;
create index pieces_sprint_idx on public.pieces (sprint_id)
  where sprint_id is not null;

/**
 * El responsable tiene que ser del estudio dueño del cliente.
 *
 * Sin esto se le puede asignar una pieza al usuario de otra agencia — la FK
 * apunta a auth.users, que no sabe nada de organizaciones. No filtraría datos
 * (RLS sigue en pie) pero dejaría el tablero de pendientes con nombres que
 * nadie reconoce y una pieza que nadie va a hacer.
 */
create or replace function app.enforce_assignee_is_staff()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.org_members m
    where m.user_id = new.assignee_id
      and m.org_id = new.org_id
  ) then
    raise exception
      'El responsable % no es miembro de la organización dueña de este cliente.',
      new.assignee_id;
  end if;

  return new;
end;
$$;

create trigger pieces_assignee_guard before insert or update on public.pieces
  for each row execute function app.enforce_assignee_is_staff();

/** El sprint tiene que ser de la misma org que la pieza. */
create or replace function app.enforce_sprint_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org_del_sprint uuid;
begin
  if new.sprint_id is null then
    return new;
  end if;

  select s.org_id into org_del_sprint from public.sprints s where s.id = new.sprint_id;

  if org_del_sprint is distinct from new.org_id then
    raise exception 'El sprint % no pertenece a esta organización.', new.sprint_id;
  end if;

  return new;
end;
$$;

create trigger pieces_sprint_guard before insert or update on public.pieces
  for each row execute function app.enforce_sprint_org();

-- -----------------------------------------------------------------------------
-- Storage para las imágenes de las piezas
--
-- Bucket PRIVADO. Las piezas sin publicar son la estrategia del cliente antes
-- de que salga: un bucket público las deja accesibles a quien adivine la URL,
-- y esas URLs terminan pegadas en chats.
--
-- La ruta es `{client_id}/{piece_id}/{archivo}`. El primer segmento es lo que
-- las políticas usan para decidir, así que la convención no es estética: es
-- el mecanismo.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'piezas',
  'piezas',
  false,
  20971520, -- 20 MB. Un JPG de feed pesa menos de 2; el tope es para atajar
            -- que alguien suba el master de un video por error.
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do nothing;

create policy "piezas: el estudio lee las de sus clientes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'piezas'
    and app.is_staff_of_client(((storage.foldername(name))[1])::uuid)
  );

create policy "piezas: el estudio sube"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'piezas'
    and app.is_staff_of_client(((storage.foldername(name))[1])::uuid)
  );

create policy "piezas: el estudio reemplaza"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'piezas'
    and app.is_staff_of_client(((storage.foldername(name))[1])::uuid)
  );

create policy "piezas: el estudio borra"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'piezas'
    and app.is_staff_of_client(((storage.foldername(name))[1])::uuid)
  );

/**
 * El portal de cliente ve la imagen SOLO de las piezas que ya puede ver.
 *
 * Se repite aquí la misma regla que en `pieces`, y hay que repetirla: Storage
 * es otro sistema de permisos. Que la fila esté oculta no oculta el archivo.
 * Sin esta política un contacto del cliente podría pedir el archivo de un
 * borrador que la app nunca le mostró.
 */
create policy "piezas: el portal ve las de sus piezas visibles"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'piezas'
    and app.is_portal_user_of_client(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1
      from public.pieces p
      where p.id = ((storage.foldername(name))[2])::uuid
        and app.is_client_visible(p.status)
    )
  );

comment on column public.pieces.asset_url is
  'Ruta en el bucket `piezas` si asset_source = subido; URL completa si = enlace.';


-- =============================================================================
-- 20260804000012_ver_como_post.sql
-- =============================================================================

-- =============================================================================
-- 0012 · "Ver como post": la identidad pública de la cuenta.
--
-- La imagen de la pieza ya vive en el bucket `piezas` (migración 0011). Lo que
-- faltaba para pintar una pieza como una publicación de Instagram —en el drawer
-- del estudio y en el portal del cliente— es la identidad de la cuenta que va
-- en el header del post: la foto de perfil y la bio.
--
-- Van en `clients` y NO en `social_accounts`. El portal ya lee `clients` (su
-- política `clients: el portal ve solo su cliente`), mientras que
-- `social_accounts` es studio-only y carga maquinaria —seguidores, DMs sin
-- responder, checklist de perfil— que el cliente nunca debe ver. avatar y bio
-- son la cara pública de la marca, no maquinaria, así que su hogar es `clients`
-- y ahí respetan la regla de "el cliente nunca ve la maquinaria".
-- =============================================================================

alter table public.clients
  add column avatar_url text check (avatar_url is null or avatar_url ~ '^https?://'),
  add column bio        text check (bio is null or length(bio) <= 300);


-- =============================================================================
-- 20260805000012_sembrar_agent_policies.sql
-- =============================================================================

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


-- =============================================================================
-- 20260806000013_referencias_y_editar_reglas.sql
-- =============================================================================

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


-- =============================================================================
-- 20260807000014_org_invites.sql
-- =============================================================================

-- =============================================================================
-- 0014 · Invitar gente al equipo del estudio.
--
-- org_members es 100% alta manual: no hay trigger sobre auth.users, ni
-- invitación por correo. Hoy eso significa que una cuenta nueva —o migrada—
-- se autentica bien y ve la app completamente vacía, porque RLS filtra en
-- silencio a quien no tiene fila en org_members. Esta migración agrega el
-- paso que faltaba: el owner invita por correo, y en cuanto esa persona
-- entra (o ya tenía sesión y recarga), su invitación pendiente se convierte
-- en membership sola.
-- =============================================================================

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  email       extensions.citext not null,
  role        app.member_role not null default 'staff',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Aceptar es poner fecha, no borrar: mismo criterio que client_users.revoked_at.
  accepted_at timestamptz
);

-- Como mucho una invitación pendiente por correo y por org; una vez aceptada
-- el correo se puede volver a invitar sin chocar con la fila vieja.
create unique index org_invites_pending_idx on public.org_invites (org_id, email)
  where accepted_at is null;

create index org_invites_email_idx on public.org_invites (email) where accepted_at is null;

alter table public.org_invites enable row level security;
alter table public.org_invites force row level security;

-- Mismo criterio que org_members: solo el owner administra a quién invita.
create policy "org_invites: solo el owner administra"
  on public.org_invites for all to authenticated
  using (app.is_org_owner(org_id))
  with check (app.is_org_owner(org_id));

grant select, insert, update, delete on public.org_invites to authenticated;

-- =============================================================================
-- Aceptar invitaciones pendientes.
--
-- Corre SECURITY DEFINER porque tiene que escribir en org_members, y un
-- usuario recién invitado todavía no es miembro de nada — no hay política que
-- se lo permita directo. Se cruza contra el correo verificado del JWT, igual
-- que app.portal_client_ids(): Supabase solo emite sesión después de que la
-- persona abrió el link en ESE buzón.
-- =============================================================================
create or replace function app.accept_pending_invites()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email extensions.citext := ((select auth.jwt()) ->> 'email')::extensions.citext;
begin
  if v_uid is null or v_email is null then
    return;
  end if;

  insert into public.org_members (org_id, user_id, role)
  select i.org_id, v_uid, i.role
  from public.org_invites i
  where i.email = v_email
    and i.accepted_at is null
  on conflict (org_id, user_id) do nothing;

  update public.org_invites
  set accepted_at = now()
  where email = v_email
    and accepted_at is null;
end;
$$;

comment on function app.accept_pending_invites() is
  'Convierte en membership toda invitación pendiente que coincida con el correo del usuario logueado.';

-- =============================================================================
-- Envoltura pública: lo único que el Data API puede llamar.
-- =============================================================================
create or replace function public.accept_pending_invites()
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.accept_pending_invites();
$$;

revoke all on function
  app.accept_pending_invites(),
  public.accept_pending_invites()
from public, anon;

grant execute on function app.accept_pending_invites() to authenticated, service_role;
grant execute on function public.accept_pending_invites() to authenticated, service_role;


-- =============================================================================
-- 20260807000015_procedencia_redes.sql
-- =============================================================================

-- Procedencia del dato de redes.
--
-- Con la verificación de negocio de Meta a semanas de trámite por cliente, el
-- scrape vía Apify es la fuente PRINCIPAL para estas cuentas, no un respaldo.
-- Y un seguidor scrapeado no es el mismo dato que uno del Graph API oficial:
-- Apify ve lo público (seguidores, cadencia, último post) y NUNCA los insights
-- privados (reach, impresiones, saves). Si el Analista no distingue de dónde
-- salió el número, mezcla dos cosas distintas sin saberlo — justo la trampa que
-- ya advierte el CLAUDE.md ("el agente no distingue de dónde vino el número").
--
-- Por eso 'apify' es un valor aparte de 'api', no un sinónimo: uno es scrape
-- público, el otro es la métrica oficial de la plataforma. El día que el trámite
-- con Meta cierre y entren los dos, hay que poder saber cuál estás viendo.

alter type app.metric_source add value if not exists 'apify';

-- social_accounts guarda el estado de la cuenta (seguidores, cadencia, último
-- post) que llena `sync-redes`. Hasta hoy no registraba de dónde salió ese
-- estado. Default 'manual' porque el arranque sigue siendo captura a mano; el
-- job lo sube a 'apify' o 'api' cuando corre. No se referencia el valor nuevo
-- aquí a propósito: usar un enum recién agregado en la misma transacción falla.
alter table public.social_accounts
  add column source app.metric_source not null default 'manual';

comment on column public.social_accounts.source is
  'De dónde salió el último refresco de esta cuenta: manual/csv (captura), api '
  '(Graph oficial) o apify (scrape público, sin reach ni impresiones). El '
  'Analista lo necesita para saber qué tan completo es cada número.';


-- =============================================================================
-- 20260807000016_cuentas_referencia.sql
-- =============================================================================

-- Cuentas de referencia: la competencia y las cuentas de inspiración.
--
-- Lo que el estudio rastrea de cuentas que NO son del cliente. Sirve para dos
-- cosas que el dato propio no da:
--   · Comparación — las cuentas del cliente contra su competencia directa.
--   · Inspiración — qué está publicando la gente que va bien en el nicho.
--
-- Ninguna otra fuente da esto: a la competencia no le puedes pedir su token del
-- Graph API, y Meta no te exporta sus números. Pero sus posts públicos sí se
-- scrapean, y para eso es Apify. Por eso el `source` default es 'apify': aquí
-- casi nunca hay captura a mano.
--
-- Está amarrada a un cliente (no es un pool global) porque "comparación" siempre
-- es contra alguien: la competencia del bar no es la competencia del despacho.
-- Eso además hace que su RLS sea idéntico al de social_accounts — por cliente,
-- vía app.is_staff_of_client — y es maquinaria del estudio: el portal de cliente
-- NO tiene política aquí, a propósito. A quién medimos contra el cliente no es
-- algo que el cliente vea.

create type app.reference_kind as enum ('competencia', 'inspiracion');

create table public.reference_accounts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  platform       app.platform not null,

  -- Sin handle no hay a quién scrapear: es obligatorio, a diferencia del de
  -- las cuentas propias, que se puede capturar a mano antes de conectar nada.
  handle         text not null,
  url            text check (url is null or url ~ '^https?://'),

  -- Nombre legible para la interfaz: "Competidor directo", "Cuenta que nos gusta".
  label          text,
  kind           app.reference_kind not null default 'competencia',

  followers      integer not null default 0 check (followers >= 0),
  last_post_at   timestamptz,
  posts_per_week numeric(5, 2) not null default 0 check (posts_per_week >= 0),

  -- Snapshot de los posts más recientes para el panel de inspiración. Se
  -- reemplaza completo en cada scrape; no es un histórico. Array de objetos
  -- {caption, likes, comments, url, at}. jsonb porque la forma la fija el Actor,
  -- no nosotros, y validarla en runtime es trabajo del lector con Zod.
  top_posts      jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(top_posts) = 'array'),

  -- Casi siempre 'apify' (scrape público). El día que alguien capture una
  -- cuenta a mano, el enum ya lo admite.
  source         app.metric_source not null default 'apify',
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- La misma cuenta se puede rastrear en varias redes, pero no dos veces en la
  -- misma para el mismo cliente.
  unique (client_id, platform, handle)
);

alter table public.reference_accounts enable row level security;
alter table public.reference_accounts force row level security;

-- Estudio-only, igual que social_accounts. Sin política para el portal: el
-- cliente no ve contra quién lo comparamos.
create policy "reference_accounts: solo el estudio"
  on public.reference_accounts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

grant select, insert, update, delete on public.reference_accounts to authenticated;

create trigger reference_accounts_touch before update on public.reference_accounts
  for each row execute function app.touch_updated_at();

-- Un org_id que no corresponde al client_id es imposible, incluso con bug.
create trigger reference_accounts_org_guard before insert or update on public.reference_accounts
  for each row execute function app.enforce_client_org();


-- =============================================================================
-- REGISTRO DE MIGRACIONES
--
-- Solo si aplicaste el archivo a mano. Le dice a la CLI que estas versiones ya
-- corrieron; sin esto, el próximo `db push` intenta aplicarlas de nuevo.
-- =============================================================================

insert into supabase_migrations.schema_migrations (version) values
  ('20260801000001'),
  ('20260801000002'),
  ('20260801000003'),
  ('20260801000004'),
  ('20260801000005'),
  ('20260801000006'),
  ('20260802000007'),
  ('20260803000010'),
  ('20260804000011'),
  ('20260804000012'),
  ('20260805000012'),
  ('20260806000013'),
  ('20260807000014'),
  ('20260807000015'),
  ('20260807000016')
on conflict (version) do nothing;
