-- =============================================================================
-- Cuentas de referencia: aislamiento y ceguera del portal.
--
-- reference_accounts es maquinaria del estudio. Se afirman tres cosas:
--   · Una agencia ve las referencias de sus clientes y solo las suyas.
--   · Una agencia rival no ve ni una referencia del cliente ajeno.
--   · El portal de cliente NO ve las referencias — a quién lo comparamos no es
--     algo que el cliente vea. Que la interfaz no lo pinte no prueba nada; lo
--     que importa es que la base lo niegue.
--
-- IDs en su propio espacio (9999…) y toda aserción acotada a ellos, para que el
-- seed pueda crecer sin romper esta prueba.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

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
-- Fixture — dos agencias, tres clientes.
-- ===========================================================================

insert into auth.users (id, email) values
  ('99991111-0000-4000-8000-000000000001', 'ref-owner@test.invalid'),    -- owner org 1
  ('99991111-0000-4000-8000-000000000002', 'ref-rival@test.invalid'),    -- owner org 2
  ('99991111-0000-4000-8000-000000000003', 'ref-portal@test.invalid');   -- portal cliente A

insert into public.orgs (id, slug, name) values
  ('99990000-0000-4000-8000-000000000001', 'ref-agencia-uno', 'Agencia Uno'),
  ('99990000-0000-4000-8000-000000000002', 'ref-agencia-dos', 'Agencia Dos');

insert into public.org_members (org_id, user_id, role) values
  ('99990000-0000-4000-8000-000000000001', '99991111-0000-4000-8000-000000000001', 'owner'),
  ('99990000-0000-4000-8000-000000000002', '99991111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('99992222-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   'ref-cliente-a', 'Cliente A'),
  ('99992222-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001',
   'ref-cliente-b', 'Cliente B'),
  ('99992222-0000-4000-8000-000000000003', '99990000-0000-4000-8000-000000000002',
   'ref-cliente-c', 'Cliente C');

insert into public.client_users (org_id, client_id, email) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'ref-portal@test.invalid');

insert into public.reference_accounts (org_id, client_id, platform, handle, kind) values
  -- Cliente A: una competencia y una de inspiración.
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'instagram', 'competidor_uno', 'competencia'),
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'instagram', 'nos_inspira', 'inspiracion'),
  -- El vecino: mismo estudio, otro cliente.
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000002',
   'instagram', 'competidor_del_b', 'competencia'),
  -- La agencia rival.
  ('99990000-0000-4000-8000-000000000002', '99992222-0000-4000-8000-000000000003',
   'instagram', 'competidor_del_c', 'competencia');

-- ===========================================================================
-- 1 · La agencia dueña ve lo suyo
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000001', 'ref-owner@test.invalid');

select is(
  (select count(*) from public.reference_accounts
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 2,
  'La agencia ve las dos referencias del Cliente A'
);

select is(
  (select count(*) from public.reference_accounts
    where client_id::text like '99992222%')::int, 3,
  'Ve las de sus clientes (A y B) y ninguna de la agencia rival'
);

select is(
  (select count(*) from public.reference_accounts
    where client_id = '99992222-0000-4000-8000-000000000003')::int, 0,
  'No ve ni una referencia del cliente de la otra agencia'
);

-- ===========================================================================
-- 2 · La agencia rival solo ve lo suyo
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000002', 'ref-rival@test.invalid');

select is(
  (select count(*) from public.reference_accounts
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve ni una referencia del Cliente A'
);

-- ===========================================================================
-- 3 · El portal de cliente no ve nada de esto
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000003', 'ref-portal@test.invalid');

select is(
  (select count(*) from public.reference_accounts
    where client_id::text like '99992222%')::int, 0,
  'El portal jamás ve contra quién se compara a su propia cuenta'
);

select * from finish();

rollback;
