-- =============================================================================
-- 0001 · Cimientos: extensiones, esquema privado, tipos y utilidades.
--
-- Postura de seguridad de todo el esquema:
--   · RLS ENCENDIDO en cada tabla, sin excepción, incluidas las de catálogo.
--   · Sin políticas permisivas por default: si no hay política, nadie ve nada.
--   · Toda función de ayuda vive en el esquema `app`, que NO se expone por
--     PostgREST, es SECURITY DEFINER y trae search_path fijado.
--   · `anon` y `authenticated` no reciben permisos por default: se otorgan
--     tabla por tabla y columna por columna donde hace falta.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- -----------------------------------------------------------------------------
-- Esquema privado. Nada aquí se expone por la API.
-- -----------------------------------------------------------------------------
create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- Cortar el default de Postgres de que cualquiera puede crear en `public`.
revoke create on schema public from public;

-- No conceder nada automáticamente sobre objetos futuros: cada grant se escribe
-- a mano donde se necesita.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tipos del dominio. Un enum es una regla de negocio que la base hace cumplir;
-- un `text` con valores válidos "por convención" es un bug esperando su turno.
-- -----------------------------------------------------------------------------

create type app.member_role as enum ('owner', 'staff');

create type app.platform as enum ('instagram', 'facebook', 'tiktok', 'linkedin');

create type app.piece_format as enum ('post', 'carrusel', 'reel');

create type app.piece_status as enum (
  'idea',
  'escrito',
  'revisado',
  'con_cliente',
  'aprobado',
  'publicado'
);

create type app.story_kind as enum ('diaria', 'campana', 'interactiva');

create type app.asset_status as enum ('pendiente', 'recibido');

create type app.rule_severity as enum ('critica', 'alta', 'media', 'baja');

-- Quién verifica la regla. `codigo` = determinista, se corre sin modelo y no
-- se puede "convencer". `modelo` = juicio, siempre revisable por humano.
create type app.rule_check as enum ('codigo', 'modelo');

create type app.agent_key as enum (
  'estratega',
  'analista',
  'guionista',
  'redactor',
  'editor_marca',
  'pautero',
  'auditor',
  'cuenta'
);

create type app.run_status as enum ('pendiente', 'corriendo', 'ok', 'error', 'cancelada');

create type app.approval_decision as enum ('aprobado', 'cambios');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

-- `updated_at` mantenido por la base. Confiar en que la aplicación lo mande
-- siempre es confiar en que nadie va a escribir un UPDATE a mano nunca.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Un mes de planeación es 'AAAA-MM'. Se guarda como text con CHECK en lugar de
-- date para que el mes sea el identificador natural y no haya "día 1" fantasma.
create domain app.month_key as text
  check (value ~ '^\d{4}-(0[1-9]|1[0-2])$');

comment on domain app.month_key is
  'Mes de planeación en formato AAAA-MM, por ejemplo 2026-09.';
