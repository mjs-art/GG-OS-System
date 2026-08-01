-- =============================================================================
-- Seed de desarrollo.
--
-- TODO lo que hay aquí es FICTICIO. Ni un número real de un cliente real entra
-- a este archivo: vive en git, se comparte, y termina en las máquinas de quien
-- sea que trabaje en el proyecto. Los datos reales se capturan en la app.
--
-- Los nombres de cliente son inventados a propósito, aunque el catálogo real
-- exista: un seed no es el lugar para la cartera de clientes del estudio.
-- =============================================================================

-- --- Usuarios ---------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-0000-4000-8000-000000000001', 'ana@ejemplo.test',      '{"name":"Ana"}'),
  ('11111111-0000-4000-8000-000000000002', 'equipo@ejemplo.test',   '{"name":"Equipo"}'),
  ('11111111-0000-4000-8000-000000000004', 'contacto@barficticio.test', '{"name":"Contacto"}')
on conflict (id) do nothing;

-- --- Organización ------------------------------------------------------------
insert into public.orgs (id, slug, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'estudio-demo', 'Estudio Demo')
on conflict (id) do nothing;

insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-0000-4000-8000-000000000002', 'staff')
on conflict do nothing;

-- --- Clientes ficticios --------------------------------------------------------
insert into public.clients (id, org_id, slug, name, handle, tier, brand_color) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'bar-ficticio', 'Bar Ficticio', '@barficticio', 'premium', '#C08A3E'),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   'hotel-ejemplo', 'Hotel Ejemplo', '@hotelejemplo', 'estándar', '#3E6C8A')
on conflict (id) do nothing;

insert into public.client_users (org_id, client_id, email, name) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'contacto@barficticio.test', 'Contacto del bar')
on conflict do nothing;

-- --- Pilares -------------------------------------------------------------------
insert into public.pillars (id, org_id, client_id, name, color, target_pct, position) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000001', 'Coctelería de autor', '#8E2B1E', 40, 0),
  ('eeeeeeee-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000001', 'Ambiente y música',   '#A67C52', 35, 1),
  ('eeeeeeee-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001',
   'cccccccc-0000-4000-8000-000000000001', 'Detrás de la barra',  '#5F6B5A', 25, 2)
on conflict (id) do nothing;

-- --- Reglas duras ----------------------------------------------------------------
-- Las de `codigo` son las que el Editor de marca verifica sin llamar a un modelo.
insert into public.brand_rules (org_id, client_id, kind, rule, severity, check_by, params) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'hashtags', 'Exactamente 5 hashtags por publicación', 'critica', 'codigo', '{"exact": 5}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'formato', 'Todo el copy en minúsculas', 'alta', 'codigo', '{"lowercase": true}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'promesa', 'Nunca prometer disponibilidad de mesa sin reserva', 'critica', 'modelo', '{}')
on conflict do nothing;

-- --- Context Card -------------------------------------------------------------------
insert into public.context_card_versions (
  org_id, client_id, version, created_by,
  what_it_is, positioning, tone, banned_words, cadence
) values (
  'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1,
  '11111111-0000-4000-8000-000000000001',
  'Bar de coctelería de autor con música en vivo.',
  'El lugar donde la coctelería se toma en serio sin tomarse en serio a sí misma.',
  array['cercano', 'seguro de sí', 'sin solemnidad'],
  array['exclusivo', 'único', 'imperdible'],
  'Feed 5 por semana, stories diario.'
) on conflict do nothing;

-- --- Piezas del mes ---------------------------------------------------------------
-- Una en cada estado del pipeline, para que la interfaz muestre los seis.
insert into public.pieces
  (org_id, client_id, pillar_id, month, format, status, slot_index, hook, hashtags, authored_by)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', '2026-09', 'reel',     'idea',        0,
   'el trago que nadie pide y todos repiten', '{}', '{}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000002', '2026-09', 'carrusel', 'escrito',     1,
   'tres formas de arruinar un old fashioned',
   '{"#cocteleria","#tijuana","#bar","#jazz","#mixologia"}', '{"hook":"redactor"}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000003', '2026-09', 'post',     'revisado',    2,
   'la barra a las 6 y a las 9:40', '{}', '{"hook":"redactor"}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', '2026-09', 'reel',     'con_cliente', 3,
   'lo que pasa cuando pides "algo rico"', '{}', '{"hook":"redactor"}'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000002', '2026-09', 'post',     'aprobado',    4,
   'jueves de jazz, otra vez', '{}', '{}')
on conflict do nothing;

-- Publicada: la restricción de la base exige fecha, así que la lleva.
insert into public.pieces
  (org_id, client_id, pillar_id, month, format, status, slot_index, publish_at, hook)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000003', '2026-08', 'reel', 'publicado', 0,
   '2026-08-14 19:00:00-07', 'nadie limpia hielo así')
on conflict do nothing;

-- --- Agentes -------------------------------------------------------------------------
-- Todos APAGADOS por default. Encender un agente es una decisión consciente por
-- cliente, no algo que hereda del seed.
insert into public.agent_policies (org_id, client_id, agent, enabled, monthly_cap_cents)
select
  'aaaaaaaa-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000001',
  a,
  false,
  500
from unnest(enum_range(null::app.agent_key)) as a
on conflict do nothing;
