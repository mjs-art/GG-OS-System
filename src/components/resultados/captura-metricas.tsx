'use client'

import { useActionState, useState } from 'react'
import {
  capturarResultados,
  importarCsv,
  type EstadoResultados,
} from '@/components/resultados/acciones'
import { Button, Card, Display, Mono } from '@/components/ui/primitives'
import type { MetricasMes } from '@/lib/datos/resultados'
import { formatMonthKey, type MonthKey } from '@/lib/time'

/**
 * Las dos formas de que entren los números: un CSV o a mano.
 *
 * No hay conexión automática a Instagram Graph ni a Meta Ads y en esta etapa no
 * la va a haber: son semanas de trámite por cliente y el agente no distingue de
 * dónde vino el número. La interfaz lo dice en vez de esconderlo.
 */

const INICIAL: EstadoResultados = { status: 'inicial' }

export function CapturaDeMetricas({
  clientId,
  mes,
  actual,
}: {
  clientId: string
  mes: MonthKey
  actual: MetricasMes | null
}) {
  const [vista, setVista] = useState<'ninguna' | 'csv' | 'mano'>('ninguna')

  return (
    <Card className="mt-10" data-print="hide">
      <Display as="h3" className="text-base">
        Capturar resultados de {formatMonthKey(mes)}
      </Display>
      <Mono as="p" className="text-fg-muted mt-2">
        Las métricas entran por CSV o a mano. No hay conexión automática por ahora.
      </Mono>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant={vista === 'csv' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setVista(vista === 'csv' ? 'ninguna' : 'csv')}
        >
          Importar CSV
        </Button>
        <Button
          variant={vista === 'mano' ? 'primary' : 'secondary'}
          type="button"
          onClick={() => setVista(vista === 'mano' ? 'ninguna' : 'mano')}
        >
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
        <p className="text-fg-muted mt-2 max-w-prose text-[13px]">
          Sirve el export de Meta Business Suite tal cual: acepta punto y coma, acentos, miles con
          punto y columnas de más. Si un renglón viene mal, no se importa nada y te dice en qué
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

  // Se precargan los valores que ya había: capturar el mes otra vez casi
  // siempre es corregir un número, no teclear los ocho desde cero.
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
              // Seguidores nuevos puede ser negativo; los demás no.
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

/** El resultado de la acción: el mensaje y, si hubo, los renglones malos. */
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
