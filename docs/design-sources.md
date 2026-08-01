# De dónde sale el diseño

## La regla

El diseño vive **en este repo**: los tokens en `src/app/globals.css`, las primitivas en `src/components/ui/primitives.tsx`. Ahí se versiona, se revisa en PR y se prueba.

Nada se sincroniza desde afuera. Las herramientas de diseño se usan para **explorar**, y lo que se decide se implementa aquí a mano.

## La paleta ya llegó

Ana entregó los cuatro colores oficiales el 1 de agosto de 2026 (`#630000` · `#810100` · `#1B1717` · `#EDEBDD`) y con ellos se armaron los dos temas. La especificación completa —qué es oficial, qué está derivado, y por qué el rojo de marca no sirve como anillo de foco en oscuro— está en [`design.md`](./design.md).

Aplicarla costó editar `globals.css` y renombrar los tokens a nombres de rol. Nada de eso tocó un componente de feature, que era justamente la apuesta. Lo garantiza `src/components/ui/tokens.test.ts`, que falla si un color literal, una utilidad de la paleta default de Tailwind o una sombra se escapan a un componente.

Esa prueba **se verificó que falla de verdad**: se le metió un `bg-gray-800 shadow-lg` a propósito y los reportó con nombre de archivo. Los guardianes nuevos de sincronía entre temas se verificaron igual, rompiendo el CSS a mano. Un guardián que nunca falla no es un guardián.

Lo que sí puede ser color literal en runtime: el de cada pilar y el de marca del cliente. Vienen de la base como dato, entran por `style`, y no son decisiones de diseño.

Lo que **no** llegó todavía: la licencia web de Meno Banner. La dirección tipográfica que Ana mandó junto con los colores está pendiente por eso; el detalle está en `design.md`.

### El preview de las variantes

`.context/preview-paleta.html` (fuera de git) tiene la Bandeja maquetada con datos ficticios en tres variantes —oscuro, crema, y crema con Meno Banner— y un switch vivo. Sirve para discutir dirección visual sin tocar la app. No es fuente de verdad de nada.

## El proyecto de Lovable

`Studio AI` · workspace Metafinanciera · [editor](https://lovable.dev/projects/f36f5f0b-f0b4-4a3d-b82b-6b8095fb6957) · [preview](https://id-preview--f36f5f0b-f0b4-4a3d-b82b-6b8095fb6957.lovable.app)

(Hay un segundo proyecto, `Studio Creativo`, anterior y menos completo. Ignóralo.)

### Por qué no es la fuente de verdad

Tres razones, en orden de peso:

**1. Ya derivó solo y nadie lo notó.** Su `styles.css` conservó los nombres del plan (`--ink`, `--burnt-hot`) pero invirtió los valores: fondo blanco, acento azul `#3b5bff`, radius de 4–14px, sombras en los botones, chips en píldora. El comentario en el archivo lo dice: _"Notion-like con acentos vivos"_. Eso no se descubrió hasta que se hizo el diff a mano. Un diseño que vive en un generador sin diff puede reescribirte la marca en silencio.

**2. Son frameworks distintos.** Lovable está en TanStack Start (`src/routes/`, `routeTree.gen.ts`, Vite, Bun). Este repo está en Next 16 App Router. Ningún componente cruza sin traducción, y la traducción sería permanente y en las dos direcciones.

**3. Nuestra arquitectura es server-first.** Los Server Components leen a través de RLS. Los de Lovable son cliente con props mock. Sincronizarlos arrastraría `'use client'` a todos lados y consultas a Supabase desde el navegador — justo lo que `CLAUDE.md` prohíbe. Y Lovable no ve nuestras políticas, ni los contratos Zod, ni las pruebas: cualquier cambio suyo que toque datos es adivinanza.

### Qué sí vale la pena minar de ahí

Cuando construyas una etapa, vale abrir el archivo correspondiente **para leer composición y jerarquía**, no para copiar código:

| Qué                                         | Dónde                                      | Para qué etapa                                 |
| ------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `src/mock/data.ts`                          | dataset completo con la forma del producto | referencia de qué campos necesita cada sección |
| `src/components/cliente/SeccionResumen.tsx` | composición del resumen                    | etapa 1                                        |
| `SeccionRedes.tsx`                          | tarjetas de red con semáforo               | etapa 1                                        |
| `SeccionPlanner.tsx`                        | la sección firma                           | etapa 2                                        |
| `PiezaDrawer.tsx`                           | orden de campos del drawer                 | etapa 2                                        |
| `SeccionResultados.tsx`                     | las dos tablas que alimentan el volumen    | etapa 3                                        |
| `SeccionVolumen.tsx`                        | el plan de volumen                         | etapa 4                                        |
| `SeccionMarca.tsx`                          | Context Card como documento                | etapa 5                                        |
| `SeccionGuiones.tsx`, `SeccionFechas.tsx`   | fichas y timeline                          | etapa 7                                        |
| `SeccionPauta.tsx`                          | comparación de ad sets                     | etapa 8                                        |

Se leen con el MCP de Lovable (`read_file`), que es de solo lectura y no gasta créditos. `send_message` **sí** gasta créditos del workspace: no lo uses para regenerar lo que ya existe.

Tres ideas concretas de su `kit.tsx` que valen la pena y todavía no están portadas:

- **`Field`** — label + chip de agente + nota debajo. Resuelve limpio cada campo del drawer de pieza, que es donde vive la procedencia. Portar en la etapa 2.
- **`so-shake`** — el keyframe del temblor. Es literalmente lo que el plan pide cuando sueltas una pieza sobre una con candado. Etapa 2.
- **`so-flash`** — destello de fondo. Para cuando la fecha en el riel cambia y para las tarjetas que el Auditor acaba de actualizar. Etapas 1 y 2.

### Qué NO traer

- Sus tokens de color. Contradicen el brief y la marca oficial todavía no llega.
- shadcn/ui completo. Son 40+ componentes de Radix con el look SaaS genérico que el brief rechaza explícitamente. Si en la etapa 2 hace falta un drawer o un select accesible de verdad, se trae **ese** componente y se restila, no la librería.
- Routing, `server.ts`, `start.ts`, config de Vite, `routeTree.gen.ts`. Nada de eso aplica.
