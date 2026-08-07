import type { Metadata } from 'next'
import { BandejaSalientes } from '@/components/whatsapp/bandeja-salientes'
import { cargarRetroAbierta, cargarSalientesWhatsApp } from '@/lib/datos/whatsapp'
import { systemClock } from '@/lib/time'

export const metadata: Metadata = { title: 'WhatsApp' }

/**
 * La bandeja de salientes de WhatsApp: los borradores de respuesta que esperan
 * la aprobación de una persona antes de salir (regla #1). Los redacta el agente
 * de Cuenta al llegar un mensaje del cliente, o se escriben a mano. Debajo, la
 * retro del cliente que falta resolver.
 */
export default async function WhatsAppPage() {
  const [hilos, retros] = await Promise.all([cargarSalientesWhatsApp(), cargarRetroAbierta()])

  return (
    <main className="flex flex-1 flex-col">
      <BandejaSalientes hilos={hilos} ahora={systemClock.now().toISOString()} retros={retros} />
    </main>
  )
}
