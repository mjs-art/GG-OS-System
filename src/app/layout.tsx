import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono, Inter_Tight } from 'next/font/google'
import { HydrationMarker } from '@/components/hydration-marker'
import { Avisos } from '@/components/ui/avisos'
import { colorSchemeDe, themeColorDe } from '@/domain/tema'
import { leerTema } from '@/lib/tema'
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

/**
 * El viewport depende del tema, así que se genera por petición en vez de ser
 * una constante.
 *
 * `colorScheme` no es cosmético: es lo que le dice al navegador de qué color
 * pintar los controles nativos, las barras de scroll y el autocompletado. Con
 * el valor equivocado, un input en tema claro sale con fondo oscuro del
 * sistema y se ve roto sin que ninguna regla nuestra falle.
 */
export async function generateViewport(): Promise<Viewport> {
  const tema = await leerTema()
  return {
    themeColor: themeColorDe(tema),
    colorScheme: colorSchemeDe(tema),
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const tema = await leerTema()

  return (
    <html
      lang="es-MX"
      // El tema se resuelve en el servidor: el HTML sale ya con el atributo
      // puesto y nunca hay un pintado con el tema equivocado.
      data-tema={tema}
      className={`${archivo.variable} ${interTight.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-fg flex min-h-full flex-col">
        {children}
        <HydrationMarker />
        <Avisos />
      </body>
    </html>
  )
}
