'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Chip, Mono, type ChipTone } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import type { EdicionHumana, ResultadoCorrida } from '@/lib/datos/agentes'

/**
 * La bitácora: qué corrió, cuánto costó y qué le corrigió una persona después.
 *
 * Un agente que no se puede auditar no se puede operar, así que aquí se ve la
 * corrida completa —entrada, salida, versión del Context Card— y no un resumen.
 *
 * Las fechas y los números llegan **ya formateados** desde el servidor. Si se
 * formatearan aquí, el primer render del cliente podría usar otra zona horaria
 * que la del servidor y React marcaría el desajuste de hidratación.
 */

export interface CorridaVista {
  id: string
  fecha: string
  hora: string
  cliente: string
  pieza: { etiqueta: string; href: string } | null
  resultado: ResultadoCorrida
  modelo: string | null
  tokens: string
  costo: string
  duracion: string
  contextVersion: number | null
  disparador: string
  /** JSON ya formateado y recortado. */
  input: string
  output: string
  error: string | null
  camposEscritos: string[]
  edicionesHumanas: EdicionHumana[]
}

const RESULTADO_LABEL: Record<ResultadoCorrida, string> = {
  resultado: 'Resultado',
  // Escalar no es falla: es el agente haciendo lo correcto cuando no sabe. Por
  // eso lleva el tono del acento y no el de error.
  escalamiento: 'Escaló',
  error: 'Error',
  corriendo: 'Corriendo',
  cancelada: 'Cancelada',
}

const RESULTADO_TONO: Record<ResultadoCorrida, ChipTone> = {
  resultado: 'ok',
  escalamiento: 'accent',
  error: 'critical',
  corriendo: 'neutral',
  cancelada: 'neutral',
}

export function BitacoraCorridas({ corridas }: { corridas: CorridaVista[] }) {
  const [abierta, setAbierta] = useState<string | null>(null)

  if (corridas.length === 0) {
    return (
      <div className="border-line rounded-xs border border-dashed p-8">
        <p className="text-fg-muted max-w-prose text-[13px]">
          Este agente todavía no corre. Enciéndelo en un cliente desde la pantalla de agentes; en
          cuanto tenga su primera corrida, aquí va a quedar el renglón con su entrada, su salida y
          su costo.
        </p>
      </div>
    )
  }

  return (
    <div className="border-line overflow-x-auto rounded-xs border">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">
          Corridas de este agente, de la más reciente a la más vieja
        </caption>
        <thead>
          <tr className="border-line border-b">
            {['Hora', 'Cliente', 'Pieza', 'Resultado', 'Tokens', 'Costo', 'Duración', ''].map(
              (encabezado) => (
                <th key={encabezado} scope="col" className="px-3 py-2.5">
                  <Mono className="text-fg-muted">{encabezado}</Mono>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {corridas.map((corrida) => {
            const expandida = abierta === corrida.id
            return (
              <Renglon
                key={corrida.id}
                corrida={corrida}
                expandida={expandida}
                onAlternar={() => setAbierta(expandida ? null : corrida.id)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Renglon({
  corrida,
  expandida,
  onAlternar,
}: {
  corrida: CorridaVista
  expandida: boolean
  onAlternar: () => void
}) {
  return (
    <>
      <tr className={cn('border-line border-b last:border-b-0', expandida && 'bg-surface-2')}>
        <td className="px-3 py-2.5 align-top">
          <Mono className="text-fg">{corrida.hora}</Mono>
          <Mono className="text-fg-muted mt-0.5 block">{corrida.fecha}</Mono>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Mono className="text-fg">{corrida.cliente}</Mono>
        </td>
        <td className="max-w-[22ch] px-3 py-2.5 align-top">
          {corrida.pieza ? (
            <Link href={corrida.pieza.href} className="text-fg-muted hover:text-fg text-[12px]">
              {corrida.pieza.etiqueta}
            </Link>
          ) : (
            <Mono className="text-fg-muted">—</Mono>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <Chip tone={RESULTADO_TONO[corrida.resultado]}>{RESULTADO_LABEL[corrida.resultado]}</Chip>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Mono className="text-fg-muted">{corrida.tokens}</Mono>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Mono className="text-fg">{corrida.costo}</Mono>
        </td>
        <td className="px-3 py-2.5 align-top">
          <Mono className="text-fg-muted">{corrida.duracion}</Mono>
        </td>
        <td className="px-3 py-2.5 text-right align-top">
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={expandida}
            aria-controls={`corrida-${corrida.id}`}
            className="type-mono border-line text-fg hover:bg-surface rounded-xs border px-2 py-1 transition-colors duration-150"
          >
            {expandida ? 'Cerrar' : 'Ver'}
          </button>
        </td>
      </tr>

      {expandida && (
        <tr id={`corrida-${corrida.id}`} className="border-line bg-surface border-b">
          <td colSpan={8} className="px-3 py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Dato label="Modelo" valor={corrida.modelo ?? 'mock'} />
                <Dato label="Disparador" valor={corrida.disparador} />
                <Dato
                  label="Context Card"
                  valor={
                    corrida.contextVersion === null ? 'sin versión' : `v${corrida.contextVersion}`
                  }
                />
              </div>

              {corrida.error && (
                <p className="border-critical text-fg rounded-xs border-l-[3px] px-3 py-2 text-[13px]">
                  {corrida.error}
                </p>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <Bloque titulo="Entrada" contenido={corrida.input} />
                <Bloque titulo="Salida" contenido={corrida.output} />
              </div>

              <div>
                <Mono className="text-fg-muted">Campos que escribió</Mono>
                <div className="mt-2 flex flex-wrap gap-2">
                  {corrida.camposEscritos.length > 0 ? (
                    corrida.camposEscritos.map((campo) => (
                      <Chip key={campo} tone="agent">
                        {campo}
                      </Chip>
                    ))
                  ) : (
                    <p className="text-fg-muted text-[13px]">
                      Ninguno. Esta corrida dictamina o propone; no escribe campos de la pieza.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Mono className="text-fg-muted">Lo que le corregiste después</Mono>
                {corrida.edicionesHumanas.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {corrida.edicionesHumanas.map((edicion, i) => (
                      <li
                        key={`${edicion.campo}-${i}`}
                        className="border-line rounded-xs border px-3 py-2"
                      >
                        <Mono className="text-fg">{edicion.campo}</Mono>
                        <p className="text-fg-muted mt-1 text-[13px] line-through">
                          {edicion.antes ?? '(vacío)'}
                        </p>
                        <p className="mt-0.5 text-[13px]">{edicion.despues ?? '(vacío)'}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-fg-muted mt-2 text-[13px]">
                    Nada. Lo que escribió se quedó tal cual.
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <Mono className="text-fg-muted">{label}</Mono>
      <Mono className="text-fg">{valor}</Mono>
    </div>
  )
}

function Bloque({ titulo, contenido }: { titulo: string; contenido: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Mono className="text-fg-muted">{titulo}</Mono>
      <pre className="border-line bg-bg max-h-80 overflow-auto rounded-xs border p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
        {contenido}
      </pre>
    </div>
  )
}
