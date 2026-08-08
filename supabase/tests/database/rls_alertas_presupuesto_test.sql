-- =============================================================================
-- Pruebas de budget_alerts: aislamiento y append-only.
--
-- Dos cosas se afirman aquí:
--   · El aviso de gasto es maquinaria del estudio. El portal no lo ve, y una
--     agencia no ve el de otra.
--   · Es append-only de verdad: `authenticated` solo puede LEER. No inserta
--     (eso lo hace el runner con service_role), y no puede editar ni borrar un
--     aviso — un log de auditoría que se puede alterar no es auditoría.
--
-- Misma forma que rls_whatsapp_test: siempre hay un vecino, los IDs viven en su
-- propio espacio (9998…) y toda aserción se acota a ellos.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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

-- ===========================================================================
-- Fixture — dos agencias, un aviso del lado del Cliente A. Se inserta como
-- superusuario (salta RLS) porque en producción lo escribe service_role.
-- ===========================================================================

insert into auth.users (id, email) values
  ('99981111-0000-4000-8000-000000000001', 'ap-owner@test.invalid'),   -- owner org 1
  ('99981111-0000-4000-8000-000000000002', 'ap-rival@test.invalid'),   -- owner org 2
  ('99981111-0000-4000-8000-000000000003', 'ap-portal@test.invalid');  -- portal cliente A

insert into public.orgs (id, slug, name) values
  ('99980000-0000-4000-8000-000000000001', 'ap-agencia-uno', 'AP Uno'),
  ('99980000-0000-4000-8000-000000000002', 'ap-agencia-dos', 'AP Dos');

insert into public.org_members (org_id, user_id, role) values
  ('99980000-0000-4000-8000-000000000001', '99981111-0000-4000-8000-000000000001', 'owner'),
  ('99980000-0000-4000-8000-000000000002', '99981111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('99982222-0000-4000-8000-000000000001', '99980000-0000-4000-8000-000000000001',
   'ap-cliente-a', 'Cliente A'),
  ('99982222-0000-4000-8000-000000000002', '99980000-0000-4000-8000-000000000002',
   'ap-cliente-c', 'Cliente C');

insert into public.client_users (org_id, client_id, email) values
  ('99980000-0000-4000-8000-000000000001', '99982222-0000-4000-8000-000000000001',
   'ap-portal@test.invalid');

insert into public.budget_alerts (id, org_id, client_id, agent, spent_cents, cap_cents, estado)
values
  ('99984444-0000-4000-8000-000000000001', '99980000-0000-4000-8000-000000000001',
   '99982222-0000-4000-8000-000000000001', 'redactor', 820, 1000, 'aviso');

-- ===========================================================================
-- 1 · El portal —el cliente— no ve la maquinaria de gasto.
-- ===========================================================================

select pg_temp.login('99981111-0000-4000-8000-000000000003', 'ap-portal@test.invalid');

select is(
  (select count(*) from public.budget_alerts
    where client_id = '99982222-0000-4000-8000-000000000001')::int, 0,
  'El portal no ve ni un aviso de presupuesto'
);

-- ===========================================================================
-- 2 · Una agencia no ve los avisos de la otra.
-- ===========================================================================

select pg_temp.login('99981111-0000-4000-8000-000000000002', 'ap-rival@test.invalid');

select is(
  (select count(*) from public.budget_alerts
    where org_id = '99980000-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve los avisos ajenos'
);

-- ===========================================================================
-- 3 · El estudio dueño sí ve lo suyo, pero solo puede leer.
-- ===========================================================================

select pg_temp.login('99981111-0000-4000-8000-000000000001', 'ap-owner@test.invalid');

select is(
  (select count(*) from public.budget_alerts
    where client_id = '99982222-0000-4000-8000-000000000001')::int, 1,
  'El estudio ve el aviso de su cliente'
);

select throws_ok(
  $$ insert into public.budget_alerts
       (org_id, client_id, agent, spent_cents, cap_cents, estado)
     values ('99980000-0000-4000-8000-000000000001', '99982222-0000-4000-8000-000000000001',
             'redactor', 900, 1000, 'aviso') $$,
  null,
  'El estudio no puede fabricar un aviso: eso lo hace el runner con service_role'
);

select throws_ok(
  $$ update public.budget_alerts set spent_cents = 0
     where id = '99984444-0000-4000-8000-000000000001' $$,
  null,
  'El estudio no puede editar un aviso ya registrado'
);

select throws_ok(
  $$ delete from public.budget_alerts
     where id = '99984444-0000-4000-8000-000000000001' $$,
  null,
  'El estudio no puede borrar un aviso: el log es append-only'
);

select * from finish();

rollback;
