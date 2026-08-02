-- =============================================================================
-- 0014 · Invitar gente al equipo del estudio.
--
-- org_members es 100% alta manual: no hay trigger sobre auth.users, ni
-- invitación por correo. Hoy eso significa que una cuenta nueva —o migrada—
-- se autentica bien y ve la app completamente vacía, porque RLS filtra en
-- silencio a quien no tiene fila en org_members. Esta migración agrega el
-- paso que faltaba: el owner invita por correo, y en cuanto esa persona
-- entra (o ya tenía sesión y recarga), su invitación pendiente se convierte
-- en membership sola.
-- =============================================================================

create table public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs (id) on delete cascade,
  email       extensions.citext not null,
  role        app.member_role not null default 'staff',
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  -- Aceptar es poner fecha, no borrar: mismo criterio que client_users.revoked_at.
  accepted_at timestamptz
);

-- Como mucho una invitación pendiente por correo y por org; una vez aceptada
-- el correo se puede volver a invitar sin chocar con la fila vieja.
create unique index org_invites_pending_idx on public.org_invites (org_id, email)
  where accepted_at is null;

create index org_invites_email_idx on public.org_invites (email) where accepted_at is null;

alter table public.org_invites enable row level security;
alter table public.org_invites force row level security;

-- Mismo criterio que org_members: solo el owner administra a quién invita.
create policy "org_invites: solo el owner administra"
  on public.org_invites for all to authenticated
  using (app.is_org_owner(org_id))
  with check (app.is_org_owner(org_id));

grant select, insert, update, delete on public.org_invites to authenticated;

-- =============================================================================
-- Aceptar invitaciones pendientes.
--
-- Corre SECURITY DEFINER porque tiene que escribir en org_members, y un
-- usuario recién invitado todavía no es miembro de nada — no hay política que
-- se lo permita directo. Se cruza contra el correo verificado del JWT, igual
-- que app.portal_client_ids(): Supabase solo emite sesión después de que la
-- persona abrió el link en ESE buzón.
-- =============================================================================
create or replace function app.accept_pending_invites()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email extensions.citext := ((select auth.jwt()) ->> 'email')::extensions.citext;
begin
  if v_uid is null or v_email is null then
    return;
  end if;

  insert into public.org_members (org_id, user_id, role)
  select i.org_id, v_uid, i.role
  from public.org_invites i
  where i.email = v_email
    and i.accepted_at is null
  on conflict (org_id, user_id) do nothing;

  update public.org_invites
  set accepted_at = now()
  where email = v_email
    and accepted_at is null;
end;
$$;

comment on function app.accept_pending_invites() is
  'Convierte en membership toda invitación pendiente que coincida con el correo del usuario logueado.';

-- =============================================================================
-- Envoltura pública: lo único que el Data API puede llamar.
-- =============================================================================
create or replace function public.accept_pending_invites()
returns void
language sql
security invoker
set search_path = ''
as $$
  select app.accept_pending_invites();
$$;

revoke all on function
  app.accept_pending_invites(),
  public.accept_pending_invites()
from public, anon;

grant execute on function app.accept_pending_invites() to authenticated, service_role;
grant execute on function public.accept_pending_invites() to authenticated, service_role;
