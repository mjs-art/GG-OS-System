-- =============================================================================
-- Pruebas de video_summaries: aislamiento y append-only.
--
-- Igual que budget_alerts: maquinaria 100% interna (regla #3, el portal no la
-- ve), append-only (solo el compositor con service_role escribe), y aquí
-- además con el caso de investigación general (client_id nulo) — el estudio
-- la ve por ser miembro de la org, no por ser "staff de un cliente".
--
-- Misma forma que el resto: siempre hay un vecino, IDs en su propio espacio
-- (9997…).
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
-- Fixture — dos agencias, un cliente del lado de la primera, un portal, y dos
-- corridas de investigador: una con cliente, una general (sin cliente).
-- ===========================================================================

insert into auth.users (id, email) values
  ('99971111-0000-4000-8000-000000000001', 'vs-owner@test.invalid'),
  ('99971111-0000-4000-8000-000000000002', 'vs-rival@test.invalid'),
  ('99971111-0000-4000-8000-000000000003', 'vs-portal@test.invalid');

insert into public.orgs (id, slug, name) values
  ('99970000-0000-4000-8000-000000000001', 'vs-agencia-uno', 'VS Uno'),
  ('99970000-0000-4000-8000-000000000002', 'vs-agencia-dos', 'VS Dos');

insert into public.org_members (org_id, user_id, role) values
  ('99970000-0000-4000-8000-000000000001', '99971111-0000-4000-8000-000000000001', 'owner'),
  ('99970000-0000-4000-8000-000000000002', '99971111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('99972222-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000001',
   'vs-cliente-a', 'Cliente A');

insert into public.client_users (org_id, client_id, email) values
  ('99970000-0000-4000-8000-000000000001', '99972222-0000-4000-8000-000000000001',
   'vs-portal@test.invalid');

insert into public.agent_runs (id, org_id, client_id, agent, status, cost_cents) values
  ('99973333-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000001',
   '99972222-0000-4000-8000-000000000001', 'redactor', 'ok', 0),
  ('99973333-0000-4000-8000-000000000002', '99970000-0000-4000-8000-000000000001',
   null, 'redactor', 'ok', 0);

insert into public.video_summaries
  (id, org_id, run_id, client_id, youtube_url, transcript, summary) values
  ('99974444-0000-4000-8000-000000000001', '99970000-0000-4000-8000-000000000001',
   '99973333-0000-4000-8000-000000000001', '99972222-0000-4000-8000-000000000001',
   'https://youtube.com/watch?v=a', 'transcripción de prueba', 'resumen para el cliente A'),
  ('99974444-0000-4000-8000-000000000002', '99970000-0000-4000-8000-000000000001',
   '99973333-0000-4000-8000-000000000002', null,
   'https://youtube.com/watch?v=b', 'transcripción general', 'resumen de investigación general');

-- ===========================================================================
-- 1 · El portal no ve nada de esto — es maquinaria interna.
-- ===========================================================================

select pg_temp.login('99971111-0000-4000-8000-000000000003', 'vs-portal@test.invalid');

select is(
  (select count(*) from public.video_summaries
    where org_id = '99970000-0000-4000-8000-000000000001')::int, 0,
  'El portal no ve ninguna investigación'
);

-- ===========================================================================
-- 2 · La agencia rival no ve ni la de cliente ni la general.
-- ===========================================================================

select pg_temp.login('99971111-0000-4000-8000-000000000002', 'vs-rival@test.invalid');

select is(
  (select count(*) from public.video_summaries
    where org_id = '99970000-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve ninguna investigación ajena, con o sin cliente'
);

-- ===========================================================================
-- 3 · El estudio dueño ve las dos, pero solo puede leer.
-- ===========================================================================

select pg_temp.login('99971111-0000-4000-8000-000000000001', 'vs-owner@test.invalid');

select is(
  (select count(*) from public.video_summaries
    where id = '99974444-0000-4000-8000-000000000001')::int, 1,
  'El estudio ve la investigación de su cliente'
);

select is(
  (select count(*) from public.video_summaries
    where id = '99974444-0000-4000-8000-000000000002')::int, 1,
  'El estudio ve la investigación general (sin cliente) de su propia org'
);

select throws_ok(
  $$ insert into public.video_summaries
       (org_id, run_id, client_id, youtube_url, transcript, summary)
     values ('99970000-0000-4000-8000-000000000001', '99973333-0000-4000-8000-000000000001',
             '99972222-0000-4000-8000-000000000001', 'https://youtube.com/watch?v=c',
             't', 'resumen fabricado') $$,
  null,
  'El estudio no puede fabricar una investigación: la escribe el compositor con service_role'
);

select throws_ok(
  $$ update public.video_summaries set summary = 'lo cambio yo'
     where id = '99974444-0000-4000-8000-000000000001' $$,
  null,
  'El estudio no puede editar una investigación ya registrada'
);

select * from finish();

rollback;
