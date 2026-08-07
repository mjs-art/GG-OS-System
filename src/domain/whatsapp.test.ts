import { describe, expect, it } from 'vitest'
import { construirEnvioN8n, normalizarTelefono, payloadN8nSchema } from './whatsapp'

describe('normalizar teléfono a E.164', () => {
  it('deja pasar uno que ya viene bien', () => {
    expect(normalizarTelefono('+525512345678')).toBe('+525512345678')
  })

  it('quita separadores y antepone +', () => {
    expect(normalizarTelefono('52 55 1234 5678')).toBe('+525512345678')
    // No inventa reglas de país: el '1' de los móviles mexicanos se conserva
    // tal cual, no se "corrige".
    expect(normalizarTelefono('(521) 55-1234-5678')).toBe('+5215512345678')
  })

  it('quita el prefijo whatsapp:', () => {
    expect(normalizarTelefono('whatsapp:+525512345678')).toBe('+525512345678')
  })

  it('devuelve null si no queda un número válido', () => {
    expect(normalizarTelefono('12')).toBeNull() // demasiado corto
    expect(normalizarTelefono('sin dígitos')).toBeNull()
    expect(normalizarTelefono('')).toBeNull()
  })
})

describe('payload de n8n', () => {
  it('acepta un mensaje entrante y rellena media por default', () => {
    const parsed = payloadN8nSchema.safeParse({
      tipo: 'mensaje',
      wa_phone: '+525512345678',
      wa_message_id: 'wamid.ABC',
      text: '¿ya está el reel?',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success && parsed.data.tipo === 'mensaje') {
      expect(parsed.data.media).toEqual([])
    }
  })

  it('acepta un reporte de envío con nuestro uuid', () => {
    const parsed = payloadN8nSchema.safeParse({
      tipo: 'reporte',
      message_id: '00000000-0000-4000-8000-000000000001',
      status: 'enviado',
      wa_message_id: 'wamid.XYZ',
    })
    expect(parsed.success).toBe(true)
  })

  it('rechaza un reporte cuyo message_id no es uuid', () => {
    const parsed = payloadN8nSchema.safeParse({
      tipo: 'reporte',
      message_id: 'no-soy-uuid',
      status: 'enviado',
    })
    expect(parsed.success).toBe(false)
  })

  it('rechaza un tipo que no reconocemos', () => {
    const parsed = payloadN8nSchema.safeParse({ tipo: 'otra_cosa', wa_phone: '+52...' })
    expect(parsed.success).toBe(false)
  })

  it('rechaza un estado de envío fuera del par enviado/fallido', () => {
    const parsed = payloadN8nSchema.safeParse({
      tipo: 'reporte',
      message_id: '00000000-0000-4000-8000-000000000001',
      status: 'entregado',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('construir el envío a n8n', () => {
  const id = '00000000-0000-4000-8000-000000000009'
  const telefono = '+525512345678'

  it('arma un saliente de solo texto', () => {
    const envio = construirEnvioN8n({ id, body: 'Ya quedó el reel, ¿lo ves?', media: [] }, telefono)
    expect(envio).toEqual({
      message_id: id,
      to: telefono,
      text: 'Ya quedó el reel, ¿lo ves?',
      media: [],
    })
  })

  it('arma un saliente de solo adjunto y rellena kind por default', () => {
    const envio = construirEnvioN8n(
      { id, body: null, media: [{ url: 'https://drive.example/reel.mp4' }] },
      telefono,
    )
    expect(envio?.text).toBeNull()
    expect(envio?.media).toEqual([{ kind: 'image', url: 'https://drive.example/reel.mp4' }])
  })

  it('no manda nada cuando no hay ni texto ni adjuntos', () => {
    expect(construirEnvioN8n({ id, body: '   ', media: [] }, telefono)).toBeNull()
    expect(construirEnvioN8n({ id, body: null, media: [] }, telefono)).toBeNull()
  })

  it('no manda a medias un adjunto con forma corrupta', () => {
    // Falta la url: preferimos no enviar a enviar un adjunto roto.
    expect(
      construirEnvioN8n({ id, body: 'con foto', media: [{ kind: 'image' }] }, telefono),
    ).toBeNull()
  })
})
