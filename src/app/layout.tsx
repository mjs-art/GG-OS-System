import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Instrument_Serif } from 'next/font/google'
import { HydrationMarker } from '@/components/hydration-marker'
import { Avisos } from '@/components/ui/avisos'
import { colorSchemeDe, themeColorDe } from '@/domain/tema'
import { leerTema } from '@/lib/tema'
import './globals.css'

/**
 * Instrument Serif está en lugar de Meno Banner, que es la que entregó Ana.
 *
 * Meno Banner es de Richard Lipton y se sirve desde Adobe Fonts, que hoy no
 * pagamos. De ocho candidatas libres comparadas contra el specimen —igualando
 * la altura de x, porque dos fuentes al mismo font-size no tienen el mismo
 * tamaño óptico— esta es la única que acierta las tres cosas que definen al
 * corte Banner: alto contraste, x-height grande con ascendentes cortas, y
 * proporciones condensadas. Su itálica es de display, firme y no caligráfica,
 * igual que la de Meno.
 *
 * El día que haya Creative Cloud, esto se cambia por un Web Project de Adobe
 * Fonts y nada más: ningún componente nombra la familia, todos usan
 * .type-display.
 *
 * Ojo: solo tiene un peso (400) más itálica. No pidas 300 ni 700 — el
 * navegador los sintetiza y se ve mal en una serif de alto contraste.
 */
const instrumentSerif = Instrument_Serif({
  variable: '--font-instrument-serif',
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
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
      className={`${instrumentSerif.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="bg-bg text-fg flex min-h-full flex-col">
        {children}
        <HydrationMarker />
        <Avisos />
      </body>
    </html>
  )
}
