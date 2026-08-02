import { Mono } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

/**
 * La regla de producto más importante del sistema, dicha en voz alta.
 *
 * No basta con que sea verdad por dentro. Quien aprueba una propuesta tiene que
 * saber, antes de dar el clic, que después le toca abrir el ads manager. Si la
 * interfaz deja lugar a la duda, alguien va a suponer que la app ya lo hizo y
 * el presupuesto se va a quedar exactamente donde estaba durante tres días.
 *
 * Se repite arriba de la sección y otra vez junto a los pasos: es el único
 * mensaje de esta pantalla que vale la pena decir dos veces.
 */
export function AvisoNoEjecutamos({
  variante = 'completo',
  className,
}: {
  variante?: 'completo' | 'breve'
  className?: string
}) {
  if (variante === 'breve') {
    return (
      <Mono className={cn('text-accent-hot block', className)}>
        La app no ejecutó nada. El cambio se hace en el ads manager.
      </Mono>
    )
  }

  return (
    <div
      className={cn(
        'border-line border-l-accent bg-surface rounded-xs border border-l-[3px] p-4',
        className,
      )}
    >
      <Mono className="text-accent-hot">El agente propone · tú apruebas · tú ejecutas</Mono>
      <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
        Esta app <strong className="text-fg font-medium">nunca</strong> mueve un presupuesto ni
        pausa un anuncio. El Pautero escribe propuestas; cuando apruebas una, lo único que pasa aquí
        es que se guarda tu decisión y aparecen los pasos exactos que tú aplicas en Meta o TikTok
        Ads. Después vuelves y la marcas como aplicada.
      </p>
      <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
        Es dinero del cliente, y un agente con permiso de escritura sobre cuentas publicitarias es
        un riesgo desproporcionado al beneficio de ahorrarse un clic.
      </p>
    </div>
  )
}
