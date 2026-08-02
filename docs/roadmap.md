# Plan de ejecución

## Cómo se construye

**Rebanadas verticales, no capas.** Cada etapa entrega una sección **completa y usable**: su migración, sus Server Actions validadas, su UI, sus pruebas. Nunca "todas las tablas primero" ni "toda la UI con mocks primero" — así es como se llega al 80% de todo y al 100% de nada.

Una etapa está terminada cuando:

- `pnpm verify` y `pnpm db:test` pasan
- la sección se puede usar de verdad contra la base local, con el seed
- tiene su prueba: lógica de negocio en Vitest, política nueva en pgTAP, flujo crítico en Playwright
- los estados vacío, de carga y de error existen y dicen qué hacer

Una etapa por rama y por PR. Si una etapa se está pasando de una semana, está mal cortada.

## Por qué el orden cambió respecto al plan original

El plan v4 ponía el Volumen del mes en la primera entrega. Con datos mock eso funciona; contra base real no, porque el plan de volumen **es** la salida del Estratega y el Estratega necesita rendimiento por formato y por pilar de los últimos 90 días. Sin Resultados, el Volumen es un formulario bonito con números inventados.

Así que Resultados se adelanta y Volumen baja. Todo lo demás conserva el orden del plan.

---

## Etapa 0 — Cimientos ✅

Hecho. Next.js 16 + TypeScript estricto + Tailwind v4, sistema de diseño con los tokens de Ana Gz Studio, Supabase local con cinco migraciones, RLS multi-tenant probado con 28 aserciones de pgTAP, contratos de agentes en Zod, y la red de seguridad completa: gitleaks, pre-commit, CI con typecheck, lint, formato, Vitest, build, migraciones y pruebas de RLS.

---

## Etapa 1 — La casa

El cascarón del dashboard de cliente y las dos secciones que se leen de un vistazo.

**Construye**

- Layout global: sidebar de 220px colapsable a 64px — `Bandeja` · `Clientes` · `Agentes` · `Ajustes`
- `/clientes`: tabla con hairline entre filas, progreso del mes, chip de estado, próxima publicación
- `/cliente/:slug`: header sticky (inicial, nombre en display, handle, tier, chips de redes con semáforo, selector de mes con flechas, **Modo cliente**, **Presentar mes**)
- Navegación lateral de secciones con scroll-spy y scroll suave a anclas
- **§ Resumen** — cuatro números grandes, barra de pipeline de 6 estados, máximo 3 alertas
- **§ Redes** — tarjeta por red con semáforo, seguidores, última publicación, consistencia, checklist de perfil, sin responder

**Base de datos**: migración `social_accounts` y `account_audits`.

**Cuidado con**: el selector de mes es estado de URL (`?mes=2026-09`), no de React. Se comparte por link y sobrevive al refresh.

**Prueba**: Playwright — abrir un cliente, cambiar de mes, navegar entre secciones por el scroll-spy.

---

## Etapa 2 — Planner

La sección más grande de la app y donde ocurre el trabajo diario. Merece la mayor parte del esfuerzo.

**Construye**

- **Grid** — 3 columnas (toggle a 5), tiles cuadrados sin gap, orden descendente por fecha, solo feed. Franja del color del pilar, ícono de formato, candado, punto de procedencia. Toggle **Content Map**. Barra de balance de pilares.
- **Riel de fechas** — el elemento firma. Columna a la derecha alineada fila por fila; una hairline conecta cada tile con su fecha. **Al arrastrar, esa línea se pinta en `--color-accent-hot` y se redibuja hacia la fecha nueva.** Que se sienta que cambió la fecha, no que se movió una imagen.
- **Drag & drop en dos modos**: intercambiar (default) e insertar y correr. Sobre una pieza con candado: el tile tiembla, nada se mueve, y el toast dice la fecha exacta a la que está amarrada.
- **Calendario**, **Tabla** con edición inline y export CSV, **Stories** por día
- **Drawer de detalle** de 520px con todos los campos de copy, contador de hashtags que se pone rojo al romper la regla, y chip de procedencia por campo

**Base de datos**: función `swap_piece_slots(a, b)` transaccional que intercambia `publish_at` y `slot_index` de dos piezas. Nada de recalcular la lista completa. Registro en `human_edits` cuando se edita un campo con procedencia de agente.

**Cuidado con**: la UI es optimista y el rollback tiene que ser **visible**. Si el intercambio falla, las piezas regresan a su lugar y el toast lo dice — no se quedan calladas en el estado equivocado.

**Prueba**: Vitest para la lógica de reordenamiento pura. Playwright para arrastrar, soltar, y para el caso del candado.

---

## Etapa 3 — Resultados

Sin esto el Estratega no tiene con qué decidir. Por eso va antes que Volumen.

**Construye**

- Ocho métricas en rejilla con variación vs mes anterior
- Gráfica de crecimiento de seguidores, línea hairline, 6 meses
- **Rendimiento por formato** y **por pilar** — las dos tablas que alimentan el volumen del mes siguiente; dales peso visual
- Top 5 y últimas 3 piezas
- **Importar CSV** (Meta Business Suite, TikTok) y captura manual

**Base de datos**: `results_monthly`, `results_piece`.

**Cuidado con**: el importador de CSV es entrada externa. Se valida con Zod, se reportan los renglones malos con su número de línea, y se importa en una transacción. Un CSV a medias es peor que ninguno.

**Prueba**: Vitest sobre el parser con CSV reales de ejemplo, incluyendo los casos feos — separador decimal, encabezados en español, columnas de más.

---

## Etapa 4 — Volumen y los dos agentes que lo alimentan

**Construye**

- **§ Volumen del mes** — el plan completo: FEED, STORIES, DISTRIBUCIÓN POR PILAR, cada renglón con su variación y **su razón**. Bloque "Por qué esta mezcla" con el dato duro que respalda cada decisión. `✳ Recalcular volumen` con sliders de capacidad y objetivos. **Copiar para presentación.**
- Bloque **Lo que dice el Analista** en Resumen y la **Lectura del mes** completa en Resultados: quitar / meter más / mejorar, más "para mitad de mes"
- Estratega y Analista contra el proveedor mock, escribiendo a `volume_plans`

**Base de datos**: `volume_plans`.

**Cuidado con**: el rationale no es decoración. Cada número lleva la métrica que lo justifica, porque eso es lo que se le presenta al cliente sin traducir. Un plan de volumen sin razones no sirve para nada.

---

## Etapa 5 — Marca y Editor de marca

**Construye**

- **§ Marca** — el Context Card presentado como documento, no como formulario. Versionado con historial.
- **Reglas duras** con severidad e indicador de si la verifica código o modelo
- Cablear `src/domain/brand-rules.ts` al drawer: el contador de hashtags en rojo, el bloqueo de `con_cliente` si hay violación crítica
- Bloque **Aprendizaje** alimentado por `human_edits`

**Cuidado con**: toda regla que se pueda mover a código, se mueve a código. Es gratis, es instantánea y no falla distinto el martes que el jueves.

---

## Etapa 6 — Redactor y procedencia

**Construye**

- Redactor contra el mock, llenando hook, copy in, copy out, CTA y hashtags respetando el formato de caption del cliente
- Chips `REDACTOR` / `GUIONISTA` por campo; al editar, cambia a `EDITADO POR TI` con la nota de que la corrección se agrega al aprendizaje
- Botones `✳ Reescribir` · `✳ Revisar voz` · `✳ Adaptar plataforma`
- Escritura real a `human_edits` con el diff

---

## Etapa 7 — Guiones y fechas

**Construye**

- **§ Guiones** — fichas con tendencia base, fit de marca sobre 100 con su razón, audio, duración, guion por escenas con tiempos, qué se requiere para grabarlo y una alternativa más simple
- **Radar de tendencias** — lo que Ana registró esta semana, con `✳ Calcular fit de marca`
- **§ Fechas y promociones** — timeline de 6 meses, `✳ Proponer campañas` para los meses vacíos

**Base de datos**: `scripts`, `trends`, `key_dates`.

**Cuidado con**: el agente **no descubre** la tendencia. Ana la ve, él la traduce a guion con fit de marca. Esa división es la que funciona; cualquier promesa de detección automática de audios en tendencia es scraping frágil o humo.

---

## Etapa 8 — Pauta

La más independiente de todas; se puede paralelizar con otra etapa.

**Construye**

- Campañas activas, detalle con ad sets lado a lado (mejor valor de cada métrica resaltado), creativos, gráfica de costo por resultado
- **Propuestas del Pautero** con razonamiento, impacto estimado, riesgo y alternativa
- Al aprobar: pasa a **Por aplicar** con **instrucciones exactas de qué hacer en el ads manager** y botón "Marcar como aplicada"
- Histórico y captura de métricas por CSV o a mano

**Base de datos**: `campaigns`, `ad_sets`, `ad_creatives`, `ad_metrics`, `ad_proposals`.

**Regla dura, no negociable**: aprobar una propuesta **nunca** modifica un presupuesto. Solo cambia `ad_proposals.status` y guarda las instrucciones. La interfaz tiene que dejar clarísimo que la app no ejecutó nada. Es dinero del cliente, y un agente con escritura a cuentas publicitarias es un riesgo desproporcionado al beneficio de ahorrarse un clic.

---

## Etapa 9 — Portal de cliente

El entregable que reemplaza la presentación mensual y el que más tiempo devuelve.

**Construye**

- `/aprobar/:token` → correo → magic link contra la lista blanca
- Tema claro **fijo**: el árbol del portal va envuelto en `<div data-tema="claro">` y no sigue la cookie del estudio. El selector del CSS está escrito sin `html` adelante justo para permitir esta anidación, y hay una prueba que lo protege — ver `docs/design.md`. El acento es **el color de marca del cliente**, no el de Ana.
- Portada, plan del mes, grid, cada pieza con copy completo y **Aprobar** / **Pedir cambio**, resultados del mes anterior, pauta en versión simple, próximas fechas
- Contador fijo "8 de 20 aprobadas". **Descargar PDF** con estilos de impresión reales.

**Cuidado con**: es la única superficie que toca gente fuera del estudio. Antes del PR: `pnpm db:test` y `/security-review`. Las pruebas de aislamiento del portal ya existen — extiéndelas con cada tabla nueva que se agregue.

**Tiene que verse mejor que un PowerPoint.**

---

## Etapa 10 — Bandeja y pantalla de Agentes

**Construye**

- **Bandeja** — cola de escalamientos de todos los clientes, con filtros, las opciones que propone el agente, y **atajos de teclado que funcionen de verdad** (`J/K`, `1-3`, `A`, `E`, `S`). Al resolver, la tarjeta colapsa en 200ms. Que se **sienta** que se vacía.
- **`/agentes`** — ocho tarjetas con trabajos de hoy, escalamientos, tasa de edición, costo del mes, sparkline y switch
- `/agentes/:key` — prompt de sistema, disparadores, y bitácora de corridas con input, output y qué campos cambió

---

## Etapa 11 — Agentes reales

Hasta aquí, `AGENTS_PROVIDER=mock` y cero llamadas de red. Esta etapa cambia el adaptador.

**Construye**

- Proveedor Anthropic detrás de la interfaz que ya existe
- Cola de trabajos y cron (día 3 del mes el Analista, semanal el Auditor)
- Enforcement del tope de gasto, alerta al 80%
- Routing de modelo por agente: lo barato para clasificar, lo caro para escribir

**Cuidado con**: enciende **un** agente, en **un** cliente, y mide costo, latencia y tasa de edición durante un mes real antes de encender el segundo. El Redactor es el mejor candidato: alto volumen, bajo riesgo, retroalimentación inmediata.

---

## Después

- Lectura por API de Instagram Graph y Meta Ads, cuando los trámites de verificación de negocio estén hechos por cliente. **Lectura sí, escritura nunca.**
- Multi-agencia real: registro, onboarding, facturación. El esquema ya lo aguanta.
