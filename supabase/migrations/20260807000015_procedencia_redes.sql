-- Procedencia del dato de redes.
--
-- Con la verificación de negocio de Meta a semanas de trámite por cliente, el
-- scrape vía Apify es la fuente PRINCIPAL para estas cuentas, no un respaldo.
-- Y un seguidor scrapeado no es el mismo dato que uno del Graph API oficial:
-- Apify ve lo público (seguidores, cadencia, último post) y NUNCA los insights
-- privados (reach, impresiones, saves). Si el Analista no distingue de dónde
-- salió el número, mezcla dos cosas distintas sin saberlo — justo la trampa que
-- ya advierte el CLAUDE.md ("el agente no distingue de dónde vino el número").
--
-- Por eso 'apify' es un valor aparte de 'api', no un sinónimo: uno es scrape
-- público, el otro es la métrica oficial de la plataforma. El día que el trámite
-- con Meta cierre y entren los dos, hay que poder saber cuál estás viendo.

alter type app.metric_source add value if not exists 'apify';

-- social_accounts guarda el estado de la cuenta (seguidores, cadencia, último
-- post) que llena `sync-redes`. Hasta hoy no registraba de dónde salió ese
-- estado. Default 'manual' porque el arranque sigue siendo captura a mano; el
-- job lo sube a 'apify' o 'api' cuando corre. No se referencia el valor nuevo
-- aquí a propósito: usar un enum recién agregado en la misma transacción falla.
alter table public.social_accounts
  add column source app.metric_source not null default 'manual';

comment on column public.social_accounts.source is
  'De dónde salió el último refresco de esta cuenta: manual/csv (captura), api '
  '(Graph oficial) o apify (scrape público, sin reach ni impresiones). El '
  'Analista lo necesita para saber qué tan completo es cada número.';
