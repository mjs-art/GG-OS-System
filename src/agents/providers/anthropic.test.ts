import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentKey } from '@/agents/contracts'
import type { ProviderRequest } from '@/agents/runner'

/**
 * El adaptador de Claude, probado SIN tocar la red.
 *
 * Se mockea `@anthropic-ai/sdk`: `createAnthropicProvider` construye su propio
 * `new Anthropic(...)`, así que el doble reemplaza el cliente entero y
 * `messages.create` devuelve lo que cada prueba dicte. Nada sale a internet — y
 * eso es a propósito: la aritmética del costo y el manejo del refusal son lo que
 * nadie quiere descubrir roto en producción con la factura enfrente.
 *
 * Lo que se fija aquí:
 *   · el costo en centavos, con el cache read a 0.1× y el write a 1.25×;
 *   · que los tokens de entrada sumen input + cache read + cache write;
 *   · que el costo use el modelo que RESPONDIÓ, y que la llamada salga con el
 *     modelo del policy cuando lo hay;
 *   · el ruteo del esfuerzo por agente;
 *   · y que refusal / sin-texto / JSON-no-parseable se conviertan en error para
 *     que la Puerta 5 del runner los registre.
 */

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMock }
  },
}))

// Se importa después (en orden de módulo) para que el mock ya esté puesto; vitest
// eleva `vi.mock` de todos modos, pero deja clara la intención.
import { createAnthropicProvider } from '@/agents/providers/anthropic'

interface UsoFake {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Arma la respuesta que devolvería `messages.create`, con lo mínimo que lee el adaptador. */
function respuesta(opts: {
  texto?: string
  bloques?: { type: string; text?: string }[]
  model?: string
  stop_reason?: string
  usage: UsoFake
}) {
  const content =
    opts.bloques ?? (opts.texto !== undefined ? [{ type: 'text', text: opts.texto }] : [])
  return {
    stop_reason: opts.stop_reason ?? 'end_turn',
    model: opts.model ?? 'claude-opus-4-8',
    content,
    usage: opts.usage,
  }
}

function pedido(agent: AgentKey, model: string | null = null): ProviderRequest<AgentKey> {
  // El input solo se serializa a JSON en el prompt; el adaptador no lo valida
  // (eso es trabajo del runner), así que basta un objeto cualquiera.
  return {
    agent,
    input: { demo: true },
    contextCard: 'CONTEXTO DE MARCA DE PRUEBA',
    contextVersion: 3,
    model,
  } as unknown as ProviderRequest<AgentKey>
}

/** Lee, con tipos, los parámetros con que se llamó a `messages.create`. */
function paramsDeLlamada(i = 0) {
  return createMock.mock.calls[i]?.[0] as
    | {
        model: string
        output_config?: { effort?: string }
        system?: { type: string; text: string; cache_control?: { type: string } }[]
      }
    | undefined
}

beforeEach(() => {
  createMock.mockReset()
})

describe('createAnthropicProvider', () => {
  it('parsea el JSON del modelo y calcula tokens y costo', async () => {
    createMock.mockResolvedValue(
      respuesta({
        texto: '{"kind":"resultado","data":{"x":1}}',
        usage: { input_tokens: 20000, output_tokens: 4000 },
      }),
    )

    const r = await createAnthropicProvider('sk-ant-test').complete(pedido('redactor'))

    expect(r.output).toEqual({ kind: 'resultado', data: { x: 1 } })
    expect(r.model).toBe('claude-opus-4-8')
    expect(r.inputTokens).toBe(20000)
    expect(r.outputTokens).toBe(4000)
    // (20000·500 + 4000·2500) / 1e6 = 20 centavos.
    expect(r.costCents).toBe(20)
  })

  it('quita el envoltorio de bloque de código que a veces agrega el modelo', async () => {
    createMock.mockResolvedValue(
      respuesta({
        texto: '```json\n{"kind":"resultado","data":{"y":2}}\n```',
        usage: { input_tokens: 1000, output_tokens: 100 },
      }),
    )

    const r = await createAnthropicProvider('sk-ant-test').complete(pedido('redactor'))

    expect(r.output).toEqual({ kind: 'resultado', data: { y: 2 } })
  })

  it('cobra el cache read a 0.1× y el write a 1.25×, y suma los tokens de entrada', async () => {
    createMock.mockResolvedValue(
      respuesta({
        texto: '{"kind":"resultado"}',
        usage: {
          input_tokens: 10000,
          output_tokens: 4000,
          cache_read_input_tokens: 100000,
          cache_creation_input_tokens: 8000,
        },
      }),
    )

    const r = await createAnthropicProvider('sk-ant-test').complete(pedido('redactor'))

    // 10000·500 + 100000·500·0.1 + 8000·500·1.25 + 4000·2500 = 25·1e6 → 25 centavos.
    expect(r.costCents).toBe(25)
    expect(r.inputTokens).toBe(118000) // 10000 + 100000 + 8000
  })

  it('respeta agent_policies.model en la llamada y cobra según el modelo que respondió', async () => {
    createMock.mockResolvedValue(
      respuesta({
        texto: '{"kind":"resultado"}',
        model: 'claude-haiku-4-5',
        usage: { input_tokens: 100000, output_tokens: 20000 },
      }),
    )

    const r = await createAnthropicProvider('sk-ant-test').complete(
      pedido('redactor', 'claude-haiku-4-5'),
    )

    // La llamada salió con el modelo del policy, no con el default del ruteo.
    expect(paramsDeLlamada()?.model).toBe('claude-haiku-4-5')
    // Y el costo usó la tarifa de haiku (100/500 por Mtok): (100000·100 + 20000·500)/1e6 = 20.
    expect(r.costCents).toBe(20)
  })

  it('rutea el esfuerzo por agente: editor_marca bajo, estratega alto', async () => {
    createMock.mockResolvedValue(
      respuesta({ texto: '{"kind":"resultado"}', usage: { input_tokens: 1, output_tokens: 1 } }),
    )
    const proveedor = createAnthropicProvider('sk-ant-test')

    await proveedor.complete(pedido('editor_marca'))
    await proveedor.complete(pedido('estratega'))

    expect(paramsDeLlamada(0)?.output_config?.effort).toBe('low')
    expect(paramsDeLlamada(1)?.output_config?.effort).toBe('high')
  })

  it('manda el Context Card en el system con cache_control para cachear el prefijo', async () => {
    createMock.mockResolvedValue(
      respuesta({ texto: '{"kind":"resultado"}', usage: { input_tokens: 1, output_tokens: 1 } }),
    )

    await createAnthropicProvider('sk-ant-test').complete(pedido('redactor'))

    const bloque = paramsDeLlamada()?.system?.[0]
    expect(bloque?.cache_control).toEqual({ type: 'ephemeral' })
    expect(bloque?.text).toContain('CONTEXTO DE MARCA DE PRUEBA')
  })

  it('convierte un refusal del modelo en error', async () => {
    createMock.mockResolvedValue(
      respuesta({
        stop_reason: 'refusal',
        texto: '',
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    )

    await expect(
      createAnthropicProvider('sk-ant-test').complete(pedido('redactor')),
    ).rejects.toThrow(/refusal/i)
  })

  it('falla si el modelo no devolvió texto', async () => {
    createMock.mockResolvedValue(
      respuesta({ bloques: [], usage: { input_tokens: 1, output_tokens: 0 } }),
    )

    await expect(
      createAnthropicProvider('sk-ant-test').complete(pedido('redactor')),
    ).rejects.toThrow(/no devolvió texto/i)
  })

  it('falla si la salida no es JSON parseable', async () => {
    createMock.mockResolvedValue(
      respuesta({ texto: 'esto no es json', usage: { input_tokens: 1, output_tokens: 1 } }),
    )

    await expect(
      createAnthropicProvider('sk-ant-test').complete(pedido('redactor')),
    ).rejects.toThrow(/JSON parseable/i)
  })
})
