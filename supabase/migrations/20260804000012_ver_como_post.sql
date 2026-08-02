-- =============================================================================
-- 0012 · "Ver como post": la identidad pública de la cuenta.
--
-- La imagen de la pieza ya vive en el bucket `piezas` (migración 0011). Lo que
-- faltaba para pintar una pieza como una publicación de Instagram —en el drawer
-- del estudio y en el portal del cliente— es la identidad de la cuenta que va
-- en el header del post: la foto de perfil y la bio.
--
-- Van en `clients` y NO en `social_accounts`. El portal ya lee `clients` (su
-- política `clients: el portal ve solo su cliente`), mientras que
-- `social_accounts` es studio-only y carga maquinaria —seguidores, DMs sin
-- responder, checklist de perfil— que el cliente nunca debe ver. avatar y bio
-- son la cara pública de la marca, no maquinaria, así que su hogar es `clients`
-- y ahí respetan la regla de "el cliente nunca ve la maquinaria".
-- =============================================================================

alter table public.clients
  add column avatar_url text check (avatar_url is null or avatar_url ~ '^https?://'),
  add column bio        text check (bio is null or length(bio) <= 300);
