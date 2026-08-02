import { describe, expect, it } from 'vitest'
import {
  checkCodeRules,
  normalizarParamsDeRegla,
  type CheckablePiece,
  type CodeRule,
} from './brand-rules'

const rule = (id: string, params: CodeRule['params'], severity: CodeRule['severity'] = 'critica') =>
  ({ id, rule: `regla ${id}`, severity, params }) satisfies CodeRule

describe('conteo de hashtags', () => {
  const rules = [rule('h5', { kind: 'hashtags_exact', count: 5 })]

  it('acepta el conteo exacto', () => {
    const piece: CheckablePiece = { hashtags: ['#a', '#b', '#c', '#d', '#e'] }
    expect(checkCodeRules(rules, piece).violations).toHaveLength(0)
  })

  it('dice cuántos sobran, no solo que está mal', () => {
    const piece: CheckablePiece = { hashtags: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'] }
    const { violations, blocking } = checkCodeRules(rules, piece)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.found).toContain('7')
    expect(violations[0]?.fix).toContain('Quita 2')
    expect(blocking).toBe(true)
  })

  it('trata la ausencia de hashtags como cero, no como indefinido', () => {
    expect(checkCodeRules(rules, {}).violations).toHaveLength(1)
  })
})

describe('minúsculas', () => {
  const rules = [rule('lower', { kind: 'lowercase' }, 'alta')]

  it('no confunde hashtags con prosa', () => {
    // El cliente pide copy en minúsculas pero su marca en hashtag va con
    // mayúscula. Revisar los hashtags aquí sería un falso positivo diario.
    const piece: CheckablePiece = { hook: 'jueves de jazz', hashtags: ['#TowerBar'] }
    expect(checkCodeRules(rules, piece).violations).toHaveLength(0)
  })

  it('señala el campo exacto que falla', () => {
    const piece: CheckablePiece = { hook: 'jueves de jazz', cta: 'Reserva Ya' }
    const { violations } = checkCodeRules(rules, piece)
    expect(violations).toHaveLength(1)
    expect(violations[0]?.field).toBe('cta')
  })

  it('no bloquea si la severidad no es crítica', () => {
    const piece: CheckablePiece = { hook: 'Jueves De Jazz' }
    expect(checkCodeRules(rules, piece).blocking).toBe(false)
  })
})

describe('palabras prohibidas', () => {
  const rules = [rule('ban', { kind: 'banned_words', words: ['único', 'imperdible'] })]

  it('ignora el acento en los dos sentidos', () => {
    // El cliente escribió la regla con acento; el redactor escribió sin. Es la
    // misma palabra y tiene que dispararse igual.
    expect(checkCodeRules(rules, { hook: 'un lugar unico' }).violations).toHaveLength(1)
    expect(checkCodeRules(rules, { hook: 'un lugar único' }).violations).toHaveLength(1)
  })

  it('respeta la frontera de palabra', () => {
    // "imperdibles" en plural sí es la palabra; "único" dentro de otra palabra
    // no debería disparar. Este es el caso que hace que la gente desactive la
    // regla por ruidosa.
    expect(checkCodeRules(rules, { hook: 'unicornio en la barra' }).violations).toHaveLength(0)
  })

  it('detecta con puntuación pegada', () => {
    expect(checkCodeRules(rules, { hook: '¿único? sí.' }).violations).toHaveLength(1)
  })

  it('reporta una violación por palabra y por campo', () => {
    const piece: CheckablePiece = { hook: 'único', copyOut: 'imperdible' }
    expect(checkCodeRules(rules, piece).violations).toHaveLength(2)
  })
})

describe('CTA obligatorio', () => {
  const rules = [rule('cta', { kind: 'required_cta' })]

  it('no acepta espacios en blanco como CTA', () => {
    expect(checkCodeRules(rules, { cta: '   ' }).violations).toHaveLength(1)
  })

  it('acepta un CTA real', () => {
    expect(checkCodeRules(rules, { cta: 'reserva tu mesa' }).violations).toHaveLength(0)
  })
})

describe('robustez', () => {
  it('una regla mal configurada no tumba la revisión de las demás', () => {
    const rules = [
      { id: 'rota', rule: 'regla rota', severity: 'alta', params: { kind: 'no_existe' } },
      rule('h5', { kind: 'hashtags_exact', count: 5 }),
    ] as unknown as CodeRule[]

    const { violations } = checkCodeRules(rules, { hashtags: ['#a'] })
    expect(violations).toHaveLength(2)
    expect(violations[0]?.found).toContain('mal configurada')
    expect(violations[1]?.found).toContain('1 hashtags')
  })

  it('sin reglas no hay violaciones ni bloqueo', () => {
    expect(checkCodeRules([], { hook: 'ÚNICO Y IMPERDIBLE' })).toEqual({
      violations: [],
      blocking: false,
    })
  })
})

describe('normalizarParamsDeRegla', () => {
  it('deja pasar la forma canónica sin tocarla', () => {
    const canonico = { kind: 'hashtags_exact', count: 5 } as const
    expect(normalizarParamsDeRegla('hashtags', canonico)).toEqual(canonico)
  })

  it('traduce la forma abreviada del seed', () => {
    expect(normalizarParamsDeRegla('hashtags', { exact: 5 })).toEqual({
      kind: 'hashtags_exact',
      count: 5,
    })
    expect(normalizarParamsDeRegla('formato', { lowercase: true })).toEqual({ kind: 'lowercase' })
    expect(normalizarParamsDeRegla('hashtags', { min: 3, max: 7 })).toEqual({
      kind: 'hashtags_range',
      min: 3,
      max: 7,
    })
    expect(normalizarParamsDeRegla('prohibidas', { words: ['único'] })).toEqual({
      kind: 'banned_words',
      words: ['único'],
    })
  })

  it('el CTA obligatorio depende del tipo de regla, no solo del params', () => {
    expect(normalizarParamsDeRegla('cta', { required: true })).toEqual({ kind: 'required_cta' })
    // El mismo params bajo otro tipo no significa lo mismo.
    expect(normalizarParamsDeRegla('otra', { required: true })).toBeNull()
  })

  it('devuelve null en vez de adivinar cuando no se entiende', () => {
    for (const basura of [
      null,
      undefined,
      42,
      'texto',
      {},
      { exact: 'cinco' },
      { words: [1, 2] },
    ]) {
      expect(normalizarParamsDeRegla('hashtags', basura), `${JSON.stringify(basura)}`).toBeNull()
    }
  })

  it('lo que traduce es efectivamente aplicable', () => {
    // La prueba que importa: no basta con producir un objeto, tiene que
    // servirle a checkCodeRules. Con la forma del seed sin traducir, las tres
    // reglas del cliente se reportaban como mal configuradas y no verificaban
    // nada.
    const params = normalizarParamsDeRegla('hashtags', { exact: 5 })
    if (params === null) throw new Error('la forma del seed debería traducirse')

    const { violations } = checkCodeRules(
      [{ id: 'r1', rule: 'exactamente 5', severity: 'critica', params }],
      { hashtags: ['#a', '#b'] },
    )
    expect(violations).toHaveLength(1)
    expect(violations[0]?.found).toContain('2 hashtags')
  })
})
