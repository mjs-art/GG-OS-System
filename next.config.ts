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

/**
 * El stack local de Supabase, para `connect-src` e `img-src`.
 *
 * Va atado a `servedOverTls` y NO a `isDev`, y eso ya mordió: `next start`
 * corre en producción, así que con `isDev` el permiso desaparecía justo en las
 * pruebas de extremo a extremo. El síntoma fue de los buenos — subir la imagen
 * de una pieza se quedaba pegada en la vista previa local, sin error visible,
 * porque el navegador bloqueaba el PUT al bucket y la app solo veía "falló la
 * red". Si nos sirven por http, el Supabase de al lado también es local.
 *
 * En un despliegue de verdad esto no aparece y Supabase entra por
 * `https://*.supabase.co`.
 */
const supabaseLocal = servedOverTls ? '' : ' http://127.0.0.1:54321'

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
      /*
       * Las imágenes de las piezas vienen de dos lados y ninguno se puede
       * enumerar de antemano:
       *
       *   · las subidas se sirven con URL FIRMADA desde Supabase Storage —
       *     `https://*.supabase.co` en producción, pero `http://127.0.0.1:54321`
       *     en local, que es lo que rompía el grid en desarrollo;
       *   · los enlaces son de Canva, Drive, Dropbox o de donde el diseñador
       *     los tenga. No hay lista blanca posible.
       *
       * `blob:` es la vista previa local mientras un archivo se sube.
       *
       * El costo de abrir `https:` está medido: un `img-src` amplio es un canal
       * de exfiltración SI hubiera XSS. Aquí `script-src` sigue cerrado, no hay
       * `dangerouslySetInnerHTML` (ESLint lo prohíbe) y el copy de los agentes
       * entra como texto. La alternativa era no mostrar los enlaces externos, y
       * eso es la mitad de la función.
       */
      `img-src 'self' data: blob: https:${supabaseLocal}`,
      // El PUT del archivo al bucket sale del NAVEGADOR (ver `campo-asset.tsx`),
      // así que Storage tiene que estar aquí y no solo del lado del servidor.
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co${supabaseLocal}` +
        (servedOverTls ? '' : ' ws://127.0.0.1:54321'),
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

  // `next dev` escucha en localhost pero las pruebas y el resto del proyecto
  // hablan por 127.0.0.1. Sin esto Next bloquea el HMR por cross-origin, la
  // app nunca termina de hidratar, y cualquier prueba que espere interacción
  // se cuelga sin decir por qué.
  allowedDevOrigins: ['127.0.0.1'],

  env: envInyectado,

  // A type error must never reach production. Lint runs as its own CI gate
  // (Next 16 no longer runs ESLint during `next build`).
  typescript: { ignoreBuildErrors: false },

  /*
   * Las imágenes de las piezas van con `unoptimized` (ver `tile-pieza.tsx`):
   * una URL firmada trae firma nueva en cada render, así que el optimizador
   * nunca acertaría su caché, y un enlace externo vive en un dominio que no
   * conocemos. `remotePatterns` se queda para lo que sí pase por el
   * optimizador algún día.
   */
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
