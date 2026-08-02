import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Importador } from '@/components/importar/importador'
import { Display, Mono } from '@/components/ui/primitives'
import { contextoDeImportacion } from '@/lib/datos/importar'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return { title: `Importar de Notion · ${slug}` }
}

/**
 * Traer el calendario de Notion, una sola vez.
 *
 * La pantalla vive fuera del dashboard del cliente a propósito: no es una
 * sección que se recorra cada mes, es una operación que se hace una vez y
 * después estorba. Que tenga su propia URL también hace que se pueda mandar por
 * chat sin explicar dónde está el botón.
 */
export default async function ImportarPage({ params }: Props) {
  const { slug } = await params
  const contexto = await contextoDeImportacion(slug)
  if (!contexto) notFound()

  return (
    <main className="flex flex-1 flex-col gap-8 px-6 py-8">
      <header className="border-line border-b pb-4">
        <Link href={`/cliente/${contexto.slug}`}>
          <Mono className="text-fg-muted hover:text-fg">← {contexto.nombre}</Mono>
        </Link>
        <Display as="h1" className="mt-3 text-3xl">
          Importar de Notion
        </Display>
        <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
          Se trae el calendario de contenido que {contexto.nombre} lleva en Notion.{' '}
          <strong className="text-fg font-normal">Es una mudanza, no una sincronización:</strong>{' '}
          después de esto Studio OS es la fuente de verdad y lo que se edite en Notion ya no llega
          aquí.
        </p>
      </header>

      <Importador contexto={contexto} />
    </main>
  )
}
