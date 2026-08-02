import type { Metadata } from 'next'
import { Bandeja } from '@/components/bandeja/bandeja'
import { cargarBandeja } from '@/lib/datos/bandeja'
import { systemClock } from '@/lib/time'

export const metadata: Metadata = { title: 'Bandeja' }

/**
 * La Bandeja: la cola de todo lo que necesita criterio humano, de todos los
 * clientes.
 *
 * `flex-1 flex-col` no es decorativo: la barra de atajos es sticky al fondo
 * con `mt-auto`, y sin un contenedor que ocupe el alto disponible se pega al
 * final del contenido en vez de al de la pantalla.
 */
export default async function BandejaPage() {
  const ahora = systemClock.now()
  const { escalamientos, piezasAvanzadasHoy } = await cargarBandeja(ahora)

  return (
    <main className="flex flex-1 flex-col">
      <Bandeja
        escalamientos={escalamientos}
        piezasAvanzadasHoy={piezasAvanzadasHoy}
        ahora={ahora.toISOString()}
      />
    </main>
  )
}
