// @vitest-environment node
//
// `serverEnv()` rechaza correr donde exista `window` — jsdom (el default del
// proyecto) lo simula, así que este archivo pide el entorno `node` puro.
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'

// `server-only` solo se vuelve un no-op bajo el compilador de Next; en
// Vitest+jsdom truena "no se puede importar desde un Client Component" sin
// este mock. `investigador.ts` y `correr.ts` (del que importa `proveedorDeEnv`)
// lo traen porque escriben con service_role.
vi.mock('server-only', () => ({}))

/**
 * Solo las dos puertas que `correrInvestigador` cruza ANTES de tocar la base:
 * sin webhook configurado, y webhook que no responde con una transcripción.
 * En los dos casos no se llega a `runAgent` ni a `createAgentStore`, así que
 * no hace falta fabricar un doble de Supabase con varias tablas encadenadas
 * —el resto de `correr.ts` tampoco tiene pruebas unitarias por esa razón—.
 * El camino feliz (transcripción → runAgent → `video_summaries`) se valida a
 * mano con un video real una vez que el workflow de n8n esté conectado.
 *
 * `serverEnv()` cachea su resultado a nivel de módulo, así que cada prueba
 * necesita su propio módulo: `vi.resetModules()` + import dinámico.
 */

const adminSinTocar = {} as SupabaseClient<Database>

describe('correrInvestigador', () => {
  beforeEach(() => {
    vi.resetModules()
    // `@/lib/env` valida el bloque público al importarse (fuera de cualquier
    // función) — sin esto, cualquier módulo que arrastre `@/lib/env` truena
    // antes de llegar a la lógica que se quiere probar.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://ejemplo.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'clave-de-prueba')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('no corre si falta N8N_INVESTIGADOR_WEBHOOK_URL', async () => {
    const { correrInvestigador } = await import('@/agents/investigador')

    const resultado = await correrInvestigador(adminSinTocar, {
      orgId: 'org-1',
      clientId: null,
      youtubeUrl: 'https://www.youtube.com/watch?v=abc',
      userId: 'user-1',
    })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.code).toBe('sin_webhook')
      expect(resultado.message).toContain('N8N_INVESTIGADOR_WEBHOOK_URL')
    }
  })

  it('devuelve error si el workflow de n8n no responde con una transcripción', async () => {
    vi.stubEnv('N8N_INVESTIGADOR_WEBHOOK_URL', 'https://n8n.example.test/webhook/investigador')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('boom'),
      }),
    )

    const { correrInvestigador } = await import('@/agents/investigador')

    const resultado = await correrInvestigador(adminSinTocar, {
      orgId: 'org-1',
      clientId: null,
      youtubeUrl: 'https://www.youtube.com/watch?v=abc',
      userId: 'user-1',
    })

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.code).toBe('transcripcion')
      expect(resultado.message).toContain('n8n respondió 500')
    }
  })
})
