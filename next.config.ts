import type { NextConfig } from 'next'

/**
 * Security headers.
 *
 * The CSP is deliberately strict. `unsafe-inline` for styles is required by
 * Next's inlined critical CSS; scripts use a nonce injected by middleware, so
 * they do NOT need `unsafe-inline` in production.
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * La URL pública del sitio.
 *
 * Si no se configura, `env.ts` caería a localhost — y en producción eso no
 * truena, solo manda magic links que apuntan a la máquina de quien los abre.
 * Un login roto que se ve sano es peor que un build que falla.
 *
 * En Vercel se deriva sola del dominio de producción. Se usa el de producción
 * y no `VERCEL_URL` incluso en los previews, porque la URL de callback tiene
 * que estar en la lista blanca de Supabase y la de un preview efímero nunca
 * lo va a estar.
 */
const urlDeVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || urlDeVercel || 'http://localhost:3000'

/**
 * Solo se inyecta cuando la derivamos nosotros.
 *
 * OJO, esto ya mordió una vez: `next.config.ts` se evalúa ANTES de que Next
 * cargue los archivos `.env`, así que aquí `process.env.NEXT_PUBLIC_SITE_URL`
 * viene vacía aunque esté en `.env.local`. Si inyectáramos siempre, el valor
 * del archivo quedaría pisado por el fallback a localhost.
 *
 * El síntoma fue de los peores: el magic link redirigía a `localhost` mientras
 * el navegador estaba en `127.0.0.1`. Son orígenes distintos para las cookies,
 * así que la sesión se escribía en uno y se leía en el otro, y el login
 * "fallaba" sin un solo error en consola.
 */
const envInyectado =
  !process.env.NEXT_PUBLIC_SITE_URL && urlDeVercel ? { NEXT_PUBLIC_SITE_URL: urlDeVercel } : {}

/**
 * ¿Nos sirven sobre TLS de verdad?
 *
 * Importa por `upgrade-insecure-requests`. Esa directiva reescribe TODA
 * petición http:// a https://, y Chromium exenta localhost pero WebKit no:
 * sobre http plano, Safari intenta TLS contra el servidor, falla, y la página
 * se queda sin CSS y sin JavaScript. No es teórico — así se descubrió, con las
 * pruebas de WebKit.
 *
 * La directiva protege contra contenido mixto en un despliegue con HTTPS real.
 * En local sobre http es puro daño. Se decide por la URL configurada y no por
 * NODE_ENV, porque `next start` corre en producción y aun así puede estar
 * sirviendo en http (las pruebas de extremo a extremo, un preview sin TLS).
 */
const servedOverTls = siteUrl.startsWith('https://')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next needs eval in dev for fast refresh; never in production.
      isDev
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://images.unsplash.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co" +
        (isDev ? ' http://127.0.0.1:54321 ws://127.0.0.1:54321' : ''),
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      ...(servedOverTls ? ['upgrade-insecure-requests'] : []),
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // pnpm-workspace.yaml hace que Turbopack dude de cuál es la raíz. Se la
  // decimos y de paso evitamos que suba de directorio buscando otra.
  turbopack: { root: import.meta.dirname },

  env: envInyectado,

  // A type error must never reach production. Lint runs as its own CI gate
  // (Next 16 no longer runs ESLint during `next build`).
  typescript: { ignoreBuildErrors: false },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
