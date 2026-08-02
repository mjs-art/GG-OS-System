import { z } from 'zod'

/**
 * The single place in the codebase allowed to read process.env.
 * ESLint enforces this (see `no-restricted-properties` in eslint.config.mjs).
 *
 * Why: an unset variable should fail loudly at boot, not produce `undefined`
 * that silently disables auth three layers down.
 */

/* -------------------------------------------------------------------------- */
/*  Public — bundled into the browser. Assume the whole world can read these.  */
/* -------------------------------------------------------------------------- */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
})

/**
 * Next inlines `process.env.NEXT_PUBLIC_*` only when written as a static
 * member expression, so these cannot be read dynamically.
 */
const rawPublic = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
}

function parseOrDie<T extends z.ZodType>(schema: T, raw: unknown, scope: string): z.infer<T> {
  const result = schema.safeParse(raw)
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Configuración inválida (${scope}):\n${missing}\n\n` +
        `Copia .env.example a .env.local y llena los valores que faltan.`,
    )
  }
  return result.data
}

export const publicEnv = parseOrDie(publicSchema, rawPublic, 'público')

/* -------------------------------------------------------------------------- */
/*  Server — never reaches the browser.                                        */
/* -------------------------------------------------------------------------- */

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /** Bypasses every RLS policy. Server-only, and only inside agent jobs. */
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  /** HMAC key for client-portal invitation tokens. Required in production. */
  CLIENT_PORTAL_TOKEN_SECRET: z.string().min(32).optional(),

  AGENTS_PROVIDER: z.enum(['mock', 'anthropic']).default('mock'),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-').optional(),
  AGENTS_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(50),

  /** Facebook App ID. Necesario para refrescar tokens de Instagram y Meta Ads. */
  META_APP_ID: z.string().optional(),
  /** Facebook App Secret. No se commitea nunca. */
  META_APP_SECRET: z.string().optional(),
  /**
   * Token de largo plazo de Instagram (60 días). Se obtiene con
   * `refrescarTokenInstagram` durante el onboarding de cada cliente.
   * Opcional: sin él, las métricas de Instagram entran por manual/CSV.
   */
  INSTAGRAM_LONG_LIVED_TOKEN: z.string().optional(),
  /**
   * Token de acceso al ad account de Meta. Scope mínimo: `ads_read`.
   * Opcional: sin él, la pauta se sigue capturando a mano.
   */
  META_ADS_TOKEN: z.string().optional(),
  META_ADS_ACCOUNT_ID: z.string().optional(),
})

let cachedServerEnv: z.infer<typeof serverSchema> | null = null

/**
 * Lazily validated so that importing this module from a client component does
 * not blow up — only *calling* it does, and that only happens on the server.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() se llamó en el navegador. Eso filtraría secretos. ' +
        'Mueve esta lógica a un Server Component, Server Action o Route Handler.',
    )
  }

  if (cachedServerEnv) return cachedServerEnv

  const parsed = parseOrDie(serverSchema, process.env, 'servidor')

  // Production tripwires: things that are fine to omit locally and fatal in prod.
  if (parsed.NODE_ENV === 'production') {
    if (!parsed.CLIENT_PORTAL_TOKEN_SECRET) {
      throw new Error('CLIENT_PORTAL_TOKEN_SECRET es obligatorio en producción.')
    }
    if (parsed.AGENTS_PROVIDER === 'anthropic' && !parsed.ANTHROPIC_API_KEY) {
      throw new Error('AGENTS_PROVIDER=anthropic requiere ANTHROPIC_API_KEY.')
    }
  }

  cachedServerEnv = parsed
  return parsed
}

export const isProduction = process.env.NODE_ENV === 'production'
export const isTest = process.env.NODE_ENV === 'test'
