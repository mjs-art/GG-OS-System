import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { crearTokenPortal, verificarTokenPortal, VIGENCIA_SEGUNDOS } from './portal-token'
import { fixedClock } from '@/lib/time'

const SECRETO = 'un-secreto-de-al-menos-treinta-y-dos-caracteres'
const OTRO = 'otro-secreto-igual-de-largo-para-la-prueba-xx'
const AHORA = fixedClock('2026-09-01T12:00:00Z').now()

const payload = {
  clientId: 'cccccccc-0000-4000-8000-000000000001',
  month: '2026-09',
  exp: Math.floor(AHORA.getTime() / 1000) + VIGENCIA_SEGUNDOS,
}

describe('crearTokenPortal', () => {
  it('exige un secreto de tamaño razonable', () => {
    expect(() => crearTokenPortal(payload, 'corto')).toThrow(/32/)
  })

  it('produce un token seguro para URL', () => {
    const token = crearTokenPortal(payload, SECRETO)
    expect(token).toBe(encodeURIComponent(token))
  })
})

describe('verificarTokenPortal', () => {
  it('acepta un token propio y devuelve el payload intacto', () => {
    const r = verificarTokenPortal(crearTokenPortal(payload, SECRETO), SECRETO, AHORA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload).toEqual(payload)
  })

  it('rechaza un token firmado con otro secreto', () => {
    const r = verificarTokenPortal(crearTokenPortal(payload, OTRO), SECRETO, AHORA)
    expect(r).toEqual({ ok: false, motivo: 'firma_invalida' })
  })

  it('rechaza si alguien cambia el cliente en la URL', () => {
    // El ataque obvio: tomar tu propia liga y cambiarle el id del cliente.
    const token = crearTokenPortal(payload, SECRETO)
    const [, firma] = token.split('.')
    const otroCuerpo = Buffer.from(
      JSON.stringify({ ...payload, clientId: 'cccccccc-0000-4000-8000-000000000002' }),
    )
      .toString('base64url')
      .replace(/=+$/, '')

    const r = verificarTokenPortal(`${otroCuerpo}.${firma}`, SECRETO, AHORA)
    expect(r).toEqual({ ok: false, motivo: 'firma_invalida' })
  })

  it('rechaza un token expirado', () => {
    const vencido = { ...payload, exp: Math.floor(AHORA.getTime() / 1000) - 1 }
    const r = verificarTokenPortal(crearTokenPortal(vencido, SECRETO), SECRETO, AHORA)
    expect(r).toEqual({ ok: false, motivo: 'expirado' })
  })

  it('el token vence justo al llegar la hora, no un segundo después', () => {
    const justo = { ...payload, exp: Math.floor(AHORA.getTime() / 1000) }
    expect(verificarTokenPortal(crearTokenPortal(justo, SECRETO), SECRETO, AHORA).ok).toBe(false)
  })

  it('rechaza basura sin tronar', () => {
    for (const basura of ['', '.', 'a.b.c', 'sin-punto', '....', 'ñ.ñ']) {
      const r = verificarTokenPortal(basura, SECRETO, AHORA)
      expect(r.ok, `"${basura}" no debería pasar`).toBe(false)
    }
  })

  it('un cuerpo bien firmado pero que no es JSON se reporta como malformado', () => {
    const cuerpo = Buffer.from('esto no es json').toString('base64url').replace(/=+$/, '')
    const token = crearTokenPortal(payload, SECRETO)
    // Se refirma el cuerpo malo con el secreto bueno para aislar el caso.
    const firma = createHmac('sha256', SECRETO)
      .update(cuerpo)
      .digest('base64url')
      .replace(/=+$/, '')
    expect(token).toBeTruthy()
    expect(verificarTokenPortal(`${cuerpo}.${firma}`, SECRETO, AHORA)).toEqual({
      ok: false,
      motivo: 'malformado',
    })
  })

  it('un payload con campos faltantes es malformado, no válido', () => {
    const cuerpo = Buffer.from(JSON.stringify({ clientId: 'x' }))
      .toString('base64url')
      .replace(/=+$/, '')
    const firma = createHmac('sha256', SECRETO)
      .update(cuerpo)
      .digest('base64url')
      .replace(/=+$/, '')
    expect(verificarTokenPortal(`${cuerpo}.${firma}`, SECRETO, AHORA)).toEqual({
      ok: false,
      motivo: 'malformado',
    })
  })
})
