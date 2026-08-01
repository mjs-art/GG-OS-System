'use client'

import { useEffect } from 'react'

/**
 * Marca `<body data-hidratado="1">` cuando React terminó de hidratar.
 *
 * Existe por las pruebas de extremo a extremo, y vale la pena explicar por qué
 * no es una trampa.
 *
 * En una app con Server Components, el HTML llega y se pinta mucho antes de
 * que el JavaScript tome control. Un click en ese hueco no dispara el handler
 * de React: hace un submit nativo. Playwright es más rápido que un humano y
 * cae en ese hueco de forma consistente en WebKit, que hidrata más lento.
 *
 * Sin esta marca la prueba se vuelve intermitente, y una prueba intermitente
 * se termina borrando en vez de arreglando. Con ella, la espera es de una
 * condición real y no de un `sleep` inventado.
 *
 * En producción cuesta un atributo en el body. También sirve para depurar
 * problemas de hidratación desde las herramientas del navegador.
 */
export function HydrationMarker() {
  useEffect(() => {
    document.body.dataset['hidratado'] = '1'
    return () => {
      delete document.body.dataset['hidratado']
    }
  }, [])

  return null
}
