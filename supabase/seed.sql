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
--
-- Insertar solo (id, email) NO alcanza. GoTrue exige `aud`, `role`,
-- `instance_id` y un correo confirmado para considerar que el usuario existe;
-- sin eso, pedir un magic link responde "Signups not allowed for otp" y nadie
-- puede entrar en local. Se ve igual que un problema de configuración y no lo
-- es: son estos campos.
insert into auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  -- Estas columnas TIENEN que ir en cadena vacía, no en NULL.
  -- GoTrue las lee como `string` de Go, que no sabe qué hacer con NULL, y
  -- truena con un 500 opaco: "Scan error on column confirmation_token".
  -- Desde afuera se ve como si el servicio de auth estuviera caído.
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
select
  u.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  u.email,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', u.name),
  now(),
  now(),
  '', '', '', '', '', '', '', ''
from (values
  ('11111111-0000-4000-8000-000000000001'::uuid, 'ana@ejemplo.test',          'Ana'),
  ('11111111-0000-4000-8000-000000000002'::uuid, 'equipo@ejemplo.test',       'Equipo'),
  ('11111111-0000-4000-8000-000000000004'::uuid, 'contacto@barficticio.test', 'Contacto')
) as u(id, email, name)
on conflict (id) do nothing;

-- La identidad de proveedor. Sin ella el usuario existe pero queda sin método
-- de acceso vinculado, y algunos flujos de GoTrue lo tratan como incompleto.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@ejemplo.test' or u.email like '%@barficticio.test'
on conflict (provider_id, provider) do nothing;

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

-- =============================================================================
-- Bar Ficticio, con datos suficientes para que el dashboard tenga qué pintar.
--
-- Todo inventado: los seguidores, el gasto y los resultados son números que se
-- ven razonables para un bar chico, no los de nadie. El "mes actual" de este
-- seed es agosto de 2026, y de ahí cuelgan las fechas.
-- =============================================================================

-- --- Redes ---------------------------------------------------------------------
-- El checklist de perfil se guarda incompleto a propósito: así el semáforo del
-- Auditor tiene algo que señalar desde el primer arranque.
insert into public.social_accounts (
  org_id, client_id, platform, handle, url, followers, followers_delta,
  last_post_at, profile_checklist, unanswered_dms, unanswered_comments,
  posts_per_week, target_per_week, checked_at
) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'instagram', '@barficticio', 'https://instagram.com/barficticio',
   8420, 180, '2026-07-31 21:10:00-07',
   '{"bio": true, "link": true, "highlights": false, "foto": true}'::jsonb,
   12, 7, 4.5, 5, '2026-08-01 09:00:00-07'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'facebook', 'barficticio', 'https://facebook.com/barficticio',
   3110, -24, '2026-07-26 18:00:00-07',
   '{"bio": true, "link": false, "highlights": false, "foto": true}'::jsonb,
   3, 1, 1.5, 3, '2026-08-01 09:00:00-07'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'tiktok', '@barficticio', 'https://tiktok.com/@barficticio',
   1980, 640, '2026-07-30 22:40:00-07',
   '{"bio": true, "link": true, "highlights": true, "foto": false}'::jsonb,
   21, 15, 3, 3, '2026-08-01 09:00:00-07')
on conflict (client_id, platform) do nothing;

-- --- Resultados -------------------------------------------------------------------
insert into public.results_monthly (
  org_id, client_id, month, reach, impressions, saves, shares,
  interactions, new_followers, profile_visits, link_clicks, source
) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-07', 38200, 61400, 410, 168, 2740, 204, 1890, 312, 'manual'),
  -- Agosto va a la mitad: es el mes en curso, no un cierre.
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-08', 12100, 19800, 133, 51, 890, 61, 640, 98, 'manual')
on conflict (client_id, month) do nothing;

-- --- Volumen de septiembre, ya aprobado -------------------------------------------
-- Aprobado, así que el portal del cliente lo ve. Un plan sin approved_at no
-- sale del estudio.
insert into public.volume_plans (
  org_id, client_id, month, feed_counts, story_counts, pillar_mix,
  rationale, capacity_declared, approved_by, approved_at
) values (
  'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
  '2026-09',
  '{"post": 6, "carrusel": 5, "reel": 11}'::jsonb,
  '{"diaria": 30, "campana": 8, "interactiva": 4}'::jsonb,
  jsonb_build_object(
    'eeeeeeee-0000-4000-8000-000000000001', 40,
    'eeeeeeee-0000-4000-8000-000000000002', 35,
    'eeeeeeee-0000-4000-8000-000000000003', 25
  ),
  '{"reel": "En julio el reel promedió 3.1x el alcance del post; se suben 3.", "post": "Se bajan 2: el formato cayó 18% de alcance dos meses seguidos.", "carrusel": "Se sostiene: es el que más guardados trae."}'::jsonb,
  22,
  '11111111-0000-4000-8000-000000000001',
  '2026-08-01 11:30:00-07'
) on conflict (client_id, month) do nothing;

-- --- Fechas clave de los próximos seis meses ----------------------------------------
insert into public.key_dates (
  org_id, client_id, date, title, kind, notes, campaign_idea, has_budget
) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-08-24', 'Aniversario del bar', 'aniversario',
   'Cuatro años. Es la fecha con más tráfico del año.',
   'Semana de cócteles de la casa a precio de apertura.', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-09-15', 'Fiestas patrias', 'festividad',
   'Cierra a las 3 am con permiso especial.',
   'Carta corta de mezcal con maridaje.', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-10-31', 'Noche de disfraces', 'evento',
   'El año pasado se llenó sin pauta.',
   'Concurso de disfraces con jurado de la barra.', false),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-11-20', 'Buen Fin', 'promocion',
   'Solo aplica en consumo de barra.',
   '2x1 de martes a jueves.', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   '2026-12-24', 'Nochebuena', 'festividad',
   'Cierre temprano; se comunica con dos semanas.',
   'Aviso de horario y reservas de fin de año.', false)
on conflict do nothing;

-- --- Pauta -----------------------------------------------------------------------
insert into public.campaigns (
  id, org_id, client_id, name, objective, platform,
  budget_cents, spent_cents, start_date, end_date, status,
  learning_goal, result_metric
) values (
  'dddddddd-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
  'Noche de Jazz', 'Tráfico a reservas', 'instagram',
  -- $2,000 MXN. En centavos y entero, como todo el dinero del sistema.
  200000, 98000, '2026-07-26', '2026-08-08', 'activa',
  'Si el interés frío rinde mejor que los similares para eventos.',
  'reservas'
) on conflict (id) do nothing;

-- Dos ad sets con el mismo presupuesto: es la única forma de que la
-- comparación entre públicos signifique algo.
insert into public.ad_sets (
  id, org_id, client_id, campaign_id, name, audience_type,
  audience_def, budget_cents, spent_cents, status
) values
  ('dddddddd-0000-4000-8000-000000000011',
   'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000001', 'A · Interés', 'interes',
   '{"intereses": ["jazz", "cocteleria", "vida nocturna"], "edad": [25, 45], "geo": ["Tijuana", "Chula Vista"]}'::jsonb,
   100000, 49000, 'activo'),
  ('dddddddd-0000-4000-8000-000000000012',
   'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'dddddddd-0000-4000-8000-000000000001', 'B · Similares', 'similares',
   '{"fuente": "visitantes web 90 dias", "porcentaje": 1}'::jsonb,
   100000, 49000, 'activo')
on conflict (id) do nothing;

-- Los creativos son piezas del planner, no archivos aparte: así el reporte
-- puede decir "el reel del jueves" y no "creativo 3".
insert into public.ad_creatives (org_id, client_id, ad_set_id, piece_id, status)
select
  'aaaaaaaa-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000001',
  s.ad_set_id::uuid,
  p.id,
  'activo'::app.ad_creative_status
from (values
  ('dddddddd-0000-4000-8000-000000000011', 'jueves de jazz, otra vez'),
  ('dddddddd-0000-4000-8000-000000000012', 'jueves de jazz, otra vez')
) as s(ad_set_id, hook)
join public.pieces p
  on p.client_id = 'cccccccc-0000-4000-8000-000000000001'
 and p.hook = s.hook
on conflict (ad_set_id, piece_id) do nothing;

-- Siete días de métricas capturadas a mano. CTR, CPM, CPC y costo por resultado
-- se derivan aquí para que el seed no pueda contradecirse a sí mismo.
insert into public.ad_metrics (
  org_id, client_id, ad_set_id, date, spend_cents, impressions, reach, clicks,
  ctr, cpm_cents, cpc_cents, results, cost_per_result_cents
)
select
  'aaaaaaaa-0000-4000-8000-000000000001',
  'cccccccc-0000-4000-8000-000000000001',
  m.ad_set_id::uuid,
  m.day::date,
  m.spend_cents,
  m.impressions,
  m.reach,
  m.clicks,
  round(m.clicks::numeric * 100 / m.impressions, 3),
  round(m.spend_cents::numeric * 1000 / m.impressions)::integer,
  round(m.spend_cents::numeric / m.clicks)::integer,
  m.results,
  round(m.spend_cents::numeric / m.results)::integer
from (values
  -- Ad set A · interés
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-26', 7000, 4380, 3510,  79, 3),
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-27', 7000, 4610, 3720,  88, 3),
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-28', 7000, 4520, 3640,  84, 2),
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-29', 7000, 4790, 3880,  95, 3),
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-30', 7000, 4700, 3790,  91, 3),
  ('dddddddd-0000-4000-8000-000000000011', '2026-07-31', 7000, 5010, 4020, 104, 4),
  ('dddddddd-0000-4000-8000-000000000011', '2026-08-01', 7000, 4880, 3950,  99, 3),
  -- Ad set B · similares. Mismo gasto, la mitad de clics y un tercio de los
  -- resultados: es el contraste que dispara la propuesta del Pautero.
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-26', 7000, 5240, 4180, 44, 1),
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-27', 7000, 5410, 4310, 47, 1),
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-28', 7000, 5180, 4120, 41, 1),
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-29', 7000, 5330, 4260, 45, 1),
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-30', 7000, 5290, 4200, 43, 1),
  ('dddddddd-0000-4000-8000-000000000012', '2026-07-31', 7000, 5460, 4370, 49, 2),
  ('dddddddd-0000-4000-8000-000000000012', '2026-08-01', 7000, 5370, 4290, 46, 1)
) as m(ad_set_id, day, spend_cents, impressions, reach, clicks, results)
on conflict (ad_set_id, date) do nothing;

-- La propuesta del Pautero, sin decidir. Nace en 'propuesta' y ahí se queda
-- hasta que una persona la apruebe: el agente no ejecuta nada.
insert into public.ad_proposals (
  id, org_id, client_id, campaign_id, ad_set_id, kind,
  rationale, expected_impact, risk, alternative, status, instructions
) values (
  'dddddddd-0000-4000-8000-000000000021',
  'aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000012',
  'mover_presupuesto',
  'El ad set B (similares) va en $65 por resultado y A en $24: 2.7 veces más caro con el mismo gasto.',
  'Alrededor de 18 resultados adicionales al cierre de la campaña.',
  'Perdemos la lectura completa de similares para el evento de septiembre.',
  '{"kind": "bajar_presupuesto", "rationale": "Dejar B con $200 solo para conservar el dato.", "instructions": "Bajar el presupuesto diario de B a $30 en lugar de pausarlo."}'::jsonb,
  'propuesta',
  'En Meta Ads: pausar el ad set B y subir el presupuesto diario de A de $70 a $130 hasta el 8 de agosto.'
) on conflict (id) do nothing;

-- --- Pendientes ---------------------------------------------------------------------
-- La columna que hace útil la lista es de quién depende: separa lo que se puede
-- resolver hoy de lo que lleva días esperando al cliente.
insert into public.tasks (org_id, client_id, title, depends_on, status, due_date) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Recibir fotos nuevas de la barra', 'cliente', 'bloqueada', '2026-08-05'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Cerrar el guion del reel de aniversario', 'yo', 'en_curso', '2026-08-10'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Auditar cuentas antes de la junta mensual', 'agente', 'pendiente', '2026-08-15'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Capturar métricas de julio del ads manager', 'yo', 'hecha', '2026-08-01')
on conflict do nothing;

-- --- Eventos y sesiones -----------------------------------------------------------
insert into public.events (org_id, client_id, title, scheduled_on, place, notes) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Sesión de foto de la carta nueva', '2026-08-12', 'Barra principal',
   'Luz natural; llegar antes de las 4 pm.'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001',
   'Cobertura del aniversario', '2026-08-24', 'Bar Ficticio',
   'Video vertical toda la noche; se corta en tres reels.')
on conflict do nothing;
