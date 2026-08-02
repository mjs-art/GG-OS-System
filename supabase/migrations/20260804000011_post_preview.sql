-- =============================================================================
-- 0011 · "Ver como post": imagen real por pieza + identidad pública de la cuenta.
--
-- Para renderizar una pieza como una publicación de Instagram —en el drawer del
-- estudio y en el portal del cliente— hacían falta dos cosas que no existían:
-- la foto de la pieza y la identidad de la cuenta (avatar, bio) que va en el
-- header del post.
--
-- La imagen vive en un bucket PRIVADO. Un bucket público filtraría borradores:
-- el path es `{client_id}/{piece_id}` y esos UUIDs viajan al navegador del
-- cliente, así que adivinar el piece_id de una pieza que todavía no llega a
-- `con_cliente` bastaría para descargar su foto. Con bucket privado la única
-- forma de leer un objeto es una URL firmada por el servidor, y el servidor
-- solo la firma tras aprobar la RLS de storage.objects (que exige que la pieza
-- ya sea client-visible). Misma regla que en `pieces`, ahora también en Storage.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Columnas nuevas
-- -----------------------------------------------------------------------------

-- Path del objeto en el bucket 'images', NO una URL: con bucket privado una URL
-- llevaría horneado el expiry de la firma. El check ata el path al client_id de
-- la propia fila, de modo que la política de storage puede confiar en que el
-- primer folder del path ES el cliente dueño.
alter table public.pieces
  add column image_path text
    check (image_path is null or image_path like (client_id::text || '/%'));

-- Identidad PÚBLICA de la cuenta: lo que el portal pinta en el header del post.
-- Va en `clients` (no en `social_accounts`) a propósito: el portal ya lee
-- `clients`, y `social_accounts` es studio-only porque carga maquinaria
-- (followers_delta, DMs sin responder, checklist). avatar/bio/handle no son
-- maquinaria — son la cara pública de la marca — así que aquí respetan la regla
-- de "el cliente nunca ve la maquinaria".
alter table public.clients
  add column avatar_url text check (avatar_url is null or avatar_url ~ '^https?://'),
  add column bio        text check (bio is null or length(bio) <= 300);

-- -----------------------------------------------------------------------------
-- Bucket privado + políticas de storage.objects
--
-- storage.objects ya viene con RLS encendida en Supabase; aquí solo se agregan
-- las políticas. OJO: `rls_cobertura_test.sql` solo audita el esquema `public`,
-- así que estas políticas NO las cubre el guardián de cobertura — se verifican a
-- mano en `rls_aislamiento_test.sql`.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

-- Estudio: control total sobre los objetos de SUS clientes. El client_id se lee
-- del primer folder del path y se valida contra la membresía.
create policy "images: el estudio lee y escribe"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'images'
    and app.is_staff_of_client((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'images'
    and app.is_staff_of_client((storage.foldername(name))[1]::uuid)
  );

-- Portal: SOLO lectura, SOLO de su cliente, Y solo si existe una pieza con ese
-- path que ya es client-visible. El doble candado (portal_user + is_client_visible
-- vía el exists sobre pieces, que a su vez corre bajo la RLS del portal) es lo
-- que impide que un borrador se firme. anon queda denegado: ambas políticas son
-- `to authenticated` y no hay ninguna para anon.
create policy "images: el portal lee imagen de pieza visible"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'images'
    and app.is_portal_user_of_client((storage.foldername(name))[1]::uuid)
    and exists (
      select 1
      from public.pieces p
      where p.image_path = storage.objects.name
        and app.is_client_visible(p.status)
    )
  );
