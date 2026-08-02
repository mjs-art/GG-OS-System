import { Mono } from '@/components/ui/primitives'
import { ATAJOS_BANDEJA } from '@/domain/bandeja'

/**
 * La barra de atajos, pegada abajo.
 *
 * Los atajos existen aunque nadie los vea, pero solo se usan si están escritos:
 * una interfaz de teclado sin leyenda es una interfaz de mouse con un secreto.
 * La lista sale de `ATAJOS_BANDEJA` para que nunca prometa una tecla que el
 * manejador ya no atiende.
 */
export function BarraAtajos({ nota }: { nota?: string }) {
  return (
    <div className="border-line bg-bg sticky bottom-0 z-20 mt-auto border-t">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-6 py-2.5">
        {ATAJOS_BANDEJA.map(({ teclas, que }) => (
          <span key={teclas} className="inline-flex items-center gap-1.5">
            <Mono className="border-line text-fg rounded-xs border px-1.5 py-0.5">{teclas}</Mono>
            <Mono className="text-fg-muted">{que}</Mono>
          </span>
        ))}
        {nota && <Mono className="text-fg-muted ml-auto">{nota}</Mono>}
      </div>
    </div>
  )
}
