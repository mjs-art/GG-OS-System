'use client'

import { useActionState, useState } from 'react'
import { capturarMetricas, importarCsv } from '@/components/pauta/acciones'
import { Campo, Entrada, Selector } from '@/components/pauta/campos'
import { ACCION_INICIAL, type EstadoAccion } from '@/components/pauta/estado-accion'
import { Button, EmptyState, Mono } from '@/components/ui/primitives'
import { FUENTE_CSV_LABEL, type AdSetCapturable } from '@/domain/pauta'
import { cn } from '@/lib/cn'

/**
 * Solo lo que el selector necesita.
 *
 * Recibir `CampanaPauta[]` completo serializaría los siete días de métricas de
 * cada ad set dentro del payload de cliente para pintar un `<option>`.
 */
export interface CampanaSeleccionable {
  id: string
  nombre: string
}

/**
 * § Captura de métricas.
 *
 * No hay conexión automática a Meta Ads ni a TikTok Ads, y en esta etapa no la
 * va a haber: son semanas de trámite por cliente, y el agente no distingue de
 * dónde vino el número. Así que las dos puertas son un CSV y un formulario, y
 * la nota de abajo lo dice en voz alta para que nadie se quede esperando a que
 * los datos aparezcan solos.
 */
export function CapturaMetricas({
  campanas,
  adSets,
  slug,
  hoy,
}: {
  campanas: CampanaSeleccionable[]
  adSets: AdSetCapturable[]
  slug: string
  hoy: string
}) {
  const [modo, setModo] = useState<'csv' | 'mano'>('csv')

  if (campanas.length === 0 || adSets.length === 0) {
    return (
      <EmptyState
        title="No hay dónde poner las métricas todavía"
        body="Primero crea la campaña y sus ad sets. En cuanto existan, aquí se importa el CSV del ads manager o se capturan los números a mano."
      />
    )
  }

  return (
    <div className="border-line bg-surface rounded-xs border">
      <div className="border-line flex border-b" role="tablist" aria-label="Cómo capturar">
        <Pestana activa={modo === 'csv'} onClick={() => setModo('csv')}>
          Importar CSV
        </Pestana>
        <Pestana activa={modo === 'mano'} onClick={() => setModo('mano')}>
          Capturar a mano
        </Pestana>
      </div>

      <div className="p-5">
        {modo === 'csv' ? (
          <FormularioCsv campanas={campanas} slug={slug} />
        ) : (
          <FormularioManual adSets={adSets} slug={slug} hoy={hoy} />
        )}
      </div>

      <div className="border-line border-t px-5 py-3">
        <Mono className="text-fg-muted">
          Las métricas entran por CSV o a mano. No hay conexión automática por ahora.
        </Mono>
      </div>
    </div>
  )
}

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activa}
      onClick={onClick}
      className={cn(
        'type-mono border-b-2 px-5 py-3 transition-colors duration-150 ease-out',
        activa ? 'border-accent text-fg' : 'text-fg-muted hover:text-fg border-transparent',
      )}
    >
      {children}
    </button>
  )
}

function FormularioCsv({ campanas, slug }: { campanas: CampanaSeleccionable[]; slug: string }) {
  const [estado, importar, importando] = useActionState<EstadoAccion, FormData>(
    importarCsv,
    ACCION_INICIAL,
  )

  return (
    <form action={importar} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo label="Campaña">
          <Selector name="campanaId" required defaultValue={campanas[0]?.id}>
            {campanas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo label="Fuente">
          <Selector name="fuente" defaultValue="meta">
            {(Object.keys(FUENTE_CSV_LABEL) as Array<keyof typeof FUENTE_CSV_LABEL>).map((f) => (
              <option key={f} value={f}>
                {FUENTE_CSV_LABEL[f]}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo
          label="Archivo"
          hint="Exporta el reporte desglosado por día y por conjunto de anuncios."
        >
          <Entrada type="file" name="archivo" accept=".csv,text/csv" required />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={importando}>
          {importando ? 'Leyendo el archivo…' : 'Importar CSV'}
        </Button>
        <Mono className="text-fg-muted">
          Reimportar el mismo día corrige el número; no lo suma dos veces.
        </Mono>
      </div>

      <Resultado estado={estado} />
    </form>
  )
}

function FormularioManual({
  adSets,
  slug,
  hoy,
}: {
  adSets: AdSetCapturable[]
  slug: string
  hoy: string
}) {
  const [estado, capturar, capturando] = useActionState<EstadoAccion, FormData>(
    capturarMetricas,
    ACCION_INICIAL,
  )

  return (
    <form action={capturar} className="flex flex-col gap-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Ad set">
          <Selector name="adSetId" required defaultValue={adSets[0]?.id}>
            {adSets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.campanaNombre} · {a.nombre}
              </option>
            ))}
          </Selector>
        </Campo>

        <Campo label="Día">
          <Entrada type="date" name="fecha" required defaultValue={hoy} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Campo label="Gasto" hint="En pesos. 70 o 70.50.">
          <Entrada name="gasto" inputMode="decimal" required placeholder="0" />
        </Campo>
        <Campo label="Impresiones">
          <Entrada name="impresiones" type="number" min={0} step={1} defaultValue={0} />
        </Campo>
        <Campo label="Alcance">
          <Entrada name="alcance" type="number" min={0} step={1} defaultValue={0} />
        </Campo>
        <Campo label="Clics">
          <Entrada name="clics" type="number" min={0} step={1} defaultValue={0} />
        </Campo>
        <Campo label="Resultados">
          <Entrada name="resultados" type="number" min={0} step={1} defaultValue={0} />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={capturando}>
          {capturando ? 'Guardando…' : 'Guardar el día'}
        </Button>
        <Mono className="text-fg-muted">
          CTR, CPM, CPC y costo por resultado se calculan solos.
        </Mono>
      </div>

      <Resultado estado={estado} />
    </form>
  )
}

function Resultado({ estado }: { estado: EstadoAccion }) {
  if (estado.estado === 'inicial') return null

  return (
    <div className="flex flex-col gap-1.5">
      <Mono className={estado.estado === 'error' ? 'text-accent-hot' : 'text-ok'}>
        {estado.mensaje}
      </Mono>
      {estado.detalles.length > 0 && (
        <ul className="flex flex-col gap-1">
          {estado.detalles.map((d) => (
            <li key={d} className="text-fg-muted text-[12px]">
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
