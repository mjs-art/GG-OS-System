import type { Metadata } from 'next'
import { Display, Mono } from '@/components/ui/primitives'
import { FormularioEntrar } from './formulario'

export const metadata: Metadata = {
  title: 'Entrar',
}

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>
}) {
  const { destino } = await searchParams

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <Display as="h1" className="text-4xl">
          Studio OS
        </Display>
        <Mono className="text-muted">Acceso por correo</Mono>
      </header>

      <FormularioEntrar destino={destino} />

      <p className="text-muted text-[13px]">
        No hay contraseña. Escribe tu correo y te llega un link para entrar.
      </p>
    </main>
  )
}
