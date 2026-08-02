-- =============================================================================
-- El trigger que siembra las agent_policies al dar de alta un cliente (0012).
--
-- Lo que se fija: dar de alta un cliente deja SIEMPRE sus ocho agentes listos
-- para encender, apagados y con el tope por default. Sin esto, el switch de
-- agentes de un cliente recién creado afecta cero renglones y no dice nada.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

-- Fixture en su propio espacio de IDs (8888…) para no chocar con el seed.
insert into public.orgs (id, slug, name) values
  ('88880000-0000-4000-8000-000000000001', 'alta-org', 'Agencia Alta');

insert into public.clients (id, org_id, slug, name) values
  ('88882222-0000-4000-8000-000000000001', '88880000-0000-4000-8000-000000000001',
   'cliente-nuevo', 'Cliente Nuevo');

-- 1 · Se sembraron exactamente las ocho, una por agente.
select is(
  (select count(*)::int from public.agent_policies
    where client_id = '88882222-0000-4000-8000-000000000001'),
  8,
  'Dar de alta un cliente siembra una política por cada uno de los 8 agentes'
);

select is(
  (select count(distinct agent)::int from public.agent_policies
    where client_id = '88882222-0000-4000-8000-000000000001'),
  (select count(*)::int from unnest(enum_range(null::app.agent_key))),
  'Hay una política por agente del enum, sin faltantes ni repetidos'
);

-- 2 · Todas apagadas: encender es una decisión consciente, no algo heredado.
select is(
  (select count(*)::int from public.agent_policies
    where client_id = '88882222-0000-4000-8000-000000000001' and enabled),
  0,
  'Ningún agente queda encendido al dar de alta'
);

-- 3 · Con el tope por default, no en cero (cero pararía al runner de inmediato).
select is(
  (select count(*)::int from public.agent_policies
    where client_id = '88882222-0000-4000-8000-000000000001'
      and monthly_cap_cents = 500),
  8,
  'Las ocho traen el tope de gasto por default (500¢)'
);

-- 4 · El org_id sembrado es el del cliente, no otro: el guard org↔cliente
--     habría tronado el insert si no coincidiera.
select is(
  (select count(*)::int from public.agent_policies
    where client_id = '88882222-0000-4000-8000-000000000001'
      and org_id = '88880000-0000-4000-8000-000000000001'),
  8,
  'Cada política siembra el org_id del cliente'
);

select * from finish();

rollback;
