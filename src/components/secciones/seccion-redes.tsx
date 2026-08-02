import { Display, EmptyState, Mono } from '@/components/ui/primitives'
import { PLATFORM_LABEL } from '@/domain/labels'
import {
  CHECKLIST_PERFIL,
  diasSinPublicar,
  DIAS_SIN_PUBLICAR_AMBAR,
  etiquetaSemaforo,
  evaluarRed,
  leerChecklist,
  peorEstado,
  type Semaforo,
} from '@/domain/redes'
import type { CuentaDeRed } from '@/lib/datos/secciones'
import { relativeDays } from '@/lib/time'
import { PanelRedes, type TarjetaRed } from './panel-redes'

/**
 * § Redes — el estado de las cuentas del cliente.
 *
 * El semáforo se calcula aquí, en el servidor, con `@/domain/redes`. La
 * tarjeta solo lo pinta. Esa separación es la que permite que la lista de
 * clientes, el header y esta sección muestren el mismo color sin ponerse de
 * acuerdo: hay una sola función que decide.
 *
 * `ahora` entra por props y no se lee adentro: sin eso el render deja de ser
 * determinista y "hace 3 días" cambiaría entre el servidor y la hidratación.
 */
export function SeccionRedes({
  clientId,
  slug,
  cuentas,
  ahora,
}: {
  clientId: string
  slug: string
  cuentas: CuentaDeRed[]
  ahora: Date
}) {
  const tarjetas: TarjetaRed[] = cuentas.map((c) => {
    const dias = diasSinPublicar(c.lastPostAt, ahora)
    const checklist = leerChecklist(c.profileChecklist)

    const veredicto = evaluarRed({
      diasSinPublicar: dias,
      publicacionesPorSemana: c.postsPerWeek,
      objetivoPorSemana: c.targetPerWeek,
      checklist,
    })

    return {
      id: c.id,
      plataforma: PLATFORM_LABEL[c.platform],
      handle: c.handle,
      url: c.url,
      seguidores: c.followers,
      delta: c.followersDelta,
      textoUltima: c.lastPostAt
        ? relativeDays(ahora, new Date(c.lastPostAt))
        : 'sin fecha capturada',
      // El mismo umbral que manda el semáforo a ámbar, para que el texto y el
      // punto nunca digan cosas distintas.
      ultimaEnAlerta: dias === null || dias > DIAS_SIN_PUBLICAR_AMBAR,
      porSemana: c.postsPerWeek,
      objetivo: c.targetPerWeek,
      checklist: CHECKLIST_PERFIL.map(({ clave, label }) => ({
        clave,
        label,
        cumple: checklist[clave],
      })),
      dms: c.unansweredDms,
      comentarios: c.unansweredComments,
      estado: veredicto.estado,
      etiquetaEstado: etiquetaSemaforo(veredicto),
      razones: veredicto.razones,
      textoRevision: c.checkedAt ? `Revisada ${relativeDays(ahora, new Date(c.checkedAt))}` : null,
    }
  })

  const peor = tarjetas.reduce<Semaforo>((acc, t) => peorEstado(acc, t.estado), 'ok')
  const enRojo = tarjetas.filter((t) => t.estado === 'bad').length

  return (
    <>
      <header className="border-line mb-6 flex flex-wrap items-end justify-between gap-4 border-b pb-3">
        <div>
          <Display as="h2" className="text-xl">
            Redes
          </Display>
          <p className="text-fg-muted mt-1 text-[13px]">
            {tarjetas.length === 0
              ? 'Ninguna red conectada todavía.'
              : peor === 'ok'
                ? 'Las cuentas van al día en cadencia y perfil.'
                : enRojo > 0
                  ? `${enRojo} de ${tarjetas.length} ${enRojo === 1 ? 'cuenta necesita' : 'cuentas necesitan'} atención hoy.`
                  : 'Hay detalles por cerrar antes de que se vuelvan un problema.'}
          </p>
        </div>
        <Mono className="text-fg-muted">
          {tarjetas.length} {tarjetas.length === 1 ? 'red' : 'redes'}
        </Mono>
      </header>

      {tarjetas.length === 0 ? (
        <EmptyState
          title="Sin redes conectadas"
          body="Agrega las cuentas del cliente en Ajustes para que el Auditor pueda revisarlas y el semáforo tenga qué mostrar. Basta con la plataforma, el handle y el objetivo de publicaciones por semana."
        />
      ) : (
        <PanelRedes clientId={clientId} slug={slug} tarjetas={tarjetas} />
      )}
    </>
  )
}
