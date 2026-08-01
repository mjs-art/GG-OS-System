# Studio OS

App interna de una agencia de social media. Dashboard por cliente, planeación de contenido, pauta y resultados, con ocho agentes de AI que preparan la base para que una persona revise y apruebe.

## Arrancar

Necesitas Node 24 (`.nvmrc`), pnpm y Docker corriendo.

```bash
pnpm install
cp .env.example .env.local

pnpm db:start                  # levanta Postgres local
pnpm db:reset                  # migraciones + seed ficticio
pnpm exec supabase status      # copia ANON_KEY y SERVICE_ROLE_KEY a .env.local

pnpm dev
```

También conviene instalar gitleaks para que el pre-commit escanee secretos:

```bash
brew install gitleaks
```

## Comandos

```bash
pnpm verify      # typecheck + lint + formato + tests. Corre esto antes de dar algo por terminado.
pnpm db:test     # pruebas de RLS en pgTAP
pnpm test:e2e    # Playwright
```

La lista completa está en `CLAUDE.md`.

## Dónde leer qué

| Documento                | Para qué                                                            |
| ------------------------ | ------------------------------------------------------------------- |
| `CLAUDE.md`              | reglas de trabajo, convenciones y las cinco reglas que no se rompen |
| `docs/architecture.md`   | cómo está armado y por qué                                          |
| `docs/security.md`       | modelo de amenaza, controles y pendientes conocidos                 |
| `docs/roadmap.md`        | el plan de ejecución por etapas                                     |
| `docs/agents.md`         | los ocho agentes y sus contratos                                    |
| `docs/design-sources.md` | de dónde sale el diseño y qué minar del proyecto de Lovable         |

## Estado

Etapa 0 terminada: cimientos, sistema de diseño, esquema multi-tenant con RLS probado, contratos de agentes y red de seguridad en CI. La etapa 1 está descrita en `docs/roadmap.md`.

Los agentes corren contra un proveedor **mock**. No hay ni una llamada de red a un LLM todavía.
