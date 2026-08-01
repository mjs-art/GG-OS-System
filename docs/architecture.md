# Arquitectura

## La idea en una línea

Postgres es la fuente de verdad **y** la capa de autorización. Next.js es una vista sobre ella. Los agentes son productores de borradores que escriben en las mismas tablas, con las mismas reglas, y con una bitácora aparte.

## Por qué así

La tentación en una app como esta es poner la autorización en la aplicación: un `where client_id = ?` en cada consulta y listo. Falla por una razón aburrida y garantizada: alguien va a escribir la consulta número 200 y se le va a olvidar el `where`. Nadie lo nota, porque la app se ve igual, hasta que un cliente ve el calendario de otro.

Con RLS, esa consulta simplemente no devuelve nada de más. El costo es escribir políticas y probarlas; el beneficio es que el error más caro del sistema se vuelve imposible en lugar de improbable.

## Capas

```
Navegador
   │  Server Components (lectura) · Server Actions (escritura)
   ▼
Next.js  ──── src/proxy.ts: refresca sesión, no autoriza
   │
   │  cliente de Supabase con el JWT del usuario
   ▼
PostgREST
   │
   ▼
Postgres  ──── RLS decide QUÉ renglones. GRANT decide QUÉ tablas.
   ▲
   │  service_role (salta RLS)
   │
Runner de agentes  ──── solo desde src/app/api/jobs/
```

### El proxy no autoriza

`src/proxy.ts` es lo que antes se llamaba middleware; Next 16 renombró la convención. Hace dos cosas: refresca el token (los Server Components no pueden escribir cookies, así que si no lo hace él no lo hace nadie) y manda al login a quien no tenga sesión.

**Quién ve qué lo decide la base.** Poner reglas de acceso aquí es tentador y es un error: el matcher es un negativo, y el día que alguien agregue una ruta y no la contemple, esa ruta queda abierta sin que nada falle.

### Los tres clientes de Supabase

| Cliente                | Corre como                    | Dónde                                      | Para qué                                      |
| ---------------------- | ----------------------------- | ------------------------------------------ | --------------------------------------------- |
| `lib/supabase/server`  | el usuario                    | Server Components, Actions, Route Handlers | todo el trabajo normal                        |
| `lib/supabase/browser` | el usuario                    | componentes cliente                        | solo auth y realtime                          |
| `lib/supabase/admin`   | `service_role`, **salta RLS** | `api/jobs/`, runner, scripts               | escribir la bitácora de agentes, aprovisionar |

ESLint prohíbe importar `admin` desde `src/app/` fuera de `api/jobs/`. No es una sugerencia de estilo: es el control que evita que un bug de parámetros se convierta en una fuga total.

## Modelo de datos

### Tenencia

```
orgs ──< org_members ──> auth.users        (el estudio)
  │
  └──< clients ──< client_users            (la gente del cliente)
         │
         └──< pillars, pieces, stories, brand_rules, agent_runs, …
```

Cada tabla de contenido lleva **`org_id` y `client_id`**. El `org_id` está desnormalizado a propósito, para que las políticas no tengan que hacer join en cada consulta. Eso solo es seguro si es imposible que se desincronice — de eso se encarga el trigger `app.enforce_client_org()`, que corre incluso para superusuario.

Hoy hay una sola org. El diseño es multi-tenant desde el inicio porque meter `org_id` después obliga a reescribir cada política del sistema.

### Los dos sujetos

El sistema tiene dos tipos de usuario con superficies que no se parecen:

**Miembro del estudio** (`org_members`) — ve todos los clientes de su org, escribe todo. El rol `owner` además administra al equipo y configura los agentes.

**Usuario del portal** (`client_users`) — ve **un** cliente, en lectura, y solo las piezas en estado `con_cliente`, `aprobado` o `publicado`. Puede comentar y aprobar. No ve: notas privadas, reglas de marca, Context Card, agentes, corridas, costos, ni los contactos de su propio cliente.

Se identifica por **correo**, no por `user_id`. Así el acceso funciona desde el primer magic link sin un paso previo de vinculación, y Supabase solo emite sesión después de que la persona abrió el link en ese buzón — o sea, el correo del JWT está verificado.

### Funciones de acceso

Viven en el esquema `app`, que no se expone por PostgREST. Son `SECURITY DEFINER` con `search_path` fijado, porque necesitan leer las tablas de membresía saltándose RLS — si no, las políticas se llamarían a sí mismas.

- `app.is_org_member(org)` / `app.is_org_owner(org)`
- `app.is_staff_of_client(client)` — ¿soy del estudio dueño de este cliente?
- `app.is_portal_user_of_client(client)` — ¿soy contacto de este cliente?
- `app.is_client_visible(status)` — ¿esta pieza ya salió a revisión?

### Piezas y stories son entidades distintas

Las stories se planean y se cuentan aparte del feed. Mezclarlas en una sola tabla fue el error de la versión anterior: el grid de Instagram solo muestra feed, el conteo mensual las separa, y el drag & drop no aplica igual.

### Lo que es append-only

`approvals`, `agent_runs`, `context_card_versions` y `human_edits` no se editan ni se borran. "Ya lo habías aprobado" tiene que ser demostrable, y "¿con qué contexto corrió ese agente?" tiene que tener respuesta.

## Movimiento de piezas en el planner

El drag & drop del grid intercambia `publish_at` y `slot_index` entre **dos** piezas dentro de una transacción. No recalcula la lista completa: con 68 piezas al mes y varios clientes, un recálculo total es una carrera esperando a pasar.

Si la pieza destino tiene `date_locked`, no se mueve nada y la interfaz lo dice con la fecha exacta.

## Agentes

`docs/agents.md` tiene el detalle. Estructuralmente:

- Los contratos de entrada y salida son schemas de Zod. Se valida la entrada **antes** de llamar al proveedor y la salida **después**. Una salida que no cumple el schema es un error, no algo que se intenta arreglar.
- El proveedor está detrás de una interfaz. Hoy es `mock` y no hace red. Mañana es Anthropic y no cambia nada más.
- Antes de cada llamada se consulta `app.agent_spend_cents_this_month()` contra el tope del cliente. Si se pasó, no llama.
- Toda corrida se registra, salga bien o mal.

## Qué NO está en el sistema

- **Producción de assets.** Fotografía, video, diseño y edición se resuelven fuera. El sistema solo sabe si una pieza necesita asset y si ya llegó.
- **Escritura a APIs de anuncios.** Nunca. Ver `docs/security.md`.
- **Contraseñas de clientes.** Solo el link al gestor.
- **Detección automática de tendencias.** No existe una API limpia de audios en tendencia. Ana registra lo que ve; el Guionista lo traduce a guion con fit de marca.
