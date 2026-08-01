/**
 * Contrato de entorno a nivel de tipos.
 *
 * Esto NO valida nada en runtime — de eso se encarga `src/lib/env.ts` con Zod.
 * Lo que hace es dos cosas:
 *   1. Permitir `process.env.FOO` con `noPropertyAccessFromIndexSignature`
 *      activo. Next solo inyecta las NEXT_PUBLIC_* con acceso por punto, así
 *      que la notación de corchetes no es opción.
 *   2. Que el autocompletado y el typechecker atrapen un nombre mal escrito.
 *
 * Toda variable nueva se declara aquí, en .env.example y en src/lib/env.ts.
 * Las tres. Si falta una, es un bug.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'test' | 'production'

    // Público — llega al navegador.
    readonly NEXT_PUBLIC_SUPABASE_URL: string
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string
    readonly NEXT_PUBLIC_SITE_URL?: string

    // Servidor — nunca sale del servidor.
    readonly SUPABASE_SERVICE_ROLE_KEY?: string
    readonly CLIENT_PORTAL_TOKEN_SECRET?: string
    readonly AGENTS_PROVIDER?: 'mock' | 'anthropic'
    readonly ANTHROPIC_API_KEY?: string
    readonly AGENTS_MONTHLY_BUDGET_USD?: string

    // Infraestructura de pruebas y CI.
    readonly CI?: string
    readonly PORT?: string
    readonly E2E_BASE_URL?: string

    // Las pone Vercel sola en el build. Solo se leen en next.config.ts.
    readonly VERCEL_ENV?: 'production' | 'preview' | 'development'
    readonly VERCEL_PROJECT_PRODUCTION_URL?: string
  }
}
