import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, Inter_Tight } from 'next/font/google'
import './globals.css'

/**
 * "Archivo Expanded" es el eje `wdth` de la variable Archivo, no una familia
 * aparte. Se ensancha con font-stretch dentro de la clase .type-display.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  // Sin `weight` para que cargue la variable completa: es la única forma de
  // tener también el eje wdth, que es lo que da el "Expanded".
  axes: ['wdth'],
  display: 'swap',
})

const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Studio OS',
    template: '%s · Studio OS',
  },
  description: 'Sistema operativo del estudio: estrategia, contenido, pauta y resultados.',
  // Herramienta interna con datos de clientes: no se indexa.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#121110',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es-MX"
      className={`${archivo.variable} ${interTight.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="bg-ink text-bone flex min-h-full flex-col">{children}</body>
    </html>
  )
}
