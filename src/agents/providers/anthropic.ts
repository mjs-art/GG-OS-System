import Anthropic from '@anthropic-ai/sdk'
import type { AgentKey } from '@/agents/contracts'
import { contractFor } from '@/agents/registry'
import type { AgentProvider, ProviderRequest, ProviderResult } from '@/agents/runner'

/**
 * El proveedor real: Claude.
 *
 * El runner no sabe que esto existe — recibe un `AgentProvider` por parámetro.
 * Aquí solo se traduce: Context Card + entrada del agente → mensaje a Claude →
 * JSON crudo de vuelta. La validación de la SALIDA la hace el runner contra el
 * schema Zod (Puerta 5); por eso `output` sale como `unknown` y aquí NO se
 * valida ni se "arregla": un modelo que ya alucinó la forma no es fuente
 * confiable para repararla, y el reintento cuesta dinero.
 *
 * Por qué no se usan structured outputs con conversión automática del Zod: los
 * contratos traen `.trim()`, `.regex(...)` y `.min(1)`, que no sobreviven a una
 * conversión a JSON Schema. Se le describe la forma esperada en el prompt y se
 * confía en la Puerta 5. Con Opus 4.8 y un ejemplo claro, la forma sale bien;
 * cuando no, el runner lo registra como `salida_invalida` — que es justo el
 * comportamiento diseñado.
 */

const MODELO_DEFAULT = 'claude-opus-4-8'

type Effort = 'low' | 'medium' | 'high'

/**
 * Ruteo por agente: con qué modelo y cuánto esfuerzo corre cada uno.
 *
 * El MODELO se queda en Opus 4.8 para todos. Bajar de modelo es una decisión
 * consciente por cliente y para eso está `agent_policies.model`, que gana sobre
 * este default (lo lee el runner y llega en `request.model`). El dial de costo
 * de aquí es el ESFUERZO, que es la palanca de Opus 4.8 sin cambiar de modelo:
 *
 *   - bajo   → revisar/clasificar lo que ya existe (Editor de marca)
 *   - medio  → escribir (Redactor, Guionista, Cuenta)
 *   - alto   → razonar sobre estrategia o auditar la cuenta (Estratega,
 *              Analista, Pautero, Auditor)
 */
const RUTEO: Record<AgentKey, { model: string; effort: Effort }> = {
  estratega: { model: MODELO_DEFAULT, effort: 'high' },
  analista: { model: MODELO_DEFAULT, effort: 'high' },
  guionista: { model: MODELO_DEFAULT, effort: 'medium' },
  redactor: { model: MODELO_DEFAULT, effort: 'medium' },
  editor_marca: { model: MODELO_DEFAULT, effort: 'low' },
  pautero: { model: MODELO_DEFAULT, effort: 'high' },
  auditor: { model: MODELO_DEFAULT, effort: 'high' },
  cuenta: { model: MODELO_DEFAULT, effort: 'medium' },
  // Resumir una transcripción no pide el razonamiento de estrategia: esfuerzo
  // bajo, como el Editor de marca.
  investigador: { model: MODELO_DEFAULT, effort: 'low' },
}

/** Centavos de USD por millón de tokens. Default = tarifa de Opus 4.8. */
const TARIFA_OPUS = { entrada: 500, salida: 2500 }
const PRECIO_POR_MTOK: Record<string, { entrada: number; salida: number }> = {
  'claude-opus-4-8': TARIFA_OPUS,
  'claude-sonnet-5': { entrada: 300, salida: 1500 },
  'claude-haiku-4-5': { entrada: 100, salida: 500 },
}

/**
 * Las reglas de la casa, idénticas para todos los agentes. Van en el system
 * prompt (estable por cliente) para que el prefijo se pueda cachear.
 */
const REGLAS_DE_LA_CASA = `Eres uno de los agentes de una agencia de social media en México. Trabajas para una persona que revisa y aprueba TODO lo que escribes.

Reglas que no se rompen:
- Propones un borrador; nunca ejecutas, publicas ni mandas nada. La aprobación es de una persona.
- Respetas siempre las reglas de caption que te llegan en la entrada (minúsculas, palabras prohibidas, número de hashtags).
- Si te falta información para escribir con criterio, NO inventes: escala. Devuelve la rama de escalamiento con una pregunta corta y hasta cinco opciones que tú propones.
- Escribes en español de México, con la voz de la marca que está en el contexto de abajo.`

/** La forma de salida esperada por agente, descrita para el modelo. */
function formaDeSalida(agent: AgentKey): string {
  if (agent === 'redactor') {
    return `Devuelve SOLO un objeto JSON, sin texto antes ni después y sin bloques de código. Una de dos ramas:

Si puedes escribir la pieza:
{"kind":"resultado","data":{"piece_id":"<el uuid que te dieron>","hook":"la primera línea, la que engancha","copy_in":"texto sobre el video/carrusel","copy_out":"el caption del post","cta":"la llamada a la acción","hashtags":["#uno","#dos"]}}

Si te falta contexto para escribir con criterio:
{"kind":"escalamiento","pregunta":"...","opciones":[{"key":"a","label":"..."}],"severidad":"media","piece_id":"<el uuid>"}

Cada hashtag empieza con # y no lleva espacios. La severidad es una de: baja, media, alta, critica.`
  }
  return `Devuelve SOLO el objeto JSON que corresponde a tu contrato (rama "resultado" con tu "data", o rama "escalamiento"), sin texto extra ni bloques de código.`
}

function systemPara(agent: AgentKey, contextCard: string): string {
  const contrato = contractFor(agent)
  return [
    `${REGLAS_DE_LA_CASA}\n\nTu trabajo: ${contrato.description}.`,
    formaDeSalida(agent),
    contextCard,
  ].join('\n\n---\n\n')
}

/** Quita un envoltorio ```json … ``` si el modelo lo agregó de más. */
function limpiarJson(texto: string): string {
  const t = texto.trim()
  const cerca = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return (cerca?.[1] ?? t).trim()
}

function costoCents(
  model: string,
  entrada: number,
  cacheRead: number,
  cacheWrite: number,
  salida: number,
): number {
  const tarifa = PRECIO_POR_MTOK[model] ?? TARIFA_OPUS
  const cents =
    (entrada * tarifa.entrada +
      cacheRead * tarifa.entrada * 0.1 +
      cacheWrite * tarifa.entrada * 1.25 +
      salida * tarifa.salida) /
    1_000_000
  return Math.round(cents)
}

export function createAnthropicProvider(apiKey: string): AgentProvider {
  const client = new Anthropic({ apiKey })

  return {
    name: 'anthropic',
    async complete<K extends AgentKey>(request: ProviderRequest<K>): Promise<ProviderResult> {
      const ruta = RUTEO[request.agent]
      const model = request.model ?? ruta.model

      const message = await client.messages.create(
        {
          model,
          max_tokens: 2048,
          // El Context Card (estable por cliente) va con cache_control: si supera
          // el mínimo cacheable del modelo, el prefijo se sirve a ~0.1×.
          system: [
            {
              type: 'text',
              text: systemPara(request.agent, request.contextCard),
              cache_control: { type: 'ephemeral' },
            },
          ],
          // Sin thinking (Opus 4.8 sin el parámetro no razona): la salida va
          // restringida por el prompt. El costo se modula con el esfuerzo por
          // agente (ver RUTEO): revisar es barato, razonar es caro.
          output_config: { effort: ruta.effort },
          messages: [
            {
              role: 'user',
              content: `Escribe la pieza a partir de estos datos:\n\n${JSON.stringify(request.input, null, 2)}`,
            },
          ],
        },
        request.signal ? { signal: request.signal } : undefined,
      )

      if (message.stop_reason === 'refusal') {
        throw new Error('el modelo declinó la solicitud (refusal).')
      }

      const texto = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()

      if (texto === '') throw new Error('el modelo no devolvió texto.')

      let output: unknown
      try {
        output = JSON.parse(limpiarJson(texto))
      } catch {
        // La Puerta 5 del runner lo tratará como salida_invalida y lo registrará.
        throw new Error('el modelo no devolvió un JSON parseable.')
      }

      const u = message.usage
      const cacheWrite = u.cache_creation_input_tokens ?? 0
      const cacheRead = u.cache_read_input_tokens ?? 0

      return {
        output,
        model: message.model,
        inputTokens: u.input_tokens + cacheRead + cacheWrite,
        outputTokens: u.output_tokens,
        costCents: costoCents(
          message.model,
          u.input_tokens,
          cacheRead,
          cacheWrite,
          u.output_tokens,
        ),
      }
    },
  }
}
