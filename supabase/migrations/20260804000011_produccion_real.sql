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
