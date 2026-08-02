'use client'

import { Card, Chip, Display, Mono, Stat } from '@/components/ui/primitives'
import type { PlanDeImportacion } from '@/domain/importar-notion'
import { PIECE_FORMAT_LABEL, PIECE_STATUS_LABEL, STORY_KIND_LABEL } from '@/domain/labels'
import type { SprintPlanner } from '@/lib/datos/planner'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * Qué va a pasar, ANTES de que se escriba nada.
 *
 * El orden de la pantalla es el orden en que se pierde la confianza: primero lo
 * que no se puede importar, luego lo que se deja fuera a propósito, luego lo
 * que sí entra. Si algo está mal, se ve sin bajar.
 */
export function VistaPrevia({
  plan,
  sprintsExistentes,
  piezasPorMes,
}: {
  plan: PlanDeImportacion
  sprintsExistentes: readonly SprintPlanner[]
  piezasPorMes: Readonly<Record<string, number>>
}) {
  const yaExiste = new Set(sprintsExistentes.map((s) => s.name))
  const mesesPoblados = plan.meses.filter((mes) => (piezasPorMes[mes] ?? 0) > 0)
  const renglon = plan.origen === 'csv' ? 'línea' : 'registro'

  return (
    <div className="flex flex-col gap-8">
      {/* --- Lo que NO se puede importar ---------------------------------- */}
      {plan.errores.length > 0 && (
        <Bloque
          titulo={
            plan.errores.length === 1
              ? 'Un renglón no se puede mapear'
              : `${plan.errores.length} renglones no se pueden mapear`
          }
          nota="Nada se escribe hasta que estos queden arreglados. Media importación se ve igual que una completa, y por eso es peor."
          color="var(--color-accent-hot)"
        >
          <ul className="flex flex-col gap-1.5">
            {plan.errores.slice(0, 30).map((error, i) => (
              <li key={`${error.linea}-${error.columna}-${i}`} className="flex gap-3">
                <Mono className="text-accent-hot w-28 shrink-0">
                  {error.linea === null ? 'archivo' : `${renglon} ${error.linea}`}
                </Mono>
                <span className="text-fg-muted text-[13px]">{error.mensaje}</span>
              </li>
            ))}
            {plan.errores.length > 30 && (
              <li>
                <Mono className="text-fg-muted">
                  y {plan.errores.length - 30} más. Arregla estos en Notion y vuelve a exportar.
                </Mono>
              </li>
            )}
          </ul>
        </Bloque>
      )}

      {/* --- Lo que se deja fuera a propósito ------------------------------ */}
      {plan.omitidas.length > 0 && (
        <Bloque
          titulo={`${plan.omitidas.length} ${plan.omitidas.length === 1 ? 'renglón se queda' : 'renglones se quedan'} en Notion`}
          nota="No es un error: son piezas rechazadas y no hay estado equivalente. Traerlas como idea las resucitaría dentro del calendario nuevo."
          color="var(--color-medium)"
        >
          <ul className="flex flex-col gap-1.5">
            {plan.omitidas.map((o) => (
              <li key={o.linea} className="flex gap-3">
                <Mono className="text-fg-muted w-28 shrink-0">
                  {renglon} {o.linea}
                </Mono>
                <span className="text-fg-muted text-[13px]">{o.tarea}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {/* --- Lo que sí entra ------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat value={plan.piezas.length} label="Piezas de feed" />
        <Stat value={plan.stories.length} label="Stories" />
        <Stat value={plan.sprints.length} label="Sprints" />
        <Stat value={plan.meses.length} label="Meses" />
      </div>

      {plan.meses.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plan.meses.map((mes) => (
            <Chip key={mes} tone={(piezasPorMes[mes] ?? 0) > 0 ? 'high' : 'neutral'}>
              {formatMonthKey(mes as MonthKey)}
              {(piezasPorMes[mes] ?? 0) > 0 && ` · ya hay ${piezasPorMes[mes]}`}
            </Chip>
          ))}
        </div>
      )}

      {mesesPoblados.length > 0 && (
        <Bloque
          titulo="Estos meses ya tienen piezas"
          nota="El importador AGREGA, no reemplaza. Si ya importaste este mes, se va a duplicar. Marca la casilla de abajo solo si sabes que es lo que quieres."
          color="var(--color-high)"
        />
      )}

      {/* --- Avisos --------------------------------------------------------- */}
      {plan.avisos.length > 0 && (
        <Bloque titulo="Se importa, pero conviene saberlo" color="var(--color-medium)">
          <ul className="flex flex-col gap-2">
            {plan.avisos.map((aviso) => (
              <li key={aviso.mensaje} className="text-[13px]">
                {aviso.mensaje}{' '}
                <Mono className="text-fg-muted">
                  {renglon} {aviso.renglones.slice(0, 12).join(', ')}
                  {aviso.renglones.length > 12 && ` y ${aviso.renglones.length - 12} más`}
                </Mono>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      {/* --- Sprints -------------------------------------------------------- */}
      {plan.sprints.length > 0 && (
        <section>
          <Display as="h3" className="text-base">
            Sprints
          </Display>
          <p className="text-fg-muted mt-1 max-w-prose text-[13px]">
            La relación de Notion solo trae el nombre: las fechas del sprint viven en la otra base.
            Se calculan con el rango que abarcan sus piezas y las puedes corregir después.
          </p>
          <ul className="border-line mt-4 flex flex-col border-t">
            {plan.sprints.map((sprint) => (
              <li
                key={sprint.nombre}
                className="border-line flex items-baseline justify-between gap-4 border-b py-2.5"
              >
                <span className="text-[13px]">{sprint.nombre}</span>
                <div className="flex items-center gap-3">
                  <Mono className="text-fg-muted">
                    {sprint.inicia} → {sprint.termina} · {sprint.piezas}{' '}
                    {sprint.piezas === 1 ? 'pieza' : 'piezas'}
                  </Mono>
                  <Chip tone={yaExiste.has(sprint.nombre) ? 'neutral' : 'accent'}>
                    {yaExiste.has(sprint.nombre) ? 'Ya existe' : 'Se crea'}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* --- La tabla de lo que entra --------------------------------------- */}
      {plan.piezas.length + plan.stories.length > 0 && (
        <section>
          <Display as="h3" className="text-base">
            Renglón por renglón
          </Display>
          <div className="border-line mt-4 overflow-x-auto border">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-line border-b">
                  {['', 'Tarea', 'Destino', 'Estado', 'Canales', 'Publica', 'Entrega', 'Quién'].map(
                    (columna) => (
                      <th key={columna} className="px-3 py-2">
                        <Mono className="text-fg-muted">{columna}</Mono>
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {plan.piezas.map((pieza) => (
                  <tr key={`p-${pieza.linea}`} className="border-line border-b last:border-b-0">
                    <Celda mono>{pieza.linea}</Celda>
                    <Celda>{pieza.tarea}</Celda>
                    <Celda mono>{PIECE_FORMAT_LABEL[pieza.formato]}</Celda>
                    <Celda mono>{PIECE_STATUS_LABEL[pieza.estado]}</Celda>
                    <Celda mono>{pieza.plataformas.join(' · ') || '—'}</Celda>
                    <Celda mono>{pieza.publishAt?.slice(0, 10) ?? '—'}</Celda>
                    <Celda mono>{pieza.dueDate ?? '—'}</Celda>
                    <Celda mono>{pieza.responsable ?? '—'}</Celda>
                  </tr>
                ))}
                {plan.stories.map((story) => (
                  <tr key={`s-${story.linea}`} className="border-line border-b last:border-b-0">
                    <Celda mono>{story.linea}</Celda>
                    <Celda>{story.tarea}</Celda>
                    <Celda mono>Story · {STORY_KIND_LABEL[story.tipo]}</Celda>
                    <Celda mono>{PIECE_STATUS_LABEL[story.estado]}</Celda>
                    <Celda mono>—</Celda>
                    <Celda mono>{story.fecha}</Celda>
                    <Celda mono>—</Celda>
                    <Celda mono>—</Celda>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {plan.columnasIgnoradas.length > 0 && (
        <Mono as="p" className="text-fg-muted">
          Columnas que no se importan: {plan.columnasIgnoradas.join(', ')}.
        </Mono>
      )}
    </div>
  )
}

function Celda({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className="px-3 py-2 align-top">
      {mono ? (
        <Mono className="text-fg-muted">{children}</Mono>
      ) : (
        <span className="text-[13px]">{children}</span>
      )}
    </td>
  )
}

function Bloque({
  titulo,
  nota,
  color,
  children,
}: {
  titulo: string
  nota?: string
  color: string
  children?: React.ReactNode
}) {
  return (
    <Card className="border-l-[3px]" style={{ borderLeftColor: color }}>
      <Display as="h3" className="text-base">
        {titulo}
      </Display>
      {nota && <p className="text-fg-muted mt-1 max-w-prose text-[13px]">{nota}</p>}
      {children && <div className="mt-4">{children}</div>}
    </Card>
  )
}
