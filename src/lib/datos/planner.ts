import 'server-only'

import { type CodeRule, normalizarParamsDeRegla } from '@/domain/brand-rules'
import { urlMostrableDeEnlace } from '@/domain/drive'
import { BUCKET_PIEZAS, rutaDeStorage } from '@/domain/planner'
import type { AssetSource } from '@/lib/datos/clientes'
import { createClient } from '@/lib/supabase/server'
import { addMonths, type MonthKey } from '@/lib/time'

/**
 * Lo que el Planner necesita además de las piezas y las stories.
 *
 * Igual que el resto de `lib/datos`, aquí no se filtra por cliente a mano: lo
 * hace RLS. El `client_id` que sí se manda es para acotar la consulta, no para
 * autorizar — si fuera lo único que separa a un cliente de otro, sobraría la
 * base de datos.
 */

export interface FechaClavePlanner {
  id: string
  /** `2026-09-15`. */
  date: string
  title: string
  kind: string
}

export interface DatosPlanner {
  /** Solo las reglas que se verifican por código. Las de modelo las corre el agente. */
  reglas: CodeRule[]
  fechasClave: FechaClavePlanner[]
}

export async function datosDelPlanner(clientId: string, mes: MonthKey): Promise<DatosPlanner> {
  const supabase = await createClient()

  // El mes viene como 'AAAA-MM' y key_dates guarda fechas, así que el rango se
  // arma con el primer día de este mes y el del siguiente.
  const desde = `${mes}-01`
  const hasta = `${addMonths(mes, 1)}-01`

  const [reglasRes, fechasRes] = await Promise.all([
    supabase
      .from('brand_rules')
      .select('id, rule, severity, check_by, params, active, kind')
      .eq('client_id', clientId)
      .eq('active', true),
    supabase
      .from('key_dates')
      .select('id, date, title, kind')
      .eq('client_id', clientId)
      .gte('date', desde)
      .lt('date', hasta)
      .order('date'),
  ])

  const error = reglasRes.error ?? fechasRes.error
  if (error) throw new Error(`No se pudo leer la configuración del planner: ${error.message}`)

  const reglas = (reglasRes.data ?? [])
    .filter((r) => r.check_by === 'codigo')
    .flatMap((r) => {
      const params = normalizarParamsDeRegla(r.kind, r.params)
      return params ? [{ id: r.id, rule: r.rule, severity: r.severity, params }] : []
    })

  return {
    reglas,
    fechasClave: (fechasRes.data ?? []).map((f) => ({
      id: f.id,
      date: f.date,
      title: f.title,
      kind: f.kind,
    })),
  }
}

/* --- Sprints --------------------------------------------------------------- */

export interface SprintPlanner {
  id: string
  name: string
  /** `AAAA-MM-DD`. */
  startsOn: string
  endsOn: string
}

/**
 * Los sprints son del ORG, no del cliente: un bloque de trabajo del estudio
 * cruza clientes. Por eso el filtro va por `org_id` y no por `client_id`.
 */
export async function listarSprints(orgId: string): Promise<SprintPlanner[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sprints')
    .select('id, name, starts_on, ends_on')
    .eq('org_id', orgId)
    .order('starts_on', { ascending: false })

  if (error) throw new Error(`No se pudieron leer los sprints: ${error.message}`)

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
  }))
}

/* --- Assets ---------------------------------------------------------------- */

/**
 * Dos horas. El bucket es PRIVADO y una URL firmada es una llave suelta: si
 * alguien pega la captura de un tile en un chat, la liga que va adentro deja de
 * servir el mismo día. Dos horas cubren de sobra una sesión de trabajo, y cada
 * navegación o guardado vuelve a firmar.
 */
const VIGENCIA_DE_FIRMA_S = 60 * 60 * 2

export interface PiezaConAsset {
  id: string
  assetUrl: string | null
  assetSource: AssetSource | null
}

/**
 * La URL que el navegador puede pedir, por pieza.
 *
 * Las subidas van a un bucket privado, así que hay que FIRMARLAS aquí, en el
 * servidor. Los enlaces externos se pasan tal cual: ya son públicos por
 * definición y firmarlos no significaría nada.
 *
 * Las firmas se piden todas en una sola llamada. Con treinta piezas al mes,
 * `createSignedUrl` una por una son treinta viajes al Storage antes de pintar
 * el primer tile.
 */
export async function urlsDeAssets(
  piezas: readonly PiezaConAsset[],
): Promise<Record<string, string>> {
  const urls: Record<string, string> = {}
  const rutas: { pieceId: string; ruta: string }[] = []

  for (const pieza of piezas) {
    if (!pieza.assetUrl) continue
    // Un enlace externo se pinta tal cual —salvo Drive, cuyo link de compartir
    // no es una imagen y se cambia por su miniatura. El resto (Canva, Dropbox,
    // una imagen directa) pasa sin tocar.
    if (pieza.assetSource === 'enlace') urls[pieza.id] = urlMostrableDeEnlace(pieza.assetUrl)
    else rutas.push({ pieceId: pieza.id, ruta: rutaDeStorage(pieza.assetUrl) })
  }

  if (rutas.length === 0) return urls

  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(BUCKET_PIEZAS).createSignedUrls(
    rutas.map((r) => r.ruta),
    VIGENCIA_DE_FIRMA_S,
  )

  // Una firma que falla no tira el planner: el tile cae a la placa del pilar y
  // el mes se sigue leyendo. Perder la sección entera por una imagen rota sería
  // mucho peor que perder la imagen.
  if (error || !data) return urls

  const porRuta = new Map(rutas.map((r) => [r.ruta, r.pieceId] as const))
  for (const firma of data) {
    // `path` viene sin diagonal inicial, igual que se mandó.
    const pieceId = firma.path ? porRuta.get(firma.path) : undefined
    if (pieceId && firma.signedUrl && !firma.error) urls[pieceId] = firma.signedUrl
  }

  return urls
}
