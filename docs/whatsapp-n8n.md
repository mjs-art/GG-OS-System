# WhatsApp vía n8n

Cómo se conecta WhatsApp al Studio OS. La regla que lo define: **n8n es el
transporte, no el cerebro.** n8n tiene las credenciales de Meta y mueve los
mensajes; la app decide qué se manda y guarda el gate de aprobación. Ningún
mensaje sale sin que una persona lo apruebe (regla #1), y las credenciales de
Meta nunca tocan el repo ni la base (regla #4).

```
                        entrada (cliente → estudio)
  Cliente → WhatsApp → Meta → n8n ──POST /api/jobs/whatsapp──→ app
                                   (x-studio-secret)         (escribe wa_messages,
                                                              corre al agente Cuenta,
                                                              deja un BORRADOR)

                        salida (estudio → cliente)
  Ana aprueba en /whatsapp → app ──POST N8N_SEND_WEBHOOK_URL──→ n8n → Meta → Cliente
                              (x-studio-secret)                       │
                              app marca 'enviado' ←──POST /api/jobs/whatsapp──┘
                                                       (reporte)
```

## Variables de entorno

Van en `.env.local` (nunca en git). Las dos son opcionales para que la app
arranque sin ellas; sin configurarlas, la entrada rechaza todo y la salida
avisa que no está configurada.

| Variable               | Qué es                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `N8N_INBOUND_SECRET`   | Secreto compartido. n8n lo manda en cada entrada y la app en cada envío. Genera uno con `openssl rand -base64 32`. |
| `N8N_SEND_WEBHOOK_URL` | La URL del webhook de envío de n8n (el que la app llama para mandar).                                              |

Las credenciales de Meta (phone number id, token, verify token, app secret)
viven **solo en n8n**, en sus credenciales/variables. No se declaran aquí.

## Autorización

Un único secreto compartido (`N8N_INBOUND_SECRET`) viaja en el header
`x-studio-secret` en las dos direcciones:

- **n8n → app:** la ruta `/api/jobs/whatsapp` compara el header contra el
  secreto. Si no coincide, responde `401`. Si el secreto no está configurado,
  responde `503` y no entra nada a ciegas.
- **app → n8n:** la app manda el mismo header al webhook de envío. En n8n hay
  que rechazar la petición si no coincide (un nodo IF al inicio del workflow).

## Workflow 1 — Entrada (Meta → app)

Recibe lo que manda Meta y lo reenvía a la app. Dos tipos de evento entran por
la misma ruta, discriminados por el campo `tipo`.

**Nodos:**

1. **WhatsApp Trigger** (o Webhook) — suscrito a los mensajes entrantes de Meta.
2. **Set / Function** — normaliza el evento de Meta a nuestro contrato.
3. **HTTP Request** — `POST` a `https://<tu-app>/api/jobs/whatsapp`
   - Header: `x-studio-secret: {{$env.N8N_INBOUND_SECRET}}`
   - Header: `Content-Type: application/json`
   - Body (mensaje entrante del cliente):

     ```json
     {
       "tipo": "mensaje",
       "wa_phone": "+525512345678",
       "wa_message_id": "wamid.HBg...",
       "text": "¿ya quedó el reel?",
       "media": [{ "kind": "image", "url": "https://...", "caption": null }],
       "display_name": "Nombre en WhatsApp"
     }
     ```

     - `wa_phone`: el teléfono del cliente. La app lo normaliza a E.164; no
       hace falta que venga perfecto, pero sí con lada de país.
     - `wa_message_id`: el id de Meta. La app lo usa para no duplicar un webhook
       reintentado (es idempotente).
     - `text` y `media` son opcionales; `media` default `[]`. `kind` es uno de
       `image` · `video` · `audio` · `document`.

**Respuestas de la app:**

- `200 { ok: true }` — se guardó (y se disparó el borrador del agente Cuenta).
- `202 { ok: true, ignorado }` — el número no está ligado a ninguna
  conversación; no se guarda huérfano. Da de alta la conversación en la app y
  vuelve a intentar.
- `400` — el teléfono o el payload no son válidos.
- `401` / `503` — secreto equivocado / WhatsApp sin configurar.

> El estudio liga el número del cliente a una conversación (`wa_conversations`)
> antes de que la entrada funcione. Un número sin conversación se ignora a
> propósito, para no guardar mensajes que no se pueden atribuir a nadie.

## Workflow 2 — Envío (app → Meta → reporte)

El webhook que la app llama al aprobar un saliente. Manda por Meta y **reporta
de vuelta** para que la app selle el `enviado`.

**Nodos:**

1. **Webhook** — esta URL es la que va en `N8N_SEND_WEBHOOK_URL`. Recibe de la
   app:

   ```json
   {
     "message_id": "00000000-0000-4000-8000-000000000001",
     "to": "+525512345678",
     "text": "Hola, con gusto. Ya lo reviso y te confirmo.",
     "media": [{ "kind": "image", "url": "https://...", "caption": null }]
   }
   ```

   - `message_id`: **nuestro** uuid de `wa_messages`. Guárdalo: va de vuelta en
     el reporte para que el `enviado` caiga en la fila correcta.
   - `to`: el teléfono destino, ya en E.164.
   - `media`: los adjuntos que Ana anexó. Los `url` son enlaces (p. ej. de
     Drive) — n8n tiene que poder bajarlos para reenviarlos a Meta.

2. **IF** — rechaza (`403`) si `x-studio-secret` no coincide con el secreto.
3. **WhatsApp / Meta send** — manda `text` y, si hay, cada `media`.
4. **HTTP Request** — `POST` a `https://<tu-app>/api/jobs/whatsapp` con el
   reporte:

   ```json
   {
     "tipo": "reporte",
     "message_id": "00000000-0000-4000-8000-000000000001",
     "status": "enviado",
     "wa_message_id": "wamid.HBg...",
     "error": null
   }
   ```

   - `status`: `enviado` o `fallido`.
   - `wa_message_id`: el id que Meta le asignó al mensaje enviado.
   - En `fallido`, manda `error` con el motivo; la app deja el saliente en
     `fallido` para reintentar.

> **La app no confía en el reporte para saltarse la aprobación.** Marcar un
> saliente como `enviado` sin que estuviera aprobado lo frena un CHECK de la
> base (`wa_enviado_exige_aprobacion`), aun con `service_role`. Un reporte no
> puede "enviar" algo que nadie autorizó.

## Nota sobre la ventana de 24 h de Meta

Fuera de la ventana de 24 h desde el último mensaje del cliente, Meta solo deja
enviar **plantillas pre-aprobadas**. Eso lo maneja n8n/Meta (elegir plantilla
vs. mensaje libre), no el esquema de la app. Tenlo en cuenta al armar el nodo
de envío.

## Prueba rápida

Con `N8N_INBOUND_SECRET` puesto, simula un entrante:

```bash
curl -X POST https://<tu-app>/api/jobs/whatsapp \
  -H "x-studio-secret: $N8N_INBOUND_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"mensaje","wa_phone":"+525512345678","wa_message_id":"wamid.TEST","text":"hola"}'
```

- `200` → la conversación existe y se guardó.
- `202` → falta ligar ese número a una conversación en la app.
- `401` → el secreto no coincide.

El seguimiento del módulo está en Linear **PRO-22** (equipo Proyectos
Personales).
