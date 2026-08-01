import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { resolverTema, TEMA_COOKIE, TEMA_COOKIE_OPTIONS, temaOpuesto } from '@/domain/tema'
import { leerTema } from '@/lib/tema'
import { cn } from '@/lib/cn'

/**
 * Switch de tema claro / oscuro.
 *
 * Es un Server Component con un `<form>` y un Server Action: cero `'use
 * client'`, cero JavaScript enviado al navegador, y funciona con JS apagado.
 * El costo es una navegación completa por cambio de tema, que para algo que se
 * toca dos veces al año es el intercambio correcto.
 *
 * No lleva estado de "guardando": el cambio termina antes de que el ojo lo
 * note y un spinner de 80ms es peor que nada.
 */

async function cambiarTema(formData: FormData) {
  'use server'

  // El valor viene de un input del cliente, así que se resuelve en vez de
  // confiarse. Una cookie con basura adentro terminaría escrita en el
  // atributo del <html>.
  const destino = resolverTema(formData.get('tema'))

  const store = await cookies()
  store.set(TEMA_COOKIE, destino, TEMA_COOKIE_OPTIONS)

  // El tema se lee en el layout raíz, así que hay que invalidar el layout
  // entero y no solo la página: sin esto, la ruta actual se repinta con el
  // atributo viejo.
  revalidatePath('/', 'layout')
}

export async function SwitchTema({ className }: { className?: string }) {
  const actual = await leerTema()
  const destino = temaOpuesto(actual)
  const etiqueta = destino === 'claro' ? 'Claro' : 'Oscuro'

  return (
    <form action={cambiarTema} className={cn('contents', className)}>
      <input type="hidden" name="tema" value={destino} />
      <button
        type="submit"
        // El texto visible dice a dónde vas ("Claro"), que es lo que se
        // entiende de un vistazo. El nombre accesible dice la acción completa,
        // porque un lector de pantalla sin el contexto visual solo oiría un
        // adjetivo suelto.
        aria-label={`Cambiar a tema ${etiqueta.toLowerCase()}`}
        className={cn(
          'type-mono border-line text-fg hover:bg-surface-2 inline-flex items-center gap-2',
          'rounded-xs border px-3 py-2 transition-colors duration-150 ease-out',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full border',
            destino === 'claro' ? 'border-line bg-fg' : 'border-line bg-transparent',
          )}
        />
        {etiqueta}
      </button>
    </form>
  )
}
