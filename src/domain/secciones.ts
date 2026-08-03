/**
 * Las secciones del dashboard de cliente.
 *
 * Vive en su propio módulo y NO dentro del componente de navegación, aunque
 * ahí sea donde más se usa. La razón no es organización: `nav-secciones.tsx`
 * lleva `'use client'`, y cuando un Server Component importa un valor de un
 * módulo de cliente, React le entrega una referencia serializable en lugar del
 * valor. El síntoma es un `SECCIONES.map is not a function` en tiempo de
 * ejecución, en producción, sin que TypeScript diga nada.
 *
 * Regla general: las constantes que cruzan la frontera cliente/servidor viven
 * en un módulo sin directiva.
 */

export interface Seccion {
  id: string
  label: string
  /** Nunca aparece en el modo cliente ni para el resto del equipo. */
  privado?: boolean
}

export const SECCIONES: readonly Seccion[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'redes', label: 'Redes' },
  { id: 'referencias', label: 'Referencias' },
  { id: 'volumen', label: 'Volumen' },
  { id: 'planner', label: 'Planner' },
  { id: 'calendario', label: 'Calendario' },
  { id: 'guiones', label: 'Guiones' },
  { id: 'fechas', label: 'Fechas' },
  { id: 'pauta', label: 'Pauta' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'marca', label: 'Marca' },
  { id: 'archivos', label: 'Archivos' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'privado', label: 'Privado', privado: true },
]
