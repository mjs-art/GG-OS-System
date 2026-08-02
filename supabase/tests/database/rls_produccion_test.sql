-- =============================================================================
-- Aislamiento de lo que agregó la migración 0011: responsable, sprint y las
-- imágenes en Storage.
--
-- Lo de Storage merece prueba propia y no es paranoia: `storage.objects` es
-- OTRO sistema de permisos. Que la fila de la pieza esté oculta por RLS no
-- oculta el archivo. Es exactamente el tipo de hueco que no se ve en la
-- interfaz porque la interfaz nunca pide ese archivo — hasta que alguien
-- copia la URL.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

create or replace function pg_temp.login(uid uuid, mail text)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated', 'email', mail)::text,
    true
  );
end $$;

create or replace function pg_temp.as_superuser()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end $$;

-- ===========================================================================
-- Fixture, en su propio espacio de IDs (7777…) para no chocar con el seed.
-- ===========================================================================

insert into auth.users (id, email) values
  ('77771111-0000-4000-8000-000000000001', 'p-owner@test.invalid'),
  ('77771111-0000-4000-8000-000000000002', 'p-rival@test.invalid'),
  ('77771111-0000-4000-8000-000000000003', 'p-portal@test.invalid');

insert into public.orgs (id, slug, name) values
  ('77770000-0000-4000-8000-000000000001', 'prod-uno', 'Agencia Uno'),
  ('77770000-0000-4000-8000-000000000002', 'prod-dos', 'Agencia Dos');

insert into public.org_members (org_id, user_id, role) values
  ('77770000-0000-4000-8000-000000000001', '77771111-0000-4000-8000-000000000001', 'owner'),
  ('77770000-0000-4000-8000-000000000002', '77771111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('77772222-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000001',
   'prod-cliente-a', 'Cliente A'),
  ('77772222-0000-4000-8000-000000000002', '77770000-0000-4000-8000-000000000002',
   'prod-cliente-b', 'Cliente B');

insert into public.client_users (org_id, client_id, email) values
  ('77770000-0000-4000-8000-000000000001', '77772222-0000-4000-8000-000000000001',
   'p-portal@test.invalid');

insert into public.sprints (id, org_id, name, starts_on, ends_on) values
  ('77774444-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000001',
   'Bloque 1', '2026-09-01', '2026-09-14'),
  ('77774444-0000-4000-8000-000000000002', '77770000-0000-4000-8000-000000000002',
   'Bloque ajeno', '2026-09-01', '2026-09-14');

insert into public.pieces (id, org_id, client_id, month, format, status, hook) values
  -- Borrador: el portal NO debe verla ni a ella ni a su imagen.
  ('77773333-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000001',
   '77772222-0000-4000-8000-000000000001', '2026-09', 'reel', 'idea', 'borrador'),
  -- Ya mandada a revisión: el portal sí.
  ('77773333-0000-4000-8000-000000000002', '77770000-0000-4000-8000-000000000001',
   '77772222-0000-4000-8000-000000000001', '2026-09', 'post', 'con_cliente', 'visible');

-- Dos archivos, uno por pieza, con la convención {client_id}/{piece_id}/…
insert into storage.objects (bucket_id, name, owner) values
  ('piezas',
   '77772222-0000-4000-8000-000000000001/77773333-0000-4000-8000-000000000001/borrador.jpg',
   '77771111-0000-4000-8000-000000000001'),
  ('piezas',
   '77772222-0000-4000-8000-000000000001/77773333-0000-4000-8000-000000000002/visible.jpg',
   '77771111-0000-4000-8000-000000000001');

-- ===========================================================================
-- 1 · Responsable y sprint no pueden cruzar de organización
-- ===========================================================================

select pg_temp.as_superuser();

select throws_ok(
  $$ update public.pieces
     set assignee_id = '77771111-0000-4000-8000-000000000002'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  null,
  'No se puede asignar una pieza a alguien de otra agencia'
);

select lives_ok(
  $$ update public.pieces
     set assignee_id = '77771111-0000-4000-8000-000000000001'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  'Sí se puede asignar a alguien del propio estudio'
);

select throws_ok(
  $$ update public.pieces
     set sprint_id = '77774444-0000-4000-8000-000000000002'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  null,
  'No se puede meter una pieza en un sprint de otra agencia'
);

select lives_ok(
  $$ update public.pieces
     set sprint_id = '77774444-0000-4000-8000-000000000001'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  'Sí se puede meter en un sprint propio'
);

-- La coherencia del asset: url y origen van juntos o no van.
select throws_ok(
  $$ update public.pieces set asset_url = 'https://ejemplo.test/x.jpg'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  null,
  'Una imagen sin origen declarado no se guarda'
);

select lives_ok(
  $$ update public.pieces
     set asset_url = 'https://ejemplo.test/x.jpg', asset_source = 'enlace'
     where id = '77773333-0000-4000-8000-000000000001' $$,
  'Con url y origen sí'
);

-- ===========================================================================
-- 2 · Sprints entre agencias
-- ===========================================================================

select pg_temp.login('77771111-0000-4000-8000-000000000002', 'p-rival@test.invalid');

select is(
  (select count(*) from public.sprints where id::text like '77774444%')::int, 1,
  'La agencia rival ve solo su propio sprint'
);

-- ===========================================================================
-- 3 · Storage: el estudio sí, la otra agencia no
-- ===========================================================================

select is(
  (select count(*) from storage.objects
    where bucket_id = 'piezas' and name like '77772222%')::int, 0,
  'La agencia rival no ve NI UN archivo de las piezas ajenas'
);

select pg_temp.login('77771111-0000-4000-8000-000000000001', 'p-owner@test.invalid');

select is(
  (select count(*) from storage.objects
    where bucket_id = 'piezas' and name like '77772222%')::int, 2,
  'El estudio ve los dos archivos de su cliente'
);

-- ===========================================================================
-- 4 · Storage y el portal: la regla que se olvida
-- ===========================================================================

select pg_temp.login('77771111-0000-4000-8000-000000000003', 'p-portal@test.invalid');

select is(
  (select count(*) from storage.objects
    where bucket_id = 'piezas' and name like '77772222%')::int, 1,
  'El portal ve exactamente un archivo: el de la pieza que ya puede ver'
);

select ok(
  (select name from storage.objects where bucket_id = 'piezas' and name like '77772222%')
    like '%visible.jpg',
  'Y es el de la pieza visible, no el del borrador'
);

select is_empty(
  $$ select name from storage.objects
     where bucket_id = 'piezas' and name like '%borrador.jpg' $$,
  'El archivo del borrador es inalcanzable para el portal aunque adivine la ruta'
);

select * from finish();

rollback;
