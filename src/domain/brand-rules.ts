import { z } from 'zod'

/**
 * Verificación de reglas duras de marca.
 *
 * El Editor de marca es el agente que permite no leer las 2,000 piezas. Pero
 * hay una división que importa y que este archivo hace real:
 *
 *   · Regla de CÓDIGO — determinista. Conteo de hashtags, minúsculas, palabra
 *     prohibida presente. Se evalúa aquí, gratis, en milisegundos, y no se
 *     puede convencer. Un modelo sí se puede convencer.
 *   · Regla de MODELO — juicio. "No prometer disponibilidad de mesa sin
 *     reserva". Esa sí necesita al agente, y su veredicto es opinable.
 *
 * Toda regla que se pueda mover a código, se mueve a código. Es más barato,
 * más rápido y, sobre todo, no falla distinto el martes que el jueves.
 */

export const ruleSeverity = z.enum(['critica', 'alta', 'media', 'baja'])
export type RuleSeverity = z.infer<typeof ruleSeverity>

/** Reglas que este módulo sabe evaluar sin llamar a ningún modelo. */
export const codeRuleParams = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hashtags_exact'), count: z.number().int().min(0).max(30) }),
  z.object({
    kind: z.literal('hashtags_range'),
    min: z.number().int().min(0).max(30),
    max: z.number().int().min(0).max(30),
  }),
  z.object({ kind: z.literal('lowercase') }),
  z.object({ kind: z.literal('banned_words'), words: z.array(z.string().min(1)).min(1) }),
  z.object({
    kind: z.literal('max_length'),
    field: z.string().min(1),
    max: z.number().int().min(1),
  }),
  z.object({ kind: z.literal('required_cta') }),
])
export type CodeRuleParams = z.infer<typeof codeRuleParams>

export interface CodeRule {
  id: string
  rule: string
  severity: RuleSeverity
  params: CodeRuleParams
}

/** El subconjunto de una pieza que las reglas de código pueden mirar. */
export interface CheckablePiece {
  hook?: string | null
  copyIn?: string | null
  copyOut?: string | null
  cta?: string | null
  hashtags?: readonly string[]
}

export interface RuleViolation {
  ruleId: string
  rule: string
  severity: RuleSeverity
  /** Qué se encontró, en el mismo tono que usa la interfaz: directo, sin disculpas. */
  found: string
  /** Qué hacer. Un hallazgo sin remedio solo genera trabajo. */
  fix: string
  field?: string
}

/** Todo el texto de copy de la pieza, para las reglas que miran el conjunto. */
function copyFields(piece: CheckablePiece): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = []
  const add = (field: string, value: string | null | undefined) => {
    if (typeof value === 'string') fields.push({ field, value })
  }

  add('hook', piece.hook)
  add('copy_in', piece.copyIn)
  add('copy_out', piece.copyOut)
  add('cta', piece.cta)

  return fields
}

/**
 * Normaliza el acento antes de comparar. "unico" y "único" son la misma palabra
 * prohibida, y el cliente que escribió la regla no va a listar las dos.
 */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function checkOne(rule: CodeRule, piece: CheckablePiece): RuleViolation[] {
  const { params } = rule
  const base = { ruleId: rule.id, rule: rule.rule, severity: rule.severity }

  switch (params.kind) {
    case 'hashtags_exact': {
      const n = piece.hashtags?.length ?? 0
      if (n === params.count) return []
      return [
        {
          ...base,
          field: 'hashtags',
          found: `La pieza tiene ${n} hashtags y la regla pide exactamente ${params.count}.`,
          fix:
            n > params.count
              ? `Quita ${n - params.count}, empezando por los de menor volumen.`
              : `Agrega ${params.count - n}.`,
        },
      ]
    }

    case 'hashtags_range': {
      const n = piece.hashtags?.length ?? 0
      if (n >= params.min && n <= params.max) return []
      return [
        {
          ...base,
          field: 'hashtags',
          found: `La pieza tiene ${n} hashtags y la regla pide entre ${params.min} y ${params.max}.`,
          fix: n < params.min ? `Agrega ${params.min - n}.` : `Quita ${n - params.max}.`,
        },
      ]
    }

    case 'lowercase': {
      // Los hashtags se revisan aparte de la prosa: un cliente puede pedir copy
      // en minúsculas y aun así usar #TowerBar.
      return copyFields(piece)
        .filter(({ value }) => value !== value.toLowerCase())
        .map(({ field, value }) => ({
          ...base,
          field,
          found: `"${value.slice(0, 60)}" tiene mayúsculas.`,
          fix: 'Pásalo todo a minúsculas.',
        }))
    }

    case 'banned_words': {
      const violations: RuleViolation[] = []
      for (const { field, value } of copyFields(piece)) {
        const haystack = fold(value)
        for (const word of params.words) {
          // Frontera de palabra, para que "único" no dispare dentro de otra
          // palabra y para que sí dispare con puntuación pegada.
          const needle = fold(word)
          const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(needle)}([^\\p{L}\\p{N}]|$)`, 'u')
          if (re.test(haystack)) {
            violations.push({
              ...base,
              field,
              found: `Aparece la palabra prohibida "${word}" en ${field}.`,
              fix: `Quítala o reemplázala. Está en la lista de palabras prohibidas del cliente.`,
            })
          }
        }
      }
      return violations
    }

    case 'max_length': {
      const match = copyFields(piece).find((f) => f.field === params.field)
      if (!match || match.value.length <= params.max) return []
      return [
        {
          ...base,
          field: params.field,
          found: `${params.field} tiene ${match.value.length} caracteres y el tope es ${params.max}.`,
          fix: `Recorta ${match.value.length - params.max}.`,
        },
      ]
    }

    case 'required_cta': {
      if (piece.cta && piece.cta.trim().length > 0) return []
      return [
        {
          ...base,
          field: 'cta',
          found: 'La pieza no tiene CTA.',
          fix: 'Agrega el llamado a la acción del objetivo del mes.',
        },
      ]
    }
  }
}

export interface CheckResult {
  violations: RuleViolation[]
  /** Una crítica basta para que la pieza no pueda avanzar a `con_cliente`. */
  blocking: boolean
}

/**
 * Evalúa todas las reglas de código contra una pieza.
 *
 * No lanza: una regla mal configurada no debe tumbar la revisión de las demás.
 * Las reglas inválidas se reportan como violación de configuración, que es
 * información útil, no un crash.
 */
export function checkCodeRules(rules: readonly CodeRule[], piece: CheckablePiece): CheckResult {
  const violations = rules.flatMap((rule) => {
    const parsed = codeRuleParams.safeParse(rule.params)
    if (!parsed.success) {
      return [
        {
          ruleId: rule.id,
          rule: rule.rule,
          severity: 'media' as const,
          found: 'La regla está mal configurada y no se pudo evaluar.',
          fix: 'Revísala en la sección Marca. Mientras tanto esta pieza no se verificó contra ella.',
        },
      ]
    }
    return checkOne({ ...rule, params: parsed.data }, piece)
  })

  return {
    violations,
    blocking: violations.some((v) => v.severity === 'critica'),
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
