-- =============================================================================
-- Pruebas del resto del esquema: redes, resultados, volumen, fechas,
-- tendencias, guiones, pauta, pendientes y eventos.
--
-- Dos cosas se afirman aquí y no se pueden afirmar en ningún otro lado:
--
--   · La superficie del portal de cliente. Lo que el cliente ve es una lista
--     corta y cerrada; todo lo demás —propuestas de pauta, métricas, guiones,
--     tendencias, pendientes— es maquinaria del estudio. Que hoy la interfaz no
--     lo pinte no prueba nada: lo que importa es que la base lo niegue.
--   · Que aprobar una propuesta del Pautero no mueve dinero. Es la regla de
--     producto más cara de romper y la más fácil de romper sin darse cuenta.
--
-- Mismas dos decisiones de forma que en rls_aislamiento_test: siempre hay un
-- vecino, y los IDs viven en su propio espacio (8888…) con toda aserción
-- acotada a ellos, para que el seed pueda crecer sin romper estas pruebas.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- Helpers de sesión. Reproducen lo que hace PostgREST con el JWT.
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

-- ===========================================================================
-- Fixture — dos agencias, tres clientes, una campaña de cada lado.
-- ===========================================================================

insert into auth.users (id, email) values
  ('88881111-0000-4000-8000-000000000001', 'resto-owner@test.invalid'),   -- owner org 1
  ('88881111-0000-4000-8000-000000000002', 'resto-rival@test.invalid'),   -- owner org 2
  ('88881111-0000-4000-8000-000000000003', 'resto-portal@test.invalid');  -- portal cliente A

insert into public.orgs (id, slug, name) values
  ('88880000-0000-4000-8000-000000000001', 'resto-agencia-uno', 'Agencia Uno'),
  ('88880000-0000-4000-8000-000000000002', 'resto-agencia-dos', 'Agencia Dos');

insert into public.org_members (org_id, user_id, role) values
  ('88880000-0000-4000-8000-000000000001', '88881111-0000-4000-8000-000000000001', 'owner'),
  ('88880000-0000-4000-8000-000000000002', '88881111-0000-4000-8000-000000000002', 'owner');

insert into public.clients (id, org_id, slug, name) values
  ('88882222-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   'resto-cliente-a', 'Cliente A'),
  ('88882222-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000001',
   'resto-cliente-b', 'Cliente B'),
  ('88882222-0000-4000-8000-000000000003', '88880000-0000-4000-8000-000000000002',
   'resto-cliente-c', 'Cliente C');

insert into public.client_users (org_id, client_id, email) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   'resto-portal@test.invalid');

-- --- Lo que el cliente SÍ debe ver -------------------------------------------

insert into public.results_monthly (org_id, client_id, month, reach, new_followers) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '2026-07', 41000, 180),
  -- El vecino: mismo estudio, otro cliente.
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000002',
   '2026-07', 9000, 12);

insert into public.key_dates (org_id, client_id, date, title, kind) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '2026-09-15', 'Fiestas patrias', 'festividad'),
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '2026-10-31', 'Noche de disfraces', 'evento');

insert into public.volume_plans
  (id, org_id, client_id, month, capacity_declared, approved_by, approved_at)
values
  ('88887777-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', '2026-09', 22,
   '88881111-0000-4000-8000-000000000001', now()),
  -- Todavía en borrador: nadie del lado del cliente debe saber que existe.
  ('88887777-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', '2026-10', 24, null, null);

-- --- Maquinaria del estudio ----------------------------------------------------

insert into public.trends (id, org_id, platform, kind, title, momentum) values
  ('88888888-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   'tiktok', 'audio', 'audio de prueba', 'subiendo');

insert into public.scripts (org_id, client_id, trend_id, fit_score, duration_s) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '88888888-0000-4000-8000-000000000001', 78, 22);

insert into public.account_audits (org_id, client_id, platform, score) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   'instagram', 64);

insert into public.tasks (org_id, client_id, title, depends_on) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   'pedir fotos nuevas', 'cliente');

insert into public.events (org_id, client_id, title, scheduled_on) values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   'sesión de barra', '2026-09-03');

-- --- Pauta, de los dos lados -----------------------------------------------------

insert into public.campaigns
  (id, org_id, client_id, name, objective, platform,
   budget_cents, spent_cents, start_date, end_date, status)
values
  ('88884444-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', 'Noche de Jazz', 'Tráfico a reservas',
   'instagram', 200000, 98000, '2026-09-08', '2026-09-14', 'activa'),
  ('88884444-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000002',
   '88882222-0000-4000-8000-000000000003', 'Campaña de la rival', 'Alcance',
   'facebook', 150000, 0, '2026-09-01', '2026-09-30', 'activa');

insert into public.ad_sets
  (id, org_id, client_id, campaign_id, name, audience_type, budget_cents, spent_cents)
values
  ('88885555-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', '88884444-0000-4000-8000-000000000001',
   'A · Interés', 'interes', 100000, 49000),
  ('88885555-0000-4000-8000-000000000002', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', '88884444-0000-4000-8000-000000000001',
   'B · Similares', 'similares', 100000, 49000);

insert into public.ad_metrics
  (org_id, client_id, ad_set_id, date, spend_cents, impressions, reach, clicks, results)
values
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '88885555-0000-4000-8000-000000000001', '2026-09-08', 14000, 9200, 7100, 180, 5),
  ('88880000-0000-4000-8000-000000000001', '88882222-0000-4000-8000-000000000001',
   '88885555-0000-4000-8000-000000000002', '2026-09-08', 14000, 8100, 6400, 90, 2);

insert into public.ad_proposals
  (id, org_id, client_id, campaign_id, ad_set_id, kind, rationale, expected_impact, risk)
values
  ('88886666-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   '88882222-0000-4000-8000-000000000001', '88884444-0000-4000-8000-000000000001',
   '88885555-0000-4000-8000-000000000002', 'mover_presupuesto',
   'B va a 2.7× el costo por resultado de A.',
   '~18 resultados adicionales al cierre',
   'Perdemos la lectura completa de similares.');

-- ===========================================================================
-- 1 · El portal no ve la maquinaria
-- ===========================================================================

select pg_temp.login('88881111-0000-4000-8000-000000000003', 'resto-portal@test.invalid');

select is(
  (select count(*) from public.ad_proposals
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve una propuesta del Pautero'
);

select is(
  (select count(*) from public.ad_metrics
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve las métricas de pauta'
);

select is(
  (select count(*) from public.trends
    where org_id::text like '88880000%')::int, 0,
  'El portal jamás ve el radar de tendencias del estudio'
);

select is(
  (select count(*) from public.scripts
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve los guiones propuestos'
);

select is(
  (select count(*) from public.tasks
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve los pendientes del estudio'
);

select is(
  (select count(*) from public.events
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve las sesiones agendadas'
);

select is(
  (select count(*) from public.account_audits
    where client_id::text like '88882222%')::int, 0,
  'El portal jamás ve la auditoría de sus propias cuentas'
);

-- La tabla `campaigns` no tiene ni una política para el portal a propósito:
-- la única puerta es la vista, que no expone presupuesto ni gasto.
select is(
  (select count(*) from public.campaigns
    where client_id::text like '88882222%')::int, 0,
  'El portal no lee la tabla de campañas directamente'
);

-- ===========================================================================
-- 2 · El portal sí ve lo suyo, y solo lo suyo
-- ===========================================================================

select is(
  (select count(*) from public.results_monthly
    where client_id::text like '88882222%')::int, 1,
  'El portal ve los resultados de su cliente y de ningún otro'
);

select is(
  (select reach from public.results_monthly
    where client_id::text like '88882222%')::int, 41000,
  'Y son los números de su cliente, no los del vecino'
);

select is(
  (select count(*) from public.key_dates
    where client_id::text like '88882222%')::int, 2,
  'El portal ve las fechas clave de su cliente'
);

select is(
  (select count(*) from public.volume_plans
    where client_id::text like '88882222%')::int, 1,
  'El portal ve un solo plan de volumen: el que ya se aprobó'
);

select is(
  (select month from public.volume_plans
    where client_id::text like '88882222%')::text, '2026-09',
  'El plan de octubre sigue en borrador y el cliente no lo ve'
);

select is(
  (select count(*) from public.campaigns_para_cliente
    where client_id::text like '88882222%')::int, 1,
  'El portal ve su campaña por la vista recortada'
);

select hasnt_column(
  'public', 'campaigns_para_cliente', 'budget_cents',
  'La vista del cliente no tiene columna de presupuesto'
);

select hasnt_column(
  'public', 'campaigns_para_cliente', 'learned',
  'La vista del cliente no tiene el aprendizaje interno del estudio'
);

-- ===========================================================================
-- 3 · Una agencia no ve la pauta de la otra
-- ===========================================================================

select pg_temp.login('88881111-0000-4000-8000-000000000002', 'resto-rival@test.invalid');

select is(
  (select count(*) from public.campaigns where id::text like '88884444%')::int, 1,
  'La agencia rival ve una sola campaña: la suya'
);

select is(
  (select count(*) from public.campaigns
    where client_id = '88882222-0000-4000-8000-000000000001')::int, 0,
  'La agencia rival no ve ni una campaña del Cliente A'
);

select is(
  (select count(*) from public.ad_sets where id::text like '88885555%')::int, 0,
  'La agencia rival no ve los ad sets ajenos'
);

select is(
  (select count(*) from public.ad_metrics
    where client_id::text like '88882222%')::int, 0,
  'La agencia rival no ve el gasto ajeno'
);

select is(
  (select count(*) from public.trends where id::text like '88888888%')::int, 0,
  'El radar de tendencias no cruza de una agencia a la otra'
);

select pg_temp.login('88881111-0000-4000-8000-000000000001', 'resto-owner@test.invalid');

select is(
  (select count(*) from public.trends where id::text like '88888888%')::int, 1,
  'Pero el estudio dueño del radar sí lo ve'
);

-- ===========================================================================
-- 4 · Aprobar una propuesta no mueve un solo peso.
--
-- El agente propone y la persona ejecuta en el ads manager. Aquí se afirma que
-- la base lo hace cumplir por sí sola: aprobar deja los presupuestos intactos, y
-- cualquier intento de moverlos dentro de esa misma transacción truena.
-- ===========================================================================

select lives_ok(
  $$ update public.ad_proposals
       set status = 'aprobada',
           approved_by = '88881111-0000-4000-8000-000000000001',
           instructions = 'En Meta Ads: pausar el ad set B y subir el diario de A a $200.'
     where id = '88886666-0000-4000-8000-000000000001' $$,
  'El estudio sí puede aprobar una propuesta'
);

select is(
  (select budget_cents from public.campaigns
    where id = '88884444-0000-4000-8000-000000000001')::int, 200000,
  'Aprobar no tocó el presupuesto de la campaña'
);

select is(
  (select sum(budget_cents) from public.ad_sets
    where id::text like '88885555%')::int, 200000,
  'Aprobar no tocó el presupuesto de ningún ad set'
);

-- Y no es que "hoy nadie lo mueva": está prohibido. Si mañana alguien agrega un
-- trigger que sincronice la propuesta con la campaña, falla aquí.
select throws_ok(
  $$ update public.campaigns set budget_cents = 260000
     where id = '88884444-0000-4000-8000-000000000001' $$,
  null,
  'Mover el presupuesto de la campaña al aprobar es imposible'
);

select throws_ok(
  $$ update public.ad_sets set budget_cents = 40000
     where id = '88885555-0000-4000-8000-000000000002' $$,
  null,
  'Mover el presupuesto de un ad set al aprobar es imposible'
);

select * from finish();

rollback;
