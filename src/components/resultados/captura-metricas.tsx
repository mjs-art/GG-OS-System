'use client'

import { Pencil, Upload } from 'lucide-react'
import { useActionState, useState } from 'react'
import {
  capturarResultados,
  importarCsv,
  type EstadoResultados,
} from '@/components/resultados/acciones'
import { Button, Card, Display, Mono } from '@/components/ui/primitives'
import type { MetricasMes } from '@/lib/datos/resultados'
import { formatMonthKey, type MonthKey } from '@/lib/time'

const INICIAL: EstadoResultados = { status: 'inicial' }

interface Props {
  clientId: string
  mes: MonthKey
  actual: MetricasMes | null
  abiertoPorDefault: boolean
}

/**
 * Las dos formas de que entren los números: un CSV o a mano.
 *
 * Cuando no hay datos, aparece abierto y reemplaza al empty state. Cuando ya hay
 * métricas capturadas, empieza colapsado en una barra delgada — quien quiera
 * corregir un número no scrollea hasta encontrarlo; lo abre desde el toggle de
 * arriba.
 */
export function CapturaDeMetricas({ clientId, mes, actual, abiertoPorDefault }: Props) {
  const [abierto, setAbierto] = useState(abiertoPorDefault)
  const [vista, setVista] = useState<'csv' | 'mano'>(abiertoPorDefault ? 'csv' : 'csv')

  if (!abierto) {
    return (
      <div className="border-line bg-bg mt-6 flex items-center gap-3 rounded-xs border px-4 py-2.5">
        <Mono className="text-fg-muted flex-1 text-[12px]">
          {actual
            ? `Métricas de ${formatMonthKey(mes)} capturadas.`
            : `${formatMonthKey(mes)} sin métricas.`}
        </Mono>
        <Button variant="secondary" type="button" onClick={() => setAbierto(true)}>
          {actual ? 'Actualizar métricas' : `Capturar ${formatMonthKey(mes)}`}
        </Button>
      </div>
    )
  }

  return (
    <Card className="mt-6" data-print="hide">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Display as="h3" className="text-base">
            {actual
              ? `Actualizar métricas de ${formatMonthKey(mes)}`
              : `Capturar resultados de ${formatMonthKey(mes)}`}
          </Display>
          <Mono as="p" className="text-fg-muted mt-2">
            {actual
              ? 'Corrige o reemplaza los números. Si algo cambió en el CSV, lo que llegue nuevo pisa lo de antes.'
              : 'Arrastra el CSV de Meta Business Suite, Metricool o TikTok, o teclea los ocho números. Sin conexión automática por ahora.'}
          </Mono>
        </div>
        {actual && (
          <Button variant="ghost" type="button" onClick={() => setAbierto(false)}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant={vista === 'csv' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setVista('csv')}
        >
          <Upload aria-hidden className="mr-1.5 size-3.5" />
          Importar CSV
        </Button>
        <Button
          variant={vista === 'mano' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setVista('mano')}
        >
          <Pencil aria-hidden className="mr-1.5 size-3.5" />
          Capturar a mano
        </Button>
      </div>

      {vista === 'csv' && <FormularioCsv clientId={clientId} />}
      {vista === 'mano' && <FormularioAMano clientId={clientId} mes={mes} actual={actual} />}
    </Card>
  )
}

function FormularioCsv({ clientId }: { clientId: string }) {
  const [estado, action, pendiente] = useActionState(importarCsv, INICIAL)

  return (
    <form action={action} className="border-line mt-6 flex flex-col gap-4 border-t pt-6">
      <input type="hidden" name="clientId" value={clientId} />

      <fieldset>
        <legend className="type-mono text-fg-muted mb-2">Qué trae el archivo</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="radio"
              name="tipo"
              value="mensual"
              defaultChecked
              className="accent-accent-hot"
            />
            Totales por mes
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="radio" name="tipo" value="por_pieza" className="accent-accent-hot" />
            Métricas por pieza
          </label>
        </div>
      </fieldset>

      <div>
        <label htmlFor="archivo" className="type-mono text-fg-muted">
          Archivo CSV
        </label>
        <input
          id="archivo"
          name="archivo"
          type="file"
          accept=".csv,text/csv"
          required
          className="border-line bg-bg mt-2 w-full rounded-xs border p-3 text-[13px]"
        />
        <p className="text-fg-muted mt-2 max-w-prose text-[12px]">
          Acepta el export de Meta Business Suite, Metricool o TikTok: punto y coma, acentos, miles
          con punto y columnas de más. Si un renglón viene mal, no se importa nada y te dice en qué
          línea está.
        </p>
      </div>

      <Resultado estado={estado} />

      <div>
        <Button variant="primary" type="submit" disabled={pendiente}>
          {pendiente ? 'Revisando el archivo…' : 'Importar'}
        </Button>
      </div>
    </form>
  )
}

const CAMPOS = [
  { name: 'alcance', label: 'Alcance' },
  { name: 'impresiones', label: 'Impresiones' },
  { name: 'guardados', label: 'Guardados' },
  { name: 'compartidos', label: 'Compartidos' },
  { name: 'interacciones', label: 'Interacciones' },
  { name: 'seguidores_nuevos', label: 'Seguidores nuevos' },
  { name: 'visitas_perfil', label: 'Visitas al perfil' },
  { name: 'clics_link', label: 'Clics al link' },
] as const

function FormularioAMano({
  clientId,
  mes,
  actual,
}: {
  clientId: string
  mes: MonthKey
  actual: MetricasMes | null
}) {
  const [estado, action, pendiente] = useActionState(capturarResultados, INICIAL)

  const previos: Record<string, number> = {
    alcance: actual?.alcance ?? 0,
    impresiones: actual?.impresiones ?? 0,
    guardados: actual?.guardados ?? 0,
    compartidos: actual?.compartidos ?? 0,
    interacciones: actual?.interacciones ?? 0,
    seguidores_nuevos: actual?.seguidoresNuevos ?? 0,
    visitas_perfil: actual?.visitasPerfil ?? 0,
    clics_link: actual?.clicsLink ?? 0,
  }

  return (
    <form action={action} className="border-line mt-6 flex flex-col gap-4 border-t pt-6">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="mes" value={mes} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CAMPOS.map((campo) => (
          <div key={campo.name}>
            <label htmlFor={campo.name} className="type-mono text-fg-muted">
              {campo.label}
            </label>
            <input
              id={campo.name}
              name={campo.name}
              type="number"
              inputMode="numeric"
              step={1}
              min={campo.name === 'seguidores_nuevos' ? undefined : 0}
              defaultValue={previos[campo.name] ?? 0}
              required
              className="border-line bg-bg text-fg mt-2 w-full rounded-xs border p-2 text-[13px]"
            />
          </div>
        ))}
      </div>

      <Resultado estado={estado} />

      <div>
        <Button variant="primary" type="submit" disabled={pendiente}>
          {pendiente ? 'Guardando…' : `Guardar ${formatMonthKey(mes)}`}
        </Button>
      </div>
    </form>
  )
}

function Resultado({ estado }: { estado: EstadoResultados }) {
  if (estado.status === 'inicial') return null

  const malo = estado.status === 'error'

  return (
    <div
      className="bg-surface-2 border-l-[3px] px-4 py-3"
      style={{
        borderLeftColor: malo ? 'var(--color-accent-hot)' : 'var(--color-ok)',
      }}
      role="status"
      aria-live="polite"
    >
      <p className="text-[13px]">{estado.message}</p>

      {estado.errores && estado.errores.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {estado.errores.slice(0, 25).map((error, i) => (
            <li key={`${error.linea}-${error.columna}-${i}`} className="flex gap-3">
              <Mono className="text-accent-hot w-24 shrink-0">
                {error.linea === null ? 'archivo' : `línea ${error.linea}`}
                {error.columna ? ` · ${error.columna}` : ''}
              </Mono>
              <span className="text-fg-muted text-[13px]">{error.mensaje}</span>
            </li>
          ))}
          {estado.errores.length > 25 && (
            <li>
              <Mono className="text-fg-muted">
                y {estado.errores.length - 25} problemas más. Arregla estos y vuelve a subirlo.
              </Mono>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
