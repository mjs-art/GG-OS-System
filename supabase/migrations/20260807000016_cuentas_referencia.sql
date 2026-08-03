-- Cuentas de referencia: la competencia y las cuentas de inspiración.
--
-- Lo que el estudio rastrea de cuentas que NO son del cliente. Sirve para dos
-- cosas que el dato propio no da:
--   · Comparación — las cuentas del cliente contra su competencia directa.
--   · Inspiración — qué está publicando la gente que va bien en el nicho.
--
-- Ninguna otra fuente da esto: a la competencia no le puedes pedir su token del
-- Graph API, y Meta no te exporta sus números. Pero sus posts públicos sí se
-- scrapean, y para eso es Apify. Por eso el `source` default es 'apify': aquí
-- casi nunca hay captura a mano.
--
-- Está amarrada a un cliente (no es un pool global) porque "comparación" siempre
-- es contra alguien: la competencia del bar no es la competencia del despacho.
-- Eso además hace que su RLS sea idéntico al de social_accounts — por cliente,
-- vía app.is_staff_of_client — y es maquinaria del estudio: el portal de cliente
-- NO tiene política aquí, a propósito. A quién medimos contra el cliente no es
-- algo que el cliente vea.

create type app.reference_kind as enum ('competencia', 'inspiracion');

create table public.reference_accounts (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete cascade,
  platform       app.platform not null,

  -- Sin handle no hay a quién scrapear: es obligatorio, a diferencia del de
  -- las cuentas propias, que se puede capturar a mano antes de conectar nada.
  handle         text not null,
  url            text check (url is null or url ~ '^https?://'),

  -- Nombre legible para la interfaz: "Competidor directo", "Cuenta que nos gusta".
  label          text,
  kind           app.reference_kind not null default 'competencia',

  followers      integer not null default 0 check (followers >= 0),
  last_post_at   timestamptz,
  posts_per_week numeric(5, 2) not null default 0 check (posts_per_week >= 0),

  -- Snapshot de los posts más recientes para el panel de inspiración. Se
  -- reemplaza completo en cada scrape; no es un histórico. Array de objetos
  -- {caption, likes, comments, url, at}. jsonb porque la forma la fija el Actor,
  -- no nosotros, y validarla en runtime es trabajo del lector con Zod.
  top_posts      jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(top_posts) = 'array'),

  -- Casi siempre 'apify' (scrape público). El día que alguien capture una
  -- cuenta a mano, el enum ya lo admite.
  source         app.metric_source not null default 'apify',
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- La misma cuenta se puede rastrear en varias redes, pero no dos veces en la
  -- misma para el mismo cliente.
  unique (client_id, platform, handle)
);

alter table public.reference_accounts enable row level security;
alter table public.reference_accounts force row level security;

-- Estudio-only, igual que social_accounts. Sin política para el portal: el
-- cliente no ve contra quién lo comparamos.
create policy "reference_accounts: solo el estudio"
  on public.reference_accounts for all to authenticated
  using (app.is_staff_of_client(client_id))
  with check (app.is_staff_of_client(client_id));

grant select, insert, update, delete on public.reference_accounts to authenticated;

create trigger reference_accounts_touch before update on public.reference_accounts
  for each row execute function app.touch_updated_at();

-- Un org_id que no corresponde al client_id es imposible, incluso con bug.
create trigger reference_accounts_org_guard before insert or update on public.reference_accounts
  for each row execute function app.enforce_client_org();
