# Sistema de diseño

Editorial, densidad de sala de control. **No** dashboard corporativo, **no** SaaS genérico.

Los tokens viven en `src/app/globals.css` y las primitivas en `src/components/ui/primitives.tsx`. De dónde salen las decisiones visuales está en [`design-sources.md`](./design-sources.md).

---

## La paleta oficial

Ana Gz Studio entregó cuatro colores el 1 de agosto de 2026:

| Color     | Rol en la marca  | Dónde vive                             |
| --------- | ---------------- | -------------------------------------- |
| `#630000` | oxblood profundo | `accent-hot` en tema claro             |
| `#810100` | rojo             | `accent` en los dos temas · `pillar-1` |
| `#1B1717` | negro cálido     | `bg` en oscuro · `fg` en claro         |
| `#EDEBDD` | crema            | `fg` en oscuro · `bg` en claro         |

Son cuatro y el sistema necesita ocho por tema. Hairlines, superficies elevadas, hover y texto secundario están **derivados**, y cada derivado lleva en el CSS un comentario que dice de dónde sale. Si hace falta un color nuevo, se deriva ahí — no se inventa en el componente.

### La trampa de contraste que ya nos mordió

`#810100` sobre `#1B1717` da **1.6:1**. WCAG pide 3:1 para un indicador de foco, o sea que el rojo de marca es literalmente invisible como anillo de foco en tema oscuro.

Por eso `--color-accent-hot` **no es el mismo color en los dos temas**:

- Oscuro: `#C9382B`, un rojo derivado aclarado hasta 3.5:1. No es oficial y está marcado como tal.
- Claro: `#630000` oficial, 11:1 sobre el crema.

`e2e/cimientos.spec.ts` fija los dos valores. Si alguien lo "corrige" de vuelta al color de marca porque se ve más bonito, la prueba falla y explica por qué.

Vale la pena decirlo claro: **esta paleta es nativamente clara.** El mismo rojo que da 1.6:1 sobre negro da 9:1 sobre el crema. El tema oscuro es el que necesita muletas, no al revés.

---

## Los tokens se llaman por su rol

```
bg          fondo de página
surface     cards, superficies elevadas
surface-2   hover
line        hairlines
fg          texto principal
fg-muted    labels, texto secundario
accent      acento de marca
accent-hot  hover, foco, activo
on-accent   texto sobre el acento — el MISMO crema en los dos temas

critical  high  medium  ok      semánticos, desaturados a propósito
pillar-1 … pillar-6              taxonomía de contenido, igual en los dos temas
```

Rol y no color, a propósito: `--color-ink` significando "el fondo" deja de tener sentido en cuanto el fondo es crema, y a los seis meses alguien mete la pata. El componente pide el rol; el tema decide el color.

---

## Los dos temas

`@theme static` en `globals.css` es el tema **oscuro**, que es el default. El bloque `[data-tema='claro']` redefine los mismos tokens.

### Por qué `static`

Sin `static`, Tailwind v4 solo emite las variables cuyas utilidades detecta en el código. Un token que únicamente se lee desde CSS desaparece del bundle y el override del tema claro se queda apuntando a la nada — en silencio. `tokens.test.ts` verifica que la palabra siga ahí.

Por lo mismo, **nunca `@theme inline`**: `inline` mete el valor literal dentro de cada utilidad y el override en runtime deja de funcionar por completo.

### Por qué el selector no lleva `html` adelante

Está escrito `[data-tema='claro']` y no `html[data-tema='claro']`. El portal de cliente (`/aprobar`) va a envolver su árbol en un `<div data-tema="claro">` para quedar fijo en claro sin importar la cookie del estudio: es la superficie del cliente y es el PDF que reemplaza la presentación mensual. Con el selector escopado a `html` esa anidación deja de funcionar y el cliente termina viendo el tema de Ana. Hay una prueba que lo prohíbe.

### Por qué cookie y no localStorage

Con localStorage el servidor no sabe qué tema pintar: el HTML sale con el default y un script lo corrige después del primer pintado. Eso es el flashazo. La forma normal de taparlo es un `<script>` bloqueante con `dangerouslySetInnerHTML`, que en este repo está **prohibido por ESLint**.

Con cookie, el layout raíz la lee en el servidor y el `<html>` ya sale con `data-tema` puesto. Cero flashazo, cero JavaScript de cliente, cero regla rota. El switch (`src/components/ui/switch-tema.tsx`) es un `<form>` con un Server Action: funciona con JS apagado.

El costo es que leer la cookie vuelve dinámico el layout raíz. Con RLS y sesión por usuario esta app no era cacheable de forma estática de todos modos.

Las piezas:

| Archivo                             | Qué hace                                                              |
| ----------------------------------- | --------------------------------------------------------------------- |
| `src/domain/tema.ts`                | reglas puras: validación, tema opuesto, `color-scheme`, `theme-color` |
| `src/lib/tema.ts`                   | el único IO: leer la cookie de la petición                            |
| `src/components/ui/switch-tema.tsx` | el switch y su Server Action                                          |
| `src/app/layout.tsx`                | pone `data-tema` y genera el viewport por tema                        |

`colorScheme` en el viewport no es cosmético: es lo que le dice al navegador de qué color pintar los controles nativos, las barras de scroll y el autocompletado. Con el valor equivocado, un input en tema claro sale con fondo oscuro del sistema y se ve roto sin que ninguna regla nuestra falle.

### Agregar un token es agregarlo a los dos temas

El modo de falla es silencioso: alguien agrega `--color-warning` al oscuro, se le olvida el claro, y en claro ese token cae al valor oscuro. No truena nada. Solo hay un chip ilegible en una pantalla que casi nadie abre, hasta que la abre un cliente.

`tokens.test.ts` falla si:

- un rol obligatorio falta en cualquiera de los dos temas,
- el tema claro declara un token que el oscuro no tiene,
- el selector del tema claro está escopado a `html`,
- `@theme` perdió el `static`,
- un hex, un `bg-gray-*` o una sombra se escaparon a un componente.

Las tres primeras se verificaron rompiendo el CSS a propósito y viendo la prueba fallar con el nombre correcto. Un guardián que nunca falla no es un guardián.

---

## Reglas que no cambian

- **Cero sombras.** La jerarquía se construye con espacio y peso tipográfico.
- Todos los bordes son hairline de 1px en `--color-line`. `border-radius: 2px` en todo.
- Sin gradientes, sin glassmorphism, sin glow.
- Foco visible en `--color-accent-hot` en todo lo interactivo. Respeta `prefers-reduced-motion`.
- Responsive hasta 375px.

**Si vas a escribir un hex, un `border-gray-*` o una sombra en un componente de feature: para.** Falta una primitiva. Agrégala en `primitives.tsx`.

Los colores que sí son literales en runtime — el de cada pilar y el de marca del cliente — vienen de la base como **dato**, no como diseño, y entran por `style`. Eso está bien y la prueba no los toca porque mira el código fuente.

---

## Tipografía

Hoy: **Archivo** expandido en mayúsculas para display · **Inter Tight** para UI · **IBM Plex Mono** 11px para datos, fechas, labels y chips.

### Pendiente: Meno Banner y Helvetica

Junto con la paleta, Ana entregó una dirección tipográfica distinta: **Helvetica** como principal para body text y **Meno Banner** (Italic y Light) para display y links. No está implementada todavía.

**Meno Banner** es de Richard Lipton (Lipton Letter Design, The Type Founders) y está **en Adobe Fonts**. Eso importa: si el estudio ya paga Creative Cloud, el uso web viene incluido sin costo extra — se crea un Web Project y se sirve desde ahí. No hay que comprar licencia aparte. Meno es un **oldstyle**: las romanas vienen de las formas barrocas francesas de Granjon y las itálicas del trabajo de Voskens en el Ámsterdam del siglo XVII. `Banner` es el tamaño óptico de display: más contraste y hairlines más finas que el corte de texto.

Si por lo que sea no se puede usar Adobe Fonts —headless en CI, un cliente sin cuenta, no querer una dependencia externa en el render— la alternativa libre es **Instrument Serif** (OFL, Google Fonts). Se compararon ocho candidatas contra el specimen de Ana igualando la altura de x, y es la única que acierta las tres cosas que definen a Banner: alto contraste, x-height grande con ascendentes cortas, y proporciones condensadas. Su itálica es de display —firme, no caligráfica—, igual que la de Meno.

Lo que se descartó y por qué, porque el error es fácil de repetir:

| Candidata            | Problema                                                             |
| -------------------- | -------------------------------------------------------------------- |
| Cormorant Garamond   | demasiado delicada, x-height chica — se ve frágil, no de banner      |
| EB Garamond          | contraste bajo y más ancha; acierta la época, falla el tamaño óptico |
| Sorts Mill Goudy     | itálica muy caligráfica, con tics de Goudy                           |
| Libre Caslon Display | no tiene itálica real                                                |
| Crimson Pro          | versátil pero contraste bajo, se lee como fuente de libro            |
| Newsreader           | transicional, no oldstyle                                            |
| Playfair Display     | el error común: es didone, otra época, y mucho más ancha             |

La limitación de Instrument Serif es que solo tiene un peso (400) más itálica. Meno Banner Light es el que Ana usa para la línea de mayúsculas espaciadas; con Instrument Serif esa línea sale un poco más pesada. A tamaño de label casi no se nota.

**Helvetica** no es universal: en Mac y iOS existe, en Windows y Android cae a Arial, que tiene otro color de página. Si eso importa, se resuelve con Inter (gratis, ya cargada) o comprando Helvetica Now.

Cambiar la tipografía es un cambio de carácter, no un ajuste: deja de leerse como sala de control y se vuelve estudio de diseño. Los previews están en `.context/preview-paleta.html` (las tres variantes de tema) y `.context/specimen-meno.html` (las ocho candidatas contra la referencia).

---

## Lenguaje

Español de México. Sentence case. Verbos directos. Cero jerga técnica. Cero emojis decorativos.

**Estados vacíos** dicen qué hacer. "Sin datos" no es un estado vacío, es una disculpa. **Errores** explican qué pasó y cómo arreglarlo, sin disculparse.
