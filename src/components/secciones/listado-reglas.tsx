'use client'

import { useState } from 'react'
import { Braces, Pencil, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { Button, Chip, Mono } from '@/components/ui/primitives'
import { RULE_SEVERITY_LABEL, type RuleSeverity } from '@/domain/labels'
import type { ReglaDura } from '@/lib/datos/secciones'
import { borrarReglaDura } from './acciones'
import { FormularioEditarRegla } from './formulario-editar-regla'

const TONO_SEVERIDAD: Record<RuleSeverity, 'critical' | 'high' | 'medium' | 'neutral'> = {
  critica: 'critical',
  alta: 'high',
  media: 'medium',
  baja: 'neutral',
}

export function ListadoReglas({
  reglas,
  clientId,
  slug,
}: {
  reglas: ReglaDura[]
  clientId: string
  slug: string
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  async function borrar(id: string) {
    setBorrando(id)
    // borrarReglaDura needs clientId and slug; embed in FormData
    const fd = new FormData()
    fd.set('id', id)
    fd.set('clientId', clientId)
    fd.set('slug', slug)
    await borrarReglaDura(fd)
    setBorrando(null)
  }

  return (
    <ul className="flex flex-col">
      {reglas.map((r) => (
        <li
          key={r.id}
          className="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-b py-3 last:border-b-0"
        >
          {editandoId === r.id ? (
            <div className="w-full">
              <FormularioEditarRegla
                ruleId={r.id}
                clientId={clientId}
                slug={slug}
                textoActual={r.rule}
                severidadActual={r.severity}
                onCancelar={() => setEditandoId(null)}
              />
            </div>
          ) : (
            <>
              <Mono className="text-fg-muted w-24 shrink-0">{r.kind}</Mono>
              <span className="min-w-[12rem] flex-1 text-[13px]">{r.rule}</span>
              <Chip tone={TONO_SEVERIDAD[r.severity]}>{RULE_SEVERITY_LABEL[r.severity]}</Chip>
              <span className="flex w-28 shrink-0 items-center gap-1.5">
                {r.checkBy === 'codigo' ? (
                  <Braces aria-hidden className="text-ok size-3.5" />
                ) : (
                  <Sparkles aria-hidden className="text-fg-muted size-3.5" />
                )}
                <Mono className="text-fg-muted">
                  {r.checkBy === 'codigo' ? 'Código' : 'Modelo'}
                </Mono>
              </span>

              <span className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  aria-label="Editar regla"
                  onClick={() => setEditandoId(r.id)}
                  className="size-7 p-0"
                >
                  <Pencil aria-hidden className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Borrar regla"
                  disabled={borrando === r.id}
                  onClick={() => borrar(r.id)}
                  className="size-7 p-0"
                >
                  <Trash2 aria-hidden className="text-accent-hot size-3.5" />
                </Button>
              </span>

              {!r.verificable && (
                <span className="text-accent-hot flex w-full items-start gap-1.5 text-[13px]">
                  <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  Los parámetros de esta regla no coinciden con lo que el verificador sabe leer, así
                  que hoy no se está aplicando. Bórrala y agrégala de nuevo, o edítala y elige el
                  tipo correcto.
                </span>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
