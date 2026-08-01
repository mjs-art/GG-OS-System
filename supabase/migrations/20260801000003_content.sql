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
