-- =============================================================================
-- Guardián de cobertura.
--
-- La forma más común de abrir un hoyo en un esquema con RLS no es escribir una
-- política mala: es agregar una tabla y olvidar encender RLS. Nadie lo nota
-- porque la app funciona igual — solo que ahora cualquier sesión autenticada
-- lee esa tabla completa.
--
-- Esta prueba no revisa políticas. Revisa que no exista ninguna tabla sin
-- protección, hoy y en cada tabla que se agregue de aquí en adelante.
-- =============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- 1 · Toda tabla de `public` tiene RLS encendido.
select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relrowsecurity $$,
  'Ninguna tabla de public se quedó sin RLS'
);

-- 2 · Y además FORCE, para que ni el dueño de la tabla la evada por accidente
--     desde una migración o un script.
select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and not c.relforcerowsecurity $$,
  'Ninguna tabla de public se quedó sin FORCE ROW LEVEL SECURITY'
);

-- 3 · Toda tabla con RLS tiene al menos una política. Una tabla con RLS y sin
--     políticas está cerrada — lo cual es seguro, pero casi siempre significa
--     que alguien la creó y se le olvidó terminar.
select is_empty(
  $$ select c.relname::text
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and not exists (
         select 1 from pg_policy p where p.polrelid = c.oid
       ) $$,
  'Ninguna tabla quedó con RLS encendido y cero políticas'
);

-- 4 · El rol `anon` no tiene permisos sobre nada de public. El portal de
--     cliente exige sesión; si algo aquí se vuelve público, tiene que ser una
--     decisión explícita que rompa esta prueba primero.
select is_empty(
  $$ select table_name::text
     from information_schema.role_table_grants
     where grantee = 'anon'
       and table_schema = 'public' $$,
  'El rol anon no tiene ningún permiso sobre las tablas de public'
);

select * from finish();

rollback;
