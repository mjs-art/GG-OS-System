# Los ocho agentes

Los agentes no operan la cuenta. **Preparan la base para que una persona decida rápido.** Esa frase es la especificación completa; todo lo demás son detalles de cómo se hace cumplir.

## Las reglas de la capa

**1. Proponer, no ejecutar.** Ningún agente mueve dinero, pausa un anuncio, publica una pieza ni manda un mensaje a un cliente. La lista blanca de lo que cada agente puede escribir vive en `src/agents/registry.ts`, en el campo `writes`, y es corta a propósito. El Analista y el Editor de marca escriben **cero** campos: dictaminan.

**2. Escalar es correcto, no es falla.** La salida de todo agente es `{ kind: 'resultado', data }` **o** `{ kind: 'escalamiento', pregunta, opciones, severidad }`. Un agente que no sabe pregunta, y su pregunta llega a la Bandeja con las opciones que él mismo propone. Un agente que inventa para no escalar es peor que uno que escala de más.

**3. Los contratos son código.** Entrada y salida son schemas de Zod. Se valida la entrada **antes** de llamar al proveedor y la salida **después**. Una salida que no cumple el schema es un error registrado, no algo que se intenta parchear.

**4. Todo se registra.** Cada corrida deja renglón en `agent_runs` con entrada, salida, modelo, tokens, costo, duración y **con qué versión del Context Card corrió**. Sin ese último dato, "¿por qué el agente dijo eso?" no tiene respuesta.

**5. Presupuesto duro.** `agent_policies.monthly_cap_cents` por agente y por cliente. El runner consulta `app.agent_spend_cents_this_month()` **antes** de cada llamada y se niega si ya se pasó. Un bug de reintentos no debe poder costar mil dólares mientras nadie ve.

**6. Todo lo verificable por código, se verifica por código.** `src/domain/brand-rules.ts` evalúa conteo de hashtags, minúsculas y palabras prohibidas sin llamar a ningún modelo. Es gratis, es instantáneo y no se deja convencer.

---

## Quién hace qué

| Agente         | Qué entrega                                                                                       | Escribe en `pieces`                 |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `estratega`    | el plan de volumen del mes: cuántos posts, carruseles, reels y stories, y **por qué cada número** | formato, pilar, fecha, orden        |
| `analista`     | quitar / meter más / mejorar, con evidencia numérica, más el bloque "para mitad de mes"           | nada                                |
| `guionista`    | guion por escenas a partir de una tendencia, con fit de marca y una alternativa más simple        | guion                               |
| `redactor`     | hook, copy in, copy out, CTA, hashtags                                                            | los campos de copy                  |
| `editor_marca` | veredicto por regla, con severidad y si la verificó código o modelo                               | nada                                |
| `pautero`      | propuesta de ajuste con razonamiento, impacto, riesgo y alternativa                               | solo marcar la pieza como impulsada |
| `auditor`      | semáforo por red con hallazgos concretos                                                          | nada                                |
| `cuenta`       | borrador de la presentación mensual y seguimiento de aprobaciones                                 | nada                                |

### Estratega

Responde la pregunta literal: _cuánto contenido es al mes_. Lee contrato y tier, rendimiento por formato y por pilar de los últimos 90 días, fechas y promociones de los próximos tres meses, pauta planeada, capacidad declarada y Context Card.

Lo que hace útil su salida no son los conteos: es que **cada renglón lleva su razón y la métrica que la respalda**. "Bajé posts simples de 9 a 6: alcance promedio 1,240 contra 3,890 del reel." Eso se le presenta al cliente sin traducir. Un plan de volumen sin razones no sirve para nada.

Escala si los resultados salieron de rango, si hay una fecha clave sin campaña, o si el volumen propuesto rebasa la capacidad declarada.

### Analista

Corre el día 3 del mes, y a mitad de mes en modo ligero.

El bloque **"para mitad de mes"** es el que resuelve el problema real de trabajar con un mes de adelanto: los resultados no alcanzan para replanear, pero sí para **cambiar tres piezas que aún no salen** y para alimentar el mes siguiente. El Analista está diseñado exactamente para esas dos cosas.

Escribe de vuelta al Context Card: top 5 piezas, últimas 3, y las correcciones aprendidas de `human_edits`.

### Guionista

**El agente no descubre la tendencia.** No existe una API limpia de audios en tendencia de TikTok o Instagram; cualquiera que prometa detección automática está vendiendo scraping frágil.

Lo que sí funciona: Ana registra en el radar lo que ve corriendo — formato, audio, link, en qué va — y el Guionista lo **traduce a guion con fit de marca**. Esa división es la que sirve. Diez minutos de radar a la semana son el input de mayor calidad que existe, porque viene de su ojo.

Cada ficha trae tendencia base, fit sobre 100 **con su razón**, duración, guion por escenas con tiempos, qué se necesita para grabarlo, y una alternativa más simple por si no hay tripié.

### Editor de marca

El agente que permite no leer las 2,000 piezas. Verifica cada pieza contra las reglas duras del cliente. Las de tipo `codigo` no lo tocan a él — las resuelve `src/domain/brand-rules.ts`. Las de juicio sí. **Siempre escala en severidad crítica**, nunca decide solo.

### Pautero

**Regla dura, no negociable:** nunca toca un presupuesto, nunca pausa un anuncio, nunca mueve dinero. Solo propone. La persona ejecuta el cambio en Meta Ads o TikTok Ads Manager y lo marca como aplicado en la app.

Dos razones. Una: es dinero del cliente, y un agente con escritura a cuentas publicitarias es un riesgo desproporcionado al beneficio. Dos: integrar escritura a la API de Meta Ads son semanas de trabajo y revisión de app para ahorrarse un clic.

Cada propuesta lleva razonamiento, impacto estimado, riesgo **y una alternativa**. La alternativa importa: casi siempre existe una versión más conservadora del mismo ajuste, y ofrecerla convierte una decisión de sí/no en una decisión informada.

### Auditor

Corre semanal. Bio completa, link activo, highlights ordenados, última publicación, consistencia contra objetivo, crecimiento, DMs y comentarios sin responder. Semáforo por red.

### Cuenta

Redacta la presentación mensual, persigue aprobaciones, convierte comentarios del cliente en tareas con el campo a cambiar, y avisa cuando un cliente lleva días sin responder. **Nunca manda un mensaje sin aprobación.**

---

## Cómo está armado

```
src/agents/
  contracts.ts        schemas Zod de entrada y salida de los 8
  registry.ts         la tabla que amarra agente ↔ contratos ↔ campos que escribe
  runner.ts           valida, revisa presupuesto, llama, valida, registra
  providers/
    mock.ts           datos ficticios deterministas, sin red
```

El registro es la fuente de verdad. `AgentOutput<'redactor'>` y `AgentOutput<'pautero'>` son tipos distintos derivados de ahí, así que pedirle al agente X un output del agente Y **no compila**.

El runner recibe sus dependencias inyectadas: no toca la base directamente, lo cual lo hace probable sin Postgres. Cinco puertas en orden, **todas antes de gastar un centavo**: proveedor configurado → existe la política → el agente está encendido → hay presupuesto → la entrada es válida. Solo entonces llama.

## Estado actual

`AGENTS_PROVIDER=mock`. **Cero llamadas de red a un LLM.** El mock es determinista — mismo input, mismo output — y simula también el caso de escalamiento, porque una interfaz que solo se probó con el camino feliz se rompe la primera vez que un agente pregunta. El mock además cobra un costo simulado: uno que siempre cuesta cero esconde justo el bug que el tope de gasto existe para atrapar.

Enchufar Claude es implementar `AgentProvider` en `providers/anthropic.ts` y cambiar la variable. Nada más.

### Dónde caen las salidas hoy

Las tablas destino de varios agentes todavía no existen — llegan con sus etapas del roadmap: `volume_plans` (etapa 4), `scripts` y `trends` (etapa 7), `campaigns` y `ad_proposals` (etapa 8), `social_accounts` (etapa 1).

Mientras tanto **todo cae en `agent_runs.output`**, validado contra su schema. Eso es suficiente para desarrollar y para auditar, pero no para consultar: no intentes construir el Volumen del mes leyendo `agent_runs`. Cuando llegue su etapa, la tabla se agrega y el runner escribe a las dos.

## Cuando llegue el momento de encenderlos

Enciende **un** agente, en **un** cliente. Mide costo real, latencia y **tasa de edición** durante un mes completo antes de encender el segundo.

El Redactor es el mejor primer candidato: alto volumen, bajo riesgo, retroalimentación inmediata. Si su tasa de edición es del 90%, el problema no es el modelo — es el Context Card, y eso se arregla antes de escalar el gasto.

`human_edits` es el activo real del sistema. Cada corrección es criterio de marca aprendido. Sin esa tabla, los agentes cometen el mismo error el mes que entra.
