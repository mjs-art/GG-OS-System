# Studio OS

App interna de una agencia de social media en México. Ana maneja las cuentas de sus clientes y ocho agentes de AI le ayudan con estrategia, guiones, copy y pauta. **Ella revisa y aprueba todo.**

Stack: Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind v4 · Supabase (Postgres + Auth + RLS) · Zod 4 · pnpm.

Interfaz completa en **español de México**. Nombres de código en inglés.

---

## Las cinco reglas que no se rompen

Si una tarea parece pedir romper una de estas, para y pregunta. No hay atajo que valga.

1. **El agente propone, la persona ejecuta.** Ningún agente mueve dinero, pausa un anuncio, manda un mensaje a un cliente ni publica nada. Escribe borradores y propuestas. La aprobación humana es un renglón aparte, con nombre y hora.
2. **La autorización vive en la base, no en la app.** Cada tabla tiene RLS encendido y forzado. Un `select` al que se le olvidó filtrar por cliente no filtra datos: la base lo detiene. Nunca reemplaces una política de RLS por un `if` en TypeScript.
3. **El cliente nunca ve la maquinaria.** En `/aprobar` y en cualquier vista de cliente: cero agentes, cero chips de procedencia, cero costos, cero notas privadas, cero métricas internas. Y nunca una pieza que no haya llegado al estado `con_cliente`.
4. **Ninguna credencial vive en la base ni en el repo.** Las contraseñas de los clientes viven en su gestor; la app solo guarda el link. Los secretos van en `.env.local`, que está en `.gitignore` y lo vigila gitleaks en cada commit.
5. **Toda corrida de agente queda registrada** con su entrada, su salida, su costo y con qué versión del Context Card corrió. Un agente que no se puede auditar no se puede operar.

---

## Comandos

```bash
pnpm dev              # servidor de desarrollo
pnpm verify           # typecheck + lint + formato + tests — corre esto antes de decir "listo"

pnpm typecheck
pnpm lint             # pnpm lint:fix para arreglar
pnpm format
pnpm test             # vitest, lógica de negocio
pnpm test:e2e         # playwright, flujos críticos

pnpm db:start         # levanta Postgres local en Docker
pnpm db:reset         # aplica migraciones desde cero + seed
pnpm db:diff <nombre> # genera una migración a partir de cambios hechos en Studio
pnpm db:test          # pruebas de RLS con pgTAP
pnpm db:lint          # revisa el esquema
pnpm db:types         # regenera src/lib/supabase/database.types.ts
```

Después de **cualquier** cambio de esquema: `pnpm db:reset && pnpm db:types && pnpm db:test`.

---

## Mapa del repo

```
src/
  proxy.ts             refresca la sesión en cada navegación. NO autoriza.
                       (Next 16 renombró "middleware" a "proxy".)
  app/                 rutas (App Router). Server Components por default.
    entrar/            acceso por magic link
    auth/callback/     canje del código por sesión
    (estudio)/         todo lo que exige sesión de estudio
    aprobar/           portal de cliente — superficie pública, tratar con cuidado
    api/jobs/          jobs de agentes; el ÚNICO lugar con service_role permitido
  components/ui/       primitivas del sistema de diseño
  domain/              reglas de negocio puras, sin IO. Aquí va lo que se prueba.
  agents/              contratos Zod, registro y runner de los 8 agentes
  lib/
    env.ts             ÚNICO lugar que lee process.env
    time.ts            ÚNICO lugar que crea Date
    supabase/          clientes server / browser / admin
supabase/
  migrations/          versionadas, se aplican en orden, nunca se editan una vez aplicadas
  tests/database/      pruebas de RLS en pgTAP
  seed.sql             datos FICTICIOS de desarrollo
docs/                  arquitectura, seguridad, agentes, plan de ejecución
```

---

## Seguridad

Detalle completo en `docs/security.md`. Lo que hay que tener en la cabeza siempre:

- **`getUser()`, nunca `getSession()`** para decidir permisos. `getSession()` lee la cookie, y la cookie la manda el cliente.
- **`@/lib/supabase/admin` salta todo el RLS.** Permitido solo en `src/app/api/jobs/`, en el runner de agentes y en scripts de aprovisionamiento. ESLint bloquea su import desde el resto de `src/app/`. Regla práctica: si el `client_id` con el que vas a filtrar viene de la petición, no uses ese cliente.
- **Tabla nueva = RLS + política + prueba.** Hay un test (`rls_cobertura_test.sql`) que falla si agregas una tabla sin RLS, sin FORCE o sin políticas. No lo desactives; termina la tabla.
- **Todo input externo se valida con Zod** en el límite: Server Actions, Route Handlers, parseo de CSV y salidas de agentes. Un tipo de TypeScript no valida nada en runtime.
- **Cuidado con el UPDATE filtrado por RLS:** Postgres no lanza error, afecta cero renglones y regresa en silencio. Si necesitas saber si el cambio ocurrió, revisa el conteo de renglones afectados.
- **Nada de `dangerouslySetInnerHTML`.** ESLint lo prohíbe. El copy que escriben los agentes es texto, no HTML.
- Antes de un PR con cambios de auth, RLS o el portal de cliente: `/security-review`.

---

## Convenciones de código

**TypeScript**

- `strict` completo más `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`. Un acceso por índice devuelve `T | undefined` y hay que manejarlo. No lo silencies con `!` — ESLint prohíbe el non-null assertion.
- Nada de `any`. Si no sabes el tipo, es `unknown` y lo estrechas.
- `import type { ... }` en línea para tipos.

**Prohibiciones que ESLint hace cumplir, y por qué**

| Prohibido           | Usa                              | Por qué                                                                                 |
| ------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `process.env.X`     | `@/lib/env`                      | una variable faltante debe tronar al arrancar, no volverse `undefined` tres capas abajo |
| `new Date()`        | `@/lib/time`                     | el render deja de ser determinista y la zona horaria del servidor no es la de Tijuana   |
| `console.log`       | `console.warn` / `console.error` | los logs de depuración se quedan y ensucian producción                                  |
| imports `../../../` | alias `@/`                       | mover un archivo no debe romper diez imports                                            |

**Estilo**

- Sin punto y coma, comillas simples, 100 columnas. Lo arregla Prettier; no lo pelees a mano.
- Componentes: Server Components por default. `'use client'` solo cuando de verdad hace falta interacción, y lo más abajo posible en el árbol.
- Mutaciones: Server Actions con validación Zod. Nada de escribir a la base desde el navegador.

**Comentarios**

Explican **por qué**, no qué. Un comentario que repite el código es ruido que envejece mal. Comenta la decisión no obvia, la trampa, el caso que ya mordió. Mira `src/lib/time.ts` o `src/domain/brand-rules.ts` para el tono.

---

## Sistema de diseño

> ⚠️ **La paleta actual es PROVISIONAL.** Los colores oficiales de Ana Gz Studio todavía no se entregan. Lo que hay hoy es la propuesta del plan v4 (editorial oscuro, rojo quemado). Cuando lleguen los definitivos, se cambian **solo** los valores del bloque `@theme` en `globals.css` y nada más.
>
> Por eso los colores no se escriben en componentes, nunca. `src/components/ui/tokens.test.ts` hace fallar la suite si un hex, un `bg-gray-*` o una sombra se escapan a un componente. Esa prueba es lo que mantiene barato el cambio de marca — no la desactives.

Editorial oscuro, densidad de sala de control. **No** dashboard corporativo, **no** SaaS genérico.

Los tokens viven en `src/app/globals.css` y las primitivas en `src/components/ui/primitives.tsx`.

- **Cero sombras.** La jerarquía se construye con espacio y peso tipográfico.
- Todos los bordes son hairline de 1px en `--color-line`. `border-radius: 2px` en todo.
- Sin gradientes, sin glassmorphism, sin glow.
- Tres tipografías con trabajos distintos: **Archivo** expandido en mayúsculas para display (nombres de cliente, títulos, números grandes) · **Inter Tight** para UI · **IBM Plex Mono** 11px para datos, fechas, labels y chips.
- Foco visible en `--color-burnt-hot` en todo lo interactivo. Respeta `prefers-reduced-motion`.
- Responsive hasta 375px.

**Si vas a escribir un hex, un `border-gray-*` o una sombra en un componente de feature: para.** Falta una primitiva. Agrégala en `primitives.tsx`.

Los colores que sí son literales en runtime — el de cada pilar y el de marca del cliente — vienen de la base como **dato**, no como diseño, y entran por `style`. Eso está bien y la prueba no los toca porque mira el código fuente.

### Lovable

Hay un proyecto en Lovable (`Studio AI`, workspace Metafinanciera) con las 12 secciones del dashboard maquetadas. **No es la fuente de verdad y no se sincroniza.** Está en TanStack Start, no en Next, y su paleta ya derivó sola a un tema claro con azul.

Úsalo como cuaderno de exploración visual: cuando no sepas cómo debe verse una sección, míralo ahí y luego impleméntalo aquí con nuestras primitivas. Lo que vale la pena minar de ahí está anotado en `docs/design-sources.md`.

**Estados vacíos** dicen qué hacer. "Sin datos" no es un estado vacío, es una disculpa. **Errores** explican qué pasó y cómo arreglarlo, sin disculparse.

---

## Lenguaje de la interfaz

Español de México. Sentence case. Verbos directos. Cero jerga técnica. Cero emojis decorativos.

- "Bandeja limpia", no "No hay elementos".
- "Todavía no hay datos de septiembre. Importa el CSV de Meta Business Suite o captura los números a mano.", no "Sin resultados".
- "Esta pieza está amarrada al 15 de septiembre. Quita el candado para moverla.", no "Operación no permitida".

---

## Reglas de negocio que la base hace cumplir

No las dupliques en TypeScript; confía en ellas y escribe el mensaje de error humano.

- Una pieza `publicado` sin `publish_at` es imposible.
- Un `org_id` que no corresponde al `client_id` es imposible, incluso con superusuario.
- Pedir un cambio sin nota es imposible.
- Las aprobaciones y las corridas de agente son append-only: nadie las edita ni las borra.
- El portal de cliente no puede insertar un comentario haciéndose pasar por el estudio.
- Las notas privadas solo las ve quien las escribió, incluso dentro del estudio.

---

## Los ocho agentes

`estratega` · `analista` · `guionista` · `redactor` · `editor_marca` · `pautero` · `auditor` · `cuenta`

Detalle en `docs/agents.md`. Lo esencial:

- **Escalar es comportamiento correcto, no falla.** Un agente que no sabe pregunta, y su pregunta llega a la Bandeja con las opciones que él propone.
- **Toda regla que se pueda verificar por código, se verifica por código** (`src/domain/brand-rules.ts`). Un modelo se puede convencer; un conteo de hashtags no.
- Cada agente tiene tope de gasto mensual por cliente. Al llegar, el runner se niega a correr. Un bug de reintentos no debe poder costar mil dólares mientras nadie ve.
- Cuando una persona edita un campo que escribió un agente, el cambio se guarda en `human_edits`. Esa tabla es el activo real del sistema: es el criterio de la marca, aprendido.
- Fase actual: `AGENTS_PROVIDER=mock`. **No hay ni una llamada de red a un LLM todavía.** Los contratos ya están definidos para que enchufar Claude sea cambiar el adaptador.

---

## Datos de clientes

- El seed es **ficticio** y así se queda. Nada de nombres, métricas ni copy de clientes reales en git.
- Las métricas entran por **CSV o captura manual**. No hay conexión automática a Instagram Graph ni a Meta Ads, y en la etapa actual no la va a haber: son semanas de trámite por cliente y el agente no distingue de dónde vino el número.
- Cuando llegue la lectura por API: **lectura sí, escritura nunca.**

---

## Cómo trabajar aquí

1. Antes de construir una sección, lee cómo la describe `docs/roadmap.md`. El orden importa: cada etapa depende de datos que produce la anterior.
2. Cambio de esquema → migración nueva. **Nunca edites una migración ya aplicada.**
3. Lógica de negocio nueva → prueba en Vitest. Política de RLS nueva → prueba en pgTAP. Flujo crítico nuevo → prueba en Playwright.
4. `pnpm verify` antes de dar por terminado algo. Si algo falla, dilo con la salida; no lo describas como listo.
5. Si el trabajo toca varias secciones grandes a la vez, propón partirlo. Esta app se construye por secciones completas, no por capas a medias.
