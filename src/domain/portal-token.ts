import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * El token del portal de cliente.
 *
 * Firmado con HMAC y sin tabla en la base, y esa decisión merece explicación.
 *
 * El token **no es una credencial**. No da acceso a nada por sí solo: solo dice
 * "esta liga habla del cliente X y del mes Y". Quien la abre todavía tiene que
 * poner un correo que esté en la lista blanca de ese cliente y abrir el magic
 * link en ese buzón. Por eso no hace falta guardarlo ni revocarlo uno por uno:
 * la revocación real es `client_users.revoked_at`, que es lo que de verdad
 * corta el acceso.
 *
 * Lo que sí hace la firma es impedir que alguien cambie el `clientId` de la URL
 * y pida el mes de otro cliente.
 */

export interface PayloadPortal {
  clientId: string
  /** `2026-09` */
  month: string
  /** Epoch en segundos. */
  exp: number
}

/** 30 días. Suficiente para el ciclo de aprobación de un mes, y no más. */
export const VIGENCIA_SEGUNDOS = 60 * 60 * 24 * 30

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

function desdeBase64url(input: string): Buffer {
  const relleno = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replaceAll('-', '+').replaceAll('_', '/') + relleno, 'base64')
}

function firmar(cuerpo: string, secreto: string): string {
  return base64url(createHmac('sha256', secreto).update(cuerpo).digest())
}

export function crearTokenPortal(payload: PayloadPortal, secreto: string): string {
  if (secreto.length < 32) {
    throw new Error('El secreto del portal debe tener al menos 32 caracteres.')
  }
  const cuerpo = base64url(JSON.stringify(payload))
  return `${cuerpo}.${firmar(cuerpo, secreto)}`
}

export type ResultadoToken =
  | { ok: true; payload: PayloadPortal }
  | { ok: false; motivo: 'malformado' | 'firma_invalida' | 'expirado' }

/**
 * `ahora` se inyecta en vez de leer el reloj para que la expiración sea
 * probable sin esperar treinta días.
 */
export function verificarTokenPortal(token: string, secreto: string, ahora: Date): ResultadoToken {
  const partes = token.split('.')
  if (partes.length !== 2) return { ok: false, motivo: 'malformado' }

  const [cuerpo, firma] = partes as [string, string]

  // Comparación en tiempo constante. Un `===` sobre la firma filtra, por
  // diferencia de tiempo, cuántos bytes iniciales acertó quien la adivina.
  const esperada = Buffer.from(firmar(cuerpo, secreto))
  const recibida = Buffer.from(firma)
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) {
    return { ok: false, motivo: 'firma_invalida' }
  }

  let payload: PayloadPortal
  try {
    payload = JSON.parse(desdeBase64url(cuerpo).toString('utf8')) as PayloadPortal
  } catch {
    return { ok: false, motivo: 'malformado' }
  }

  if (
    typeof payload?.clientId !== 'string' ||
    typeof payload?.month !== 'string' ||
    typeof payload?.exp !== 'number'
  ) {
    return { ok: false, motivo: 'malformado' }
  }

  // La expiración se revisa DESPUÉS de la firma: si se revisara antes, un
  // token con basura adentro produciría un mensaje distinto al de uno mal
  // firmado, y eso ya es información.
  if (payload.exp * 1000 <= ahora.getTime()) {
    return { ok: false, motivo: 'expirado' }
  }

  return { ok: true, payload }
}
