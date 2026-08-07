-- =============================================================================
-- Pruebas de WhatsApp: aislamiento entre agencias y la regla #1 en la base.
--
-- Dos cosas se afirman aquí y en ningún otro lado:
--
--   · El hilo de WhatsApp es maquinaria del estudio. El usuario del portal —el
--     cliente— está del OTRO lado de WhatsApp, no lee la app: no ve ni una
--     conversación, ni un mensaje, ni su propia retro dentro del sistema.
--   · La regla #1 la hace cumplir la base: un saliente 'enviado' sin aprobación
--     es imposible (CHECK), y `authenticated` no puede marcar enviado ni sellar
--     el envío (RLS) — solo redactar y aprobar.
--
-- Misma forma que rls_resto_test: siempre hay un vecino, los IDs viven en su
-- propio espacio (9999…) y toda aserción se acota a ellos.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

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
-- Fixture — dos agencias, dos clientes, un hilo del lado del Cliente A.
-- ===========================================================================

insert into auth.users (id, email) values
  ('99991111-0000-4000-8000-000000000001', 'wa-owner@test.invalid'),   -- owner org 1
  ('99991111-0000-4000-8000-000000000002', 'wa-rival@test.invalid'),   -- owner org 2
  ('99991111-0000-4000-8000-000000000003', 'wa-portal@test.invalid');  -- portal cliente A

insert into public.orgs (id, slug, name) values
  ('99990000-0000-4000-8000-000000000001', 'wa-agencia-uno', 'Agencia Uno'),
  ('99990000-0000-4000-8000-000000000002', 'wa-agencia-dos', 'Agencia Dos');

insert into public.org_members (org_id, user_id, role) values
  ('99990000-0000-4000-8000-000000000001', '99991111-0000-4000-8000-000000000001', 'owner'),
  ('99990000-0000-4000-8000-000000000002', '99991111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('99992222-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   'wa-cliente-a', 'Cliente A'),
  ('99992222-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000002',
   'wa-cliente-c', 'Cliente C');

insert into public.client_users (org_id, client_id, email) values
  ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
   'wa-portal@test.invalid');

insert into public.wa_conversations (id, org_id, client_id, wa_phone) values
  ('99993333-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '+525512345678');

insert into public.wa_messages (id, org_id, client_id, conversation_id, direction, status, body)
values
  ('99994444-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '99993333-0000-4000-8000-000000000001',
   'inbound', 'received', '¿Ya está el reel de la promo?'),
  ('99994444-0000-4000-8000-000000000002', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '99993333-0000-4000-8000-000000000001',
   'outbound', 'borrador', 'Te comparto la propuesta.');

insert into public.wa_feedback (id, org_id, client_id, conversation_id, kind, body) values
  ('99995555-0000-4000-8000-000000000001', '99990000-0000-4000-8000-000000000001',
   '99992222-0000-4000-8000-000000000001', '99993333-0000-4000-8000-000000000001',
   'cambio', 'Cámbienle el color a la portada.');

-- ===========================================================================
-- 1 · La regla #1 vive en la base. Como superusuario se salta RLS, así que lo
--     que truena aquí es el CHECK, no una política — a prueba de service_role.
-- ===========================================================================

select throws_ok(
  $$ insert into public.wa_messages
       (org_id, client_id, conversation_id, direction, status, body)
     values ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000001', 'outbound', 'enviado', 'sin aprobar') $$,
  null,
  'Un saliente enviado sin aprobación es imposible, ni con service_role'
);

select throws_ok(
  $$ insert into public.wa_messages
       (org_id, client_id, conversation_id, direction, status, body, approved_by)
     values ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000001', 'outbound', 'aprobado', 'a medias',
             '99991111-0000-4000-8000-000000000001') $$,
  null,
  'Aprobado con quién pero sin cuándo (o al revés) es imposible'
);

-- ===========================================================================
-- 2 · El portal —el cliente— no ve la maquinaria de WhatsApp.
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000003', 'wa-portal@test.invalid');

select is(
  (select count(*) from public.wa_conversations
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 0,
  'El portal no ve ni una conversación de WhatsApp'
);

select is(
  (select count(*) from public.wa_messages
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 0,
  'El portal no ve ni un mensaje de WhatsApp'
);

select is(
  (select count(*) from public.wa_feedback
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 0,
  'El portal no ve su propia retro dentro del sistema'
);

-- ===========================================================================
-- 3 · Una agencia no ve el WhatsApp de la otra.
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000002', 'wa-rival@test.invalid');

select is(
  (select count(*) from public.wa_conversations
    where org_id = '99990000-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve las conversaciones ajenas'
);

select is(
  (select count(*) from public.wa_messages
    where org_id = '99990000-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve los mensajes ajenos'
);

select is(
  (select count(*) from public.wa_feedback
    where org_id = '99990000-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve la retro ajena'
);

-- ===========================================================================
-- 4 · El estudio dueño sí ve lo suyo, y solo puede redactar/aprobar.
-- ===========================================================================

select pg_temp.login('99991111-0000-4000-8000-000000000001', 'wa-owner@test.invalid');

select is(
  (select count(*) from public.wa_conversations
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 1,
  'El estudio ve la conversación de su cliente'
);

select is(
  (select count(*) from public.wa_messages
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 2,
  'El estudio ve el entrante y el borrador de su cliente'
);

select is(
  (select count(*) from public.wa_feedback
    where client_id = '99992222-0000-4000-8000-000000000001')::int, 1,
  'El estudio ve la retro de su cliente'
);

select lives_ok(
  $$ insert into public.wa_messages
       (org_id, client_id, conversation_id, direction, status, body)
     values ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000001', 'outbound', 'borrador', 'otro borrador') $$,
  'El estudio sí puede redactar un borrador saliente'
);

select throws_ok(
  $$ update public.wa_messages set status = 'enviado'
     where id = '99994444-0000-4000-8000-000000000002' $$,
  null,
  'El estudio no puede marcar enviado: eso lo hace el emisor, no el navegador'
);

select throws_ok(
  $$ insert into public.wa_messages
       (org_id, client_id, conversation_id, direction, status, body)
     values ('99990000-0000-4000-8000-000000000001', '99992222-0000-4000-8000-000000000001',
             '99993333-0000-4000-8000-000000000001', 'inbound', 'received', 'entrante falso') $$,
  null,
  'El estudio no puede fabricar un entrante haciéndose pasar por el cliente'
);

select * from finish();

rollback;
