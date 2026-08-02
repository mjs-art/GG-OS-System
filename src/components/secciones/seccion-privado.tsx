import { Display, Mono } from '@/components/ui/primitives'
import type { NotaPrivada } from '@/lib/datos/secciones'
import { formatDate, relativeDays } from '@/lib/time'
import { BlocNotas, type NotaEnPantalla } from './bloc-notas'

/**
 * § Privado — el bloc de notas que no sale de aquí.
 *
 * La privacidad **no** la implementa este archivo. La política
 * `private_notes: solo quien las escribió` filtra por `author_id = auth.uid()`
 * en la base, incluso contra un `select` sin `where` y incluso para el resto
 * del estudio. Repetir ese filtro en TypeScript no agregaría seguridad: sí
 * agregaría la ilusión de que la línea importa, y el día que alguien la borre
 * en un refactor nadie va a saber que no pasaba nada.
 *
 * Lo que sí toca aquí es el mensaje humano: quién ve esto y quién no.
 */
export function SeccionPrivado({
  clientId,
  orgId,
  slug,
  notas,
  ahora,
}: {
  clientId: string
  orgId: string
  slug: string
  notas: NotaPrivada[]
  ahora: Date
}) {
  const enPantalla: NotaEnPantalla[] = notas.map((n) => ({
    id: n.id,
    body: n.body,
    textoActualizada: `Editada ${relativeDays(ahora, new Date(n.updatedAt))} · ${formatDate(
      new Date(n.updatedAt),
    )}`,
  }))

  return (
    <div className="relative isolate overflow-hidden">
      {/* Marca de agua. `aria-hidden` y detrás de todo: es una señal visual,
          no información, y un lector de pantalla que la lea solo estorba. */}
      <span
        aria-hidden
        className="type-display text-fg pointer-events-none absolute -top-4 right-0 -z-10 text-[7rem] leading-none opacity-[0.04] select-none sm:text-[10rem]"
      >
        solo tú
      </span>

      <header className="border-line mb-6 border-b pb-3">
        <Display as="h2" className="text-xl">
          Privado
        </Display>
        <Mono className="text-fg-muted mt-2 block">
          Esta sección no aparece en el modo cliente.
        </Mono>
        <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
          Tampoco la ve el resto del estudio: la base solo entrega las notas a quien las escribió.
          No es una preferencia que se pueda cambiar desde la app.
        </p>
      </header>

      <BlocNotas clientId={clientId} orgId={orgId} slug={slug} notas={enPantalla} />
    </div>
  )
}
