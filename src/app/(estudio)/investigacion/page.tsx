import type { Metadata } from 'next'
import { FormularioInvestigacion } from '@/components/investigacion/formulario-investigacion'
import { Card, Chip, Display, EmptyState, Mono } from '@/components/ui/primitives'
import type { AccionSugerida } from '@/lib/datos/investigacion'
import { listarClientesParaInvestigar, listarInvestigaciones } from '@/lib/datos/investigacion'

export const metadata: Metadata = { title: 'Investigación' }

const ACCION_LABEL: Record<AccionSugerida['tipo'], string> = {
  profundizar: 'Profundizar',
  guion_propio: 'Guion propio',
  post: 'Post',
  newsletter: 'Newsletter',
  otro: 'Otro',
}

/**
 * Pegas un link de YouTube, el agente Investigador baja la transcripción y
 * devuelve un resumen, puntos clave y acciones sugeridas — 100% interno, no
 * se expone en `/aprobar` (regla #3).
 */
export default async function InvestigacionPage() {
  const [investigaciones, clientes] = await Promise.all([
    listarInvestigaciones(),
    listarClientesParaInvestigar(),
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Display as="h1" className="text-5xl">
          Investigación
        </Display>
        <Mono className="text-fg-muted">
          Pega un link de YouTube. El agente baja la transcripción y propone qué hacer con ella.
        </Mono>
      </header>

      <FormularioInvestigacion clientes={clientes} />

      {investigaciones.length === 0 ? (
        <EmptyState
          title="Todavía no hay investigaciones"
          body="Pega tu primer link arriba. El resumen y las acciones sugeridas aparecen aquí."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {investigaciones.map((investigacion) => (
            <li key={investigacion.id}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Display as="h2" className="text-lg">
                    {investigacion.videoTitle ?? investigacion.youtubeUrl}
                  </Display>
                  <Chip tone={investigacion.cliente ? 'accent' : 'neutral'}>
                    {investigacion.cliente?.nombre ?? 'Investigación general'}
                  </Chip>
                </div>

                <a
                  href={investigacion.youtubeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="type-mono text-fg-muted hover:text-fg truncate text-[12px]"
                >
                  {investigacion.youtubeUrl}
                </a>

                <p className="text-fg text-[13px]">{investigacion.summary}</p>

                {investigacion.keyPoints.length > 0 && (
                  <ul className="text-fg-muted flex flex-col gap-1 text-[13px]">
                    {investigacion.keyPoints.map((punto) => (
                      <li key={punto}>· {punto}</li>
                    ))}
                  </ul>
                )}

                {investigacion.suggestedActions.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Mono className="text-fg-muted">Acciones sugeridas</Mono>
                    <ul className="flex flex-col gap-2">
                      {investigacion.suggestedActions.map((accion) => (
                        <li
                          key={`${accion.tipo}-${accion.titulo}`}
                          className="border-line rounded-xs border p-3"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <Chip tone="agent">{ACCION_LABEL[accion.tipo]}</Chip>
                            <span className="text-fg text-[13px]">{accion.titulo}</span>
                          </div>
                          <p className="text-fg-muted text-[13px]">{accion.detalle}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
