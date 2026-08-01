# Seguridad

Este documento dice qué protegemos, de qué, y qué control concreto lo hace. Si un control no tiene una prueba que lo respalde, está anotado como pendiente en lugar de darse por hecho.

## Qué hay que perder

| Activo                         | Por qué importa                                                         |
| ------------------------------ | ----------------------------------------------------------------------- |
| Calendario y copy sin publicar | es la estrategia del cliente antes de que salga; se filtra una vez y ya |
| Métricas de los clientes       | información comercial de terceros, no nuestra                           |
| Notas privadas                 | opiniones internas sobre clientes que pagan                             |
| Context Card y reglas de marca | el insumo que hace que los agentes suenen a la marca                    |
| Llaves de API                  | `service_role` da acceso total a todos los clientes de un jalón         |

El peor escenario concreto: **el cliente A abre un link y ve el mes del cliente B.** Todo el diseño de acceso está construido alrededor de que eso no pueda pasar.

## Modelo de amenaza

| Amenaza                                            | Qué la contiene                                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Consulta a la que se le olvidó filtrar por cliente | RLS en cada tabla; la consulta simplemente no devuelve de más                                 |
| Link del portal reenviado a quien no debe          | magic link contra lista blanca de correos; el link solo, sin el buzón, no sirve               |
| Usuario del portal husmeando en la API             | `GRANT` + RLS: no ve tablas internas y no puede escribir fuera de comentarios y aprobaciones  |
| Tabla nueva sin RLS                                | `rls_cobertura_test.sql` falla en CI                                                          |
| Secreto commiteado                                 | gitleaks en pre-commit y en CI                                                                |
| Prompt injection en contenido de cliente           | el agente no ejecuta nada; su salida se valida con Zod y la revisa una persona                |
| Agente en bucle quemando presupuesto               | tope mensual por agente y por cliente, revisado antes de cada llamada                         |
| Dependencia con postinstall malicioso              | scripts de instalación denegados por default; excepciones explícitas en `pnpm-workspace.yaml` |

## Autenticación

- Magic link por correo (Supabase Auth). Sin contraseñas que guardar, rotar o filtrar.
- **`getUser()` para decidir permisos, nunca `getSession()`.** `getSession()` lee la cookie y la cookie la manda el cliente; usarla para autorizar es confiar en un dato que el atacante controla. `getUser()` valida contra el servidor de auth.
- `src/proxy.ts` (el antiguo middleware) refresca la sesión y redirige a quien no la tenga. **No autoriza.**
- El `destino` del redirect se valida: solo rutas internas. Un `?destino=https://…` sin validar es un open redirect disfrazado de login, y es la peor variante porque la víctima ya confía — acaba de entrar de verdad.

### Portal de cliente

`/aprobar/:token` es la única superficie que toca gente fuera del estudio.

El flujo: el token identifica al cliente y el mes. La persona pone su correo. **Solo si ese correo está en `client_users` de ese cliente** se manda el magic link. Con eso, el link es compartible pero inútil sin acceso al buzón.

Lo que el portal no puede hacer, y está probado en `rls_aislamiento_test.sql`:

- Ver piezas que no llegaron a `con_cliente`
- Ver otro cliente, aunque sea del mismo estudio
- Ver notas privadas, reglas de marca, Context Card, agentes o corridas
- Ver la lista de contactos de su propio cliente
- Modificar una pieza
- Insertar un comentario haciéndose pasar por el estudio
- Comentar una pieza que todavía no le mostraron

## Autorización

**La autorización es RLS.** No hay un segundo sistema de permisos en TypeScript, a propósito: dos fuentes de verdad se desincronizan y la que gana es la equivocada.

Reglas del esquema:

- `ENABLE ROW LEVEL SECURITY` **y** `FORCE ROW LEVEL SECURITY` en cada tabla. `FORCE` importa: sin él, una conexión que corra como el dueño de la tabla (una migración, un script) evade las políticas sin darse cuenta.
- Sin políticas permisivas por default. Si no hay política, nadie ve nada.
- `anon` no tiene permiso sobre nada. Hay una prueba que lo verifica.
- Los `GRANT` se escriben tabla por tabla; los privilegios por default están revocados.
- Las funciones de acceso viven en el esquema `app`, no expuesto por PostgREST, con `search_path` fijado.

### La trampa del UPDATE

Cuando RLS filtra un `UPDATE`, Postgres **no lanza error**: afecta cero renglones y regresa en silencio. Un test que espere una excepción ahí pasa en verde el día que alguien abra la política por accidente. La aserción correcta es que el valor no cambió. Está documentado en el propio test para que nadie lo "arregle" mal.

## Secretos

- `.env*` en `.gitignore`, salvo `.env.example`.
- `.env.example` es el contrato: toda variable nueva se declara ahí, en `src/types/env.d.ts` y en `src/lib/env.ts`. Las tres.
- `src/lib/env.ts` valida con Zod al arrancar. Una variable faltante truena de inmediato, con el nombre de la variable, en vez de volverse `undefined` tres capas abajo.
- ESLint prohíbe `process.env` fuera de `env.ts`.
- gitleaks corre en pre-commit y en CI, con reglas propias para llaves de Supabase, Anthropic y Meta.
- **`SUPABASE_SERVICE_ROLE_KEY` salta todo el RLS.** Solo el runner de agentes y los scripts de aprovisionamiento la usan. Nunca en una ruta que responda a un usuario.

Si una llave se filtra: rotarla en el panel de Supabase **primero**, después limpiar el repo. Rotar es lo que corta el acceso; reescribir la historia no.

## Cabeceras y navegador

En `next.config.ts`:

- CSP estricta. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. `unsafe-eval` solo en desarrollo, donde Next lo necesita para fast refresh.
- HSTS con `preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` apaga cámara, micrófono, geolocalización y topics.
- `poweredByHeader: false`.
- La app tiene `robots: noindex`: es una herramienta interna con datos de terceros.

ESLint prohíbe `dangerouslySetInnerHTML` y exige `rel="noopener"` en `target="_blank"`.

## Los agentes como superficie de ataque

El contenido de un cliente puede llevar texto que intente dar instrucciones al modelo. Los controles:

1. **Ningún agente ejecuta nada.** No hay herramienta que mueva dinero, publique o mande un mensaje. El peor caso de una inyección exitosa es un borrador raro que una persona va a leer.
2. **La salida se valida contra un schema de Zod.** Una salida fuera de forma es un error, no algo que se intenta rescatar.
3. **Tope de gasto** por agente y por cliente, revisado antes de cada llamada.
4. **Todo queda registrado**: entrada, salida, costo, versión del Context Card.

## Datos y retención

- El seed es ficticio. Ningún dato real de cliente entra a git.
- Revocar acceso del portal pone fecha en `revoked_at`, no borra el renglón: queremos el rastro de quién tuvo acceso.
- Las contraseñas de las cuentas de los clientes viven en el gestor del estudio. La app guarda el link y nada más.

## Cadena de suministro

- Los scripts de `postinstall` están **denegados por default**. Cada excepción en `pnpm-workspace.yaml` es explícita y lleva comentario de por qué esa dependencia necesita ejecutar código al instalar.
- `pnpm install --frozen-lockfile` en CI.

## Pendientes conocidos

Cosas que faltan y que están aquí para que no se olviden:

- [ ] Rate limiting en el envío de magic links del portal (hoy solo el de Supabase).
- [ ] Bitácora de accesos al portal (`last_seen_at` existe; falta la vista y la alerta).
- [ ] Rotación programada de `service_role`.
- [ ] Alerta cuando el gasto de agentes cruza el 80% del tope mensual.
- [ ] **Tope de gasto global por organización.** Hoy solo existe el tope por agente y por cliente (`agent_policies.monthly_cap_cents`). `AGENTS_MONTHLY_BUDGET_USD` está declarada pero no conectada: falta una función en la base que sume el gasto de toda la org. Con muchos clientes, la suma de topes individuales puede rebasar lo que se quiere gastar en total.
- [ ] Pruebas de RLS para las tablas de pauta y resultados (todavía no existen esas tablas).
- [ ] Endurecer la política de `escalations`: hoy el estudio puede hacer UPDATE de cualquier columna, incluida `question`. Debería limitarse a `resolved_at`, `resolved_by` y `resolution` para que la pregunta original del agente no se pueda reescribir después del hecho.

## Antes de un PR sensible

Si el cambio toca auth, RLS, el portal de cliente o el runner de agentes:

```bash
pnpm db:test          # aislamiento y cobertura de RLS
pnpm verify
/security-review      # revisión de seguridad del diff
```
