-- =============================================================================
-- Pruebas de aislamiento: multi-tenant y portal de cliente.
--
-- Estas pruebas existen porque una fuga de RLS no se ve. La app se comporta
-- perfecto, nadie reporta nada, y un día el cliente A abre un link y ve el
-- calendario del cliente B. La única forma de saber que no pasa es afirmarlo.
--
-- Dos decisiones de forma, ambas a propósito:
--
--   · SIEMPRE hay un vecino. Con un solo tenant en la base cualquier política
--     pasa; el aislamiento solo se puede probar contra alguien más.
--   · Los IDs viven en su propio espacio (9999…) y toda aserción se acota a
--     ellos. Las pruebas corren sobre la base ya sembrada, así que un test que
--     cuente renglones globales se rompe cada vez que alguien toca el seed —
--     y un test frágil se termina borrando en vez de arreglando.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Helpers de sesión. Reproducen lo que hace PostgREST con el JWT.
-- Viven en pg_temp, así que desaparecen con el rollback.
-- ---------------------------------------------------------------------------
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
-- Fixture — dos agencias, tres clientes, cinco usuarios.
-- ===========================================================================

insert into auth.users (id, email) values
  ('99991111-0000-4000-8000-000000000001', 'rls-owner@test.invalid'),   -- owner org T1
  ('99991111-0000-4000-8000-000000000002', 'rls-staff@test.invalid'),   -- staff org T1
  ('99991111-0000-4000-8000-000000000003', 'rls-rival@test.invalid'),   -- owner org T2
  ('99991111-0000-4000-8000-000000000004', 'rls-portal@test.invalid'),  -- portal cliente 1
  ('99991111-0000-4000-8000-000000000005', 'rls-nadie@test.invalid');   -- sin membresía

insert into public.orgs (id, slug, name) values
  ('99990000-0000-4000-8000-000000000001', 'rls-agencia-uno', 'Agencia Uno'),
  ('99990000-0000-4000-8000-000000000002', 'rls-agencia-dos', 'Agencia Dos');

insert into public.org_members (org_id, user_id, role) values
  ('99990000-0000-4000-8000-000000000001', '99991111-0000-4000-8000-000000000001', 'owner'),
  ('99990000-0000-4000-8000-000000000001', '99991111-0000-4000-8000-000000000002', 'staff'),
  ('99990000-0000-4000-8000-000000000002', '99991111-0000-4000-8000-000000000003', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('99992222-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   'rls-cliente-a', 'Cliente A'),
  ('99992222-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001',
   'rls-cliente-b', 'Cliente B'),
  ('99992222-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000002',
   'rls-cliente-c', 'Cliente C');

insert into public.client_users (org_id, client_id, email) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'rls-portal@test.invalid');

insert into public.pieces (id, org_id, client_id, month, format, status, hook) values
  -- Cliente A: un borrador interno y una ya mandada a revisión.
  ('99993333-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '2026-09', 'reel', 'idea',        'borrador interno'),
  ('99993333-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '2026-09', 'post', 'con_cliente', 'listo para revisión'),
  -- Cliente B: mismo estudio, otro cliente.
  ('99993333-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000002', '2026-09', 'post', 'con_cliente', 'de otro cliente'),
  -- Cliente C: agencia rival.
  ('99993333-0000-4000-8000-000000000004', '99990000-0000-4000-8000-000000000002',
   '99992222-0000-4000-8000-000000000003', '2026-09', 'post', 'con_cliente', 'de otra agencia');

insert into public.private_notes (org_id, client_id, author_id, body) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   '99991111-0000-4000-8000-000000000001', 'nota privada de prueba');

insert into public.agent_runs (org_id, client_id, agent, status, cost_cents) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'redactor', 'ok', 42);

insert into public.brand_rules (org_id, client_id, kind, rule) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'hashtags', 'regla de prueba');

insert into public.context_card_versions (org_id, client_id, version, created_by, what_it_is)
values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   1, '99991111-0000-4000-8000-000000000001', 'context card de prueba');

-- ===========================================================================
-- 1 · Aislamiento entre agencias
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000001', 'rls-owner@test.invalid');

select is(
  (select count(*) from public.clients where id::text like '99992222%')::int, 2,
  'El estudio ve sus 2 clientes y ninguno de la otra agencia'
);

select is(
  (select count(*) from public.pieces where id::text like '99993333%')::int, 3,
  'El estudio ve las 3 piezas de sus clientes, no la de la agencia rival'
);

select is(
  (select count(*) from public.orgs where id::text like '99990000%')::int, 1,
  'El estudio ve solo su propia org'
);

select pg_temp.login('99991111-0000-4000-8000-000000000003', 'rls-rival@test.invalid');

select is(
  (select count(*) from public.clients where id::text like '99992222%')::int, 1,
  'La agencia rival ve solo su cliente'
);

select is(
  (select count(*) from public.pieces where id::text like '99993333%'
      and client_id = '99992222-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve ni una pieza del Cliente A'
);

select is(
  (select count(*) from public.private_notes
    where client_id::text like '99992222%')::int, 0,
  'La agencia rival no ve notas privadas ajenas'
);

select throws_ok(
  $$ insert into public.pieces (org_id, client_id, month, format)
     values ('99990000-0000-4000-8000-000000000002',
             '99992222-0000-4000-8000-000000000001', '2026-10', 'post') $$,
  null,
  'La agencia rival no puede insertar una pieza en un cliente ajeno'
);

-- ===========================================================================
-- 2 · Portal de cliente: solo su cliente, solo lo que ya salió a revisión
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000004', 'rls-portal@test.invalid');

select is(
  (select count(*) from public.clients where id::text like '99992222%')::int, 1,
  'El usuario del portal ve exactamente un cliente'
);

select is(
  (select slug from public.clients where id::text like '99992222%')::text, 'rls-cliente-a',
  'Y ese cliente es el suyo'
);

select is(
  (select count(*) from public.pieces where id::text like '99993333%')::int, 1,
  'El portal ve solo la pieza en con_cliente, no el borrador'
);

select is(
  (select hook from public.pieces where id::text like '99993333%')::text, 'listo para revisión',
  'Y es justo la que ya se le mandó'
);

select is(
  (select count(*) from public.pieces where id::text like '99993333%'
      and client_id = '99992222-0000-4000-8000-000000000002')::int, 0,
  'El portal no ve las piezas de otro cliente del mismo estudio'
);

select is(
  (select count(*) from public.private_notes
    where client_id::text like '99992222%')::int, 0,
  'El portal jamás ve notas privadas'
);

select is(
  (select count(*) from public.agent_runs
    where client_id::text like '99992222%')::int, 0,
  'El portal jamás ve corridas de agentes'
);

select is(
  (select count(*) from public.client_users
    where client_id::text like '99992222%')::int, 0,
  'El portal no ve la lista de contactos del cliente'
);

select is(
  (select count(*) from public.brand_rules
    where client_id::text like '99992222%')::int, 0,
  'El portal no ve las reglas duras de la marca'
);

select is(
  (select count(*) from public.context_card_versions
    where client_id::text like '99992222%')::int, 0,
  'El portal no ve el Context Card'
);

-- Ojo con esto: cuando RLS filtra un UPDATE, Postgres NO lanza error — afecta
-- cero renglones y regresa en silencio. Por eso la aserción correcta no es
-- "truena", es "el valor no cambió". Un test que esperara excepción aquí
-- pasaría en verde el día que alguien abra la política por accidente.
update public.pieces set hook = 'lo cambio yo'
  where id = '99993333-0000-4000-8000-000000000002';

select is(
  (select hook from public.pieces where id::text like '99993333%'
      and id = '99993333-0000-4000-8000-000000000002')::text,
  'listo para revisión',
  'Un UPDATE del portal sobre una pieza no cambia nada'
);

select lives_ok(
  $$ insert into public.piece_comments (org_id, client_id, piece_id, author_id, from_client, body)
     values ('99990000-0000-4000-8000-000000000001',
             '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000002',
             '99991111-0000-4000-8000-000000000004', true, 'me gusta pero cambia el hook') $$,
  'El portal sí puede comentar una pieza visible'
);

select throws_ok(
  $$ insert into public.piece_comments (org_id, client_id, piece_id, author_id, from_client, body)
     values ('99990000-0000-4000-8000-000000000001',
             '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000002',
             '99991111-0000-4000-8000-000000000004', false, 'me hago pasar por el estudio') $$,
  null,
  'El portal no puede insertar un comentario marcado como del estudio'
);

select throws_ok(
  $$ insert into public.piece_comments (org_id, client_id, piece_id, author_id, from_client, body)
     values ('99990000-0000-4000-8000-000000000001',
             '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000001',
             '99991111-0000-4000-8000-000000000004', true, 'comento un borrador que no veo') $$,
  null,
  'El portal no puede comentar una pieza que todavía no es visible para él'
);

-- ===========================================================================
-- 3 · Usuario autenticado sin ninguna membresía
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000005', 'rls-nadie@test.invalid');

select is(
  (select count(*) from public.clients where id::text like '99992222%')::int, 0,
  'Un usuario sin membresía no ve ningún cliente'
);

select is(
  (select count(*) from public.pieces where id::text like '99993333%')::int, 0,
  'Un usuario sin membresía no ve ninguna pieza'
);

-- ===========================================================================
-- 4 · Coherencia de tenencia: org_id no puede mentir
-- ===========================================================================

select pg_temp.as_superuser();

select throws_ok(
  $$ insert into public.pieces (org_id, client_id, month, format)
     values ('99990000-0000-4000-8000-000000000002',
             '99992222-0000-4000-8000-000000000001', '2026-10', 'post') $$,
  null,
  'Ni con superusuario se puede guardar una pieza con un org_id que no corresponde al cliente'
);

select * from finish();

rollback;
