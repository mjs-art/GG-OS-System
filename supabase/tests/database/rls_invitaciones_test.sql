-- =============================================================================
-- Pruebas de org_invites y accept_pending_invites().
--
-- El riesgo aquí no es que un extraño vea invitaciones ajenas —eso ya lo cubre
-- el patrón de is_org_owner que comparte con org_members— sino que aceptar una
-- invitación falle en silencio o le dé membership a quien no debía. Por eso la
-- mitad de estas pruebas no son de aislamiento sino del camino feliz completo:
-- invitar → entrar → quedar como miembro con el rol correcto.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

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

-- ---------------------------------------------------------------------------
-- Fixture — dos agencias, un owner y un staff en la primera, y a quien se
-- invita: todavía sin ninguna fila en org_members.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('99995555-0000-4000-8000-000000000001', 'inv-owner@test.invalid'),
  ('99995555-0000-4000-8000-000000000002', 'inv-staff@test.invalid'),
  ('99995555-0000-4000-8000-000000000003', 'inv-rival@test.invalid'),
  ('99995555-0000-4000-8000-000000000004', 'inv-nuevo@test.invalid');

insert into public.orgs (id, slug, name) values
  ('99994444-0000-4000-8000-000000000001', 'inv-agencia-uno', 'Agencia Uno Inv'),
  ('99994444-0000-4000-8000-000000000002', 'inv-agencia-dos', 'Agencia Dos Inv');

insert into public.org_members (org_id, user_id, role) values
  ('99994444-0000-4000-8000-000000000001', '99995555-0000-4000-8000-000000000001', 'owner'),
  ('99994444-0000-4000-8000-000000000001', '99995555-0000-4000-8000-000000000002', 'staff'),
  ('99994444-0000-4000-8000-000000000002', '99995555-0000-4000-8000-000000000003', 'owner');

-- ===========================================================================
-- 1 · Solo el owner administra invitaciones
-- ===========================================================================

select pg_temp.login('99995555-0000-4000-8000-000000000001', 'inv-owner@test.invalid');

select lives_ok(
  $$ insert into public.org_invites (org_id, email, role, invited_by)
     values ('99994444-0000-4000-8000-000000000001', 'inv-nuevo@test.invalid', 'staff',
             '99995555-0000-4000-8000-000000000001') $$,
  'El owner puede invitar a alguien nuevo'
);

select is(
  (select count(*) from public.org_invites
    where org_id = '99994444-0000-4000-8000-000000000001')::int,
  1,
  'El owner ve la invitación que acaba de crear'
);

select pg_temp.login('99995555-0000-4000-8000-000000000002', 'inv-staff@test.invalid');

select throws_ok(
  $$ insert into public.org_invites (org_id, email, role, invited_by)
     values ('99994444-0000-4000-8000-000000000001', 'otro@test.invalid', 'staff',
             '99995555-0000-4000-8000-000000000002') $$,
  null,
  'Un staff no puede invitar: solo el owner administra el equipo'
);

select is(
  (select count(*) from public.org_invites
    where org_id = '99994444-0000-4000-8000-000000000001')::int,
  0,
  'Un staff ni siquiera ve las invitaciones pendientes de su propia org'
);

select pg_temp.login('99995555-0000-4000-8000-000000000003', 'inv-rival@test.invalid');

select is(
  (select count(*) from public.org_invites
    where org_id = '99994444-0000-4000-8000-000000000001')::int,
  0,
  'La agencia rival no ve las invitaciones de otra agencia'
);

-- ===========================================================================
-- 2 · accept_pending_invites(): el camino feliz completo
-- ===========================================================================

select pg_temp.login('99995555-0000-4000-8000-000000000004', 'inv-nuevo@test.invalid');

select is(
  (select count(*) from public.org_members
    where user_id = '99995555-0000-4000-8000-000000000004')::int,
  0,
  'Antes de aceptar, el invitado todavía no es miembro de nada'
);

select lives_ok(
  $$ select public.accept_pending_invites() $$,
  'El invitado puede aceptar sus invitaciones pendientes'
);

select is(
  (select role from public.org_members
    where org_id = '99994444-0000-4000-8000-000000000001'
      and user_id = '99995555-0000-4000-8000-000000000004')::text,
  'staff',
  'Al aceptar, el invitado queda como miembro con el rol de la invitación'
);

select pg_temp.as_superuser();

select is(
  (select count(*) from public.org_invites
    where org_id = '99994444-0000-4000-8000-000000000001'
      and email = 'inv-nuevo@test.invalid'
      and accepted_at is not null)::int,
  1,
  'La invitación queda marcada como aceptada'
);

-- Sin invitaciones pendientes, aceptar no truena y no hace nada.
select pg_temp.login('99995555-0000-4000-8000-000000000003', 'inv-rival@test.invalid');

select lives_ok(
  $$ select public.accept_pending_invites() $$,
  'Aceptar sin invitaciones pendientes no truena'
);

select * from finish();

rollback;
