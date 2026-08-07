'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { urlMostrableDeEnlace } from '@/domain/drive'
import {
  assetUrlDeRuta,
  BUCKET_PIEZAS,
  esEnlaceHttp,
  nombreDeArchivoSeguro,
  rutaDeAsset,
  rutaDeStorage,
  rutaPerteneceA,
  TAMANO_MAXIMO_BYTES,
  TIPOS_DE_IMAGEN,
} from '@/domain/planner'
import { createClient } from '@/lib/supabase/server'

/**
 * Las mutaciones del Planner.
 *
 * Todo lo que escribe pasa por aquí y nada por el navegador. Tres cosas que no
 * son negociables en este archivo:
 *
 *   · Zod en el límite. Un tipo de TypeScript no valida nada en runtime, y lo
 *     que llega a un Server Action es lo que el navegador quiso mandar.
 *   · Nunca lanza. Devuelve `{ ok: false, mensaje }` para que la interfaz
 *     pueda REVERTIR el cambio optimista y decir qué pasó. Una excepción sin
 *     atrapar deja el grid mostrando un estado que la base nunca aceptó, y ese
 *     es el peor resultado posible: se ve bien y está mal.
 *   · Los movimientos van por funciones de Postgres, no por varios UPDATE
 *     sueltos. Ver `supabase/migrations/20260803000010_swap_slots.sql`.
 *
 * Nota sobre el archivo: un módulo con `'use server'` solo puede exportar
 * funciones asíncronas. Los tipos que la interfaz necesita viven en `tipos.ts`,
 * que no lleva directiva — la misma razón por la que `domain/secciones.ts`
 * existe aparte del componente de navegación.
 */

export type ResultadoAccion = { ok: true } | { ok: false; mensaje: string }

const uuid = z.uuid()
const slug = z.string().min(1).max(120)

/**
 * `AAAA-MM-DD` y nada más.
 *
 * Se valida con regex y no con un parseo a `Date`: `new Date('2026-13-45')` no
 * truena, se corre de mes en silencio, y una entrega que aparece en febrero
 * porque alguien tecleó 13 no la va a cachar nadie.
 */
const FECHA_ISO = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Se espera una fecha AAAA-MM-DD')

/**
 * Errores de la base que sí sabemos traducir.
 *
 * Los triggers de la migración 0011 levantan excepciones con el UUID adentro
 * ("El responsable 3f2a… no es miembro de la organización"). Eso está bien para
 * el log y es ilegible en un toast: quien lo lee no tiene por qué saber qué es
 * un UUID. Todo lo demás sigue llegando tal cual — inventarle un mensaje bonito
 * a un error que no reconocemos esconde el bug.
 */
const TRADUCCIONES: readonly [RegExp, string][] = [
  [
    /no es miembro de la organizaci/i,
    'Esa persona no es del estudio. Solo puedes asignarle una pieza a alguien de tu equipo.',
  ],
  [/no pertenece a esta organizaci/i, 'Ese sprint es de otro estudio. Elige uno de los tuyos.'],
  [/sprints_org_id_name_key|sprints_org_id_name/i, 'Ya existe un sprint con ese nombre.'],
  [/sprints_rango_valido/i, 'El sprint no puede terminar antes de empezar.'],
  [/pieces_asset_coherente/i, 'La imagen quedó a medias. Recarga el planner e inténtalo otra vez.'],
  [
    /exceeded the maximum allowed size|Payload too large/i,
    'La imagen pesa más de 20 MB. Exporta una versión más ligera.',
  ],
  [/mime type .* is not supported/i, 'Ese archivo no es una imagen que el planner pueda mostrar.'],
]

/**
 * Lo que la base contesta cuando algo sale mal, ya escrito para una persona.
 *
 * El tipo de retorno es la rama de FALLO y no `ResultadoAccion` completo, para
 * que sirva igual en los actions que devuelven algo más rico (la URL firmada,
 * el sprint recién creado) sin un cast en cada llamada.
 */
function fallo(
  error: { message?: string } | null,
  respaldo: string,
): { ok: false; mensaje: string } {
  const mensaje = error?.message?.trim()
  if (!mensaje) return { ok: false, mensaje: respaldo }

  const traduccion = TRADUCCIONES.find(([patron]) => patron.test(mensaje))
  return { ok: false, mensaje: traduccion ? traduccion[1] : mensaje }
}

/** Un error de forma es un bug nuestro, no del usuario. Se dice sin culparlo. */
const DATOS_INVALIDOS =
  'El cambio no se pudo mandar completo. Recarga el planner e inténtalo otra vez.'

function refrescar(cliente: string) {
  revalidatePath(`/cliente/${cliente}`)
}

/* --- Mover piezas ---------------------------------------------------------- */

const entradaIntercambio = z.object({ slug, aId: uuid, bId: uuid })

/**
 * Modo "intercambiar": A y B cambian de fecha y nadie más se mueve.
 *
 * Las dos actualizaciones van en una transacción de Postgres. Con dos UPDATE
 * desde aquí, un fallo entre uno y otro dejaría dos piezas el mismo día.
 */
export async function intercambiarFechas(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaIntercambio.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const supabase = await createClient()
  const { error } = await supabase.rpc('swap_piece_slots', {
    a: parsed.data.aId,
    b: parsed.data.bId,
  })

  if (error) return fallo(error, 'No se pudo intercambiar la fecha de las dos piezas.')

  refrescar(parsed.data.slug)
  return { ok: true }
}

const entradaReacomodo = z.object({
  slug,
  clientId: uuid,
  cambios: z
    .array(
      z.object({
        id: uuid,
        publishAt: z.string().nullable(),
        slotIndex: z.number().int(),
      }),
    )
    .min(1)
    // Un reacomodo que toca el mes entero es señal de un cálculo mal hecho, no
    // de un arrastre. El tope evita convertir un bug en un UPDATE masivo.
    .max(400),
})

/** Modo "insertar y correr": aplica de un jalón los slots que calculó el dominio. */
export async function reacomodarSlots(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaReacomodo.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const supabase = await createClient()
  const { error } = await supabase.rpc('shift_piece_slots', {
    target_client: parsed.data.clientId,
    moves: parsed.data.cambios.map((c) => ({
      id: c.id,
      publish_at: c.publishAt,
      slot_index: c.slotIndex,
    })),
  })

  if (error) return fallo(error, 'No se pudo recorrer el calendario del mes.')

  refrescar(parsed.data.slug)
  return { ok: true }
}

/* --- Editar una pieza ------------------------------------------------------ */

const CAMPOS_DE_TEXTO = ['idea', 'hook', 'script', 'copy_in', 'copy_out', 'cta'] as const

const entradaEdicion = z.object({
  slug,
  pieceId: uuid,
  cambio: z.discriminatedUnion('campo', [
    // Los campos de copy pasan por la función de Postgres: el cambio, la
    // limpieza de la procedencia y el renglón de human_edits viajan juntos.
    z.object({
      campo: z.enum(CAMPOS_DE_TEXTO),
      valor: z.string().max(20_000).nullable(),
    }),
    z.object({
      campo: z.literal('hashtags'),
      valor: z.array(z.string().min(1).max(80)).max(30),
    }),
    // Lo demás no es texto de agente: es estado de trabajo, y se escribe
    // directo con RLS de por medio.
    z.object({
      campo: z.literal('status'),
      valor: z.enum(['idea', 'escrito', 'revisado', 'con_cliente', 'aprobado', 'publicado']),
    }),
    z.object({ campo: z.literal('format'), valor: z.enum(['post', 'carrusel', 'reel']) }),
    z.object({ campo: z.literal('pillar_id'), valor: uuid.nullable() }),
    z.object({
      campo: z.literal('platforms'),
      valor: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'linkedin'])).max(4),
    }),
    z.object({
      campo: z.literal('fecha'),
      valor: z.string().datetime({ offset: true }).nullable(),
      dateLocked: z.boolean(),
    }),
    z.object({ campo: z.literal('asset_status'), valor: z.enum(['pendiente', 'recibido']) }),
    z.object({ campo: z.literal('boosted'), valor: z.boolean() }),
    // Los tres campos que el uso real exige y el diseño de origen no tenía.
    // `due_date` es `date` en la base, no `timestamptz`: la entrega se
    // compromete por día, no por hora.
    z.object({ campo: z.literal('due_date'), valor: FECHA_ISO.nullable() }),
    z.object({ campo: z.literal('assignee_id'), valor: uuid.nullable() }),
    z.object({ campo: z.literal('sprint_id'), valor: uuid.nullable() }),
  ]),
})

export async function editarPieza(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaEdicion.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { pieceId, cambio } = parsed.data
  const supabase = await createClient()

  // Los argumentos van con cadena y arreglo vacíos en vez de null: el generador
  // de tipos de Supabase no sabe que los parámetros de la función aceptan null,
  // y la función ya trata '' como "sin valor" (`nullif`). Mandar '' evita un
  // cast a mano en cada llamada, que es donde se cuela el error.
  if (cambio.campo === 'hashtags') {
    const { error } = await supabase.rpc('edit_piece_field', {
      p_piece: pieceId,
      p_field: 'hashtags',
      p_value: '',
      p_tags: cambio.valor,
    })
    if (error) return fallo(error, 'No se pudieron guardar los hashtags.')
    refrescar(parsed.data.slug)
    return { ok: true }
  }

  if ((CAMPOS_DE_TEXTO as readonly string[]).includes(cambio.campo)) {
    const { error } = await supabase.rpc('edit_piece_field', {
      p_piece: pieceId,
      p_field: cambio.campo,
      p_value: (cambio.valor as string | null) ?? '',
      p_tags: [],
    })
    if (error) return fallo(error, 'No se pudo guardar el cambio.')
    refrescar(parsed.data.slug)
    return { ok: true }
  }

  const parche =
    cambio.campo === 'fecha'
      ? { publish_at: cambio.valor, date_locked: cambio.dateLocked }
      : { [cambio.campo]: cambio.valor }

  const { error, count } = await supabase
    .from('pieces')
    .update(parche, { count: 'exact' })
    .eq('id', pieceId)

  if (error) return fallo(error, 'No se pudo guardar el cambio.')

  // Un UPDATE que RLS filtra no lanza error: afecta cero renglones y regresa en
  // silencio. Sin este conteo, la interfaz diría "guardado" sin haber guardado.
  if (count === 0) return { ok: false, mensaje: PIEZA_FUERA_DE_ALCANCE }

  refrescar(parsed.data.slug)
  return { ok: true }
}

/* --- La imagen de la pieza -------------------------------------------------- */

/**
 * Un UPDATE o un SELECT que RLS filtra no lanza error: devuelve cero renglones
 * en silencio. El mismo mensaje para los dos casos, porque desde afuera son el
 * mismo hecho.
 */
const PIEZA_FUERA_DE_ALCANCE =
  'Esta pieza ya no está en tu cuenta o alguien la borró. Recarga el planner.'

const entradaPrepararSubida = z.object({
  slug,
  pieceId: uuid,
  nombre: z.string().min(1).max(255),
  tipo: z.enum(TIPOS_DE_IMAGEN),
  tamano: z.number().int().positive().max(TAMANO_MAXIMO_BYTES),
})

export type ResultadoSubida =
  { ok: true; ruta: string; token: string } | { ok: false; mensaje: string }

/**
 * Paso 1 de subir una imagen: el servidor decide DÓNDE va y firma el permiso.
 *
 * El archivo sí viaja desde el navegador —es un archivo, no tiene por qué pasar
 * dos veces por nuestro servidor— pero la ruta la calcula aquí y sale firmada
 * en un token de un solo uso. Eso es lo que hace que el navegador no pueda
 * elegir su propia carpeta: en este bucket la ruta ES el permiso, porque las
 * políticas de Storage leen el `client_id` del primer segmento.
 */
export async function prepararSubidaDeAsset(entrada: unknown): Promise<ResultadoSubida> {
  const parsed = entradaPrepararSubida.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const supabase = await createClient()

  // El `client_id` sale de la base, nunca de la petición. Si viniera del
  // navegador, quien lo mandara estaría escogiendo a qué cliente escribirle.
  const { data: pieza, error } = await supabase
    .from('pieces')
    .select('id, client_id')
    .eq('id', parsed.data.pieceId)
    .maybeSingle()

  if (error) return fallo(error, 'No se pudo preparar la subida.')
  if (!pieza) return { ok: false, mensaje: PIEZA_FUERA_DE_ALCANCE }

  const archivo = nombreDeArchivoSeguro(parsed.data.nombre, crypto.randomUUID())
  const ruta = rutaDeAsset(pieza.client_id, pieza.id, archivo)

  const { data, error: errorFirma } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .createSignedUploadUrl(ruta)

  if (errorFirma || !data) {
    return fallo(errorFirma, 'No se pudo preparar la subida de la imagen.')
  }

  return { ok: true, ruta: data.path, token: data.token }
}

export type ResultadoAsset =
  { ok: true; assetUrl: string; url: string | null } | { ok: false; mensaje: string }

const entradaGuardarSubida = z.object({ slug, pieceId: uuid, ruta: z.string().min(1).max(500) })

/**
 * Paso 2: el archivo ya está en el bucket, ahora se registra en la pieza.
 *
 * Se vuelve a verificar que la ruta caiga dentro de la carpeta de esta pieza.
 * El token del paso 1 ya lo garantizaba, pero este action se puede llamar solo
 * y confiar en que el navegador manda de vuelta lo que le dimos es confiar en
 * el navegador.
 */
export async function guardarAssetSubido(entrada: unknown): Promise<ResultadoAsset> {
  const parsed = entradaGuardarSubida.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { slug: cliente, pieceId, ruta } = parsed.data
  const supabase = await createClient()

  const anterior = await leerAsset(supabase, pieceId)
  if (!anterior.ok) return anterior

  if (!rutaPerteneceA(ruta, anterior.clientId, pieceId)) {
    return { ok: false, mensaje: DATOS_INVALIDOS }
  }

  return escribirAsset({
    supabase,
    cliente,
    pieceId,
    anterior,
    nuevo: { assetUrl: assetUrlDeRuta(ruta), assetSource: 'subido' },
  })
}

const entradaEnlace = z.object({ slug, pieceId: uuid, url: z.string().trim().min(1).max(2000) })

/** Pegar un enlace de Canva, Drive o Dropbox. El asset vive allá, no aquí. */
export async function guardarAssetEnlace(entrada: unknown): Promise<ResultadoAsset> {
  const parsed = entradaEnlace.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { slug: cliente, pieceId, url } = parsed.data

  // `javascript:` y `data:` quedan fuera aquí y no en el navegador: la
  // validación del cliente es cortesía, esta es la que cuenta.
  if (!esEnlaceHttp(url)) {
    return {
      ok: false,
      mensaje: 'El enlace tiene que empezar con http:// o https://. Copia la liga para compartir.',
    }
  }

  const supabase = await createClient()
  const anterior = await leerAsset(supabase, pieceId)
  if (!anterior.ok) return anterior

  return escribirAsset({
    supabase,
    cliente,
    pieceId,
    anterior,
    nuevo: { assetUrl: url, assetSource: 'enlace' },
  })
}

const entradaQuitar = z.object({ slug, pieceId: uuid })

export async function quitarAsset(entrada: unknown): Promise<ResultadoAccion> {
  const parsed = entradaQuitar.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { slug: cliente, pieceId } = parsed.data
  const supabase = await createClient()

  const anterior = await leerAsset(supabase, pieceId)
  if (!anterior.ok) return anterior

  const resultado = await escribirAsset({ supabase, cliente, pieceId, anterior, nuevo: null })
  return resultado.ok ? { ok: true } : resultado
}

/* --- Las dos mitades que comparten los tres actions de arriba --------------- */

type ClienteSupabase = Awaited<ReturnType<typeof createClient>>

type AssetActual =
  | { ok: true; clientId: string; assetUrl: string | null; assetSource: string | null }
  | { ok: false; mensaje: string }

async function leerAsset(supabase: ClienteSupabase, pieceId: string): Promise<AssetActual> {
  const { data, error } = await supabase
    .from('pieces')
    .select('client_id, asset_url, asset_source')
    .eq('id', pieceId)
    .maybeSingle()

  if (error) return fallo(error, 'No se pudo leer la pieza.')
  if (!data) return { ok: false, mensaje: PIEZA_FUERA_DE_ALCANCE }

  return {
    ok: true,
    clientId: data.client_id,
    assetUrl: data.asset_url,
    assetSource: data.asset_source,
  }
}

async function escribirAsset({
  supabase,
  cliente,
  pieceId,
  anterior,
  nuevo,
}: {
  supabase: ClienteSupabase
  cliente: string
  pieceId: string
  anterior: Extract<AssetActual, { ok: true }>
  nuevo: { assetUrl: string; assetSource: 'subido' | 'enlace' } | null
}): Promise<ResultadoAsset> {
  // Las dos columnas van SIEMPRE juntas: el CHECK `pieces_asset_coherente` no
  // deja que una diga que hay imagen y la otra que no.
  const { error, count } = await supabase
    .from('pieces')
    .update(
      {
        asset_url: nuevo?.assetUrl ?? null,
        asset_source: nuevo?.assetSource ?? null,
        // El estado del asset deja de ser un campo que alguien palomea a mano
        // en cuanto hay archivo: la verdad ya está en la columna.
        asset_status: nuevo ? 'recibido' : 'pendiente',
      },
      { count: 'exact' },
    )
    .eq('id', pieceId)

  if (error) return fallo(error, 'No se pudo guardar la imagen de la pieza.')
  if (count === 0) return { ok: false, mensaje: PIEZA_FUERA_DE_ALCANCE }

  await borrarSubidaVieja(supabase, anterior, nuevo?.assetUrl ?? null)

  refrescar(cliente)

  if (!nuevo) return { ok: true, assetUrl: '', url: null }
  return { ok: true, assetUrl: nuevo.assetUrl, url: await firmar(supabase, nuevo) }
}

/**
 * El archivo que se reemplaza se borra del bucket.
 *
 * Sin esto, cada "cambiar imagen" deja un huérfano que nadie va a limpiar
 * nunca: no aparece en ninguna pantalla, no lo referencia ninguna fila, y solo
 * se nota cuando alguien mira la factura de Storage dentro de dos años.
 *
 * Va DESPUÉS del UPDATE y su fallo no revierte nada, a propósito. Que la fila
 * quede correcta importa más que el archivo de más; al revés —borrar primero y
 * que el UPDATE falle— dejaría la pieza apuntando a un archivo que ya no está.
 */
async function borrarSubidaVieja(
  supabase: ClienteSupabase,
  anterior: Extract<AssetActual, { ok: true }>,
  nuevaAssetUrl: string | null,
): Promise<void> {
  if (anterior.assetSource !== 'subido' || !anterior.assetUrl) return
  if (anterior.assetUrl === nuevaAssetUrl) return

  const { error } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .remove([rutaDeStorage(anterior.assetUrl)])

  if (error) {
    console.warn(
      `Quedó un archivo huérfano en el bucket piezas: ${rutaDeStorage(anterior.assetUrl)} — ${error.message}`,
    )
  }
}

/** La URL que el navegador sí puede pedir. Los enlaces ya lo son. */
async function firmar(
  supabase: ClienteSupabase,
  nuevo: { assetUrl: string; assetSource: 'subido' | 'enlace' },
): Promise<string | null> {
  // Un enlace de Drive se pinta por su miniatura, no por el link del visor. Se
  // transforma solo para mostrar; lo que se guardó en la pieza es el link crudo.
  if (nuevo.assetSource === 'enlace') return urlMostrableDeEnlace(nuevo.assetUrl)

  const { data } = await supabase.storage
    .from(BUCKET_PIEZAS)
    .createSignedUrl(rutaDeStorage(nuevo.assetUrl), 60 * 60 * 2)

  return data?.signedUrl ?? null
}

/* --- Sprints ---------------------------------------------------------------- */

const entradaSprint = z.object({
  slug,
  orgId: uuid,
  name: z.string().trim().min(1).max(120),
  startsOn: FECHA_ISO,
  endsOn: FECHA_ISO,
})

export type ResultadoSprint =
  | { ok: true; sprint: { id: string; name: string; startsOn: string; endsOn: string } }
  | { ok: false; mensaje: string }

/**
 * Crear un sprint sin salir del drawer.
 *
 * Mandarla a otra pantalla a dar de alta el sprint y regresar es la forma más
 * segura de que el campo se quede vacío para siempre.
 */
export async function crearSprint(entrada: unknown): Promise<ResultadoSprint> {
  const parsed = entradaSprint.safeParse(entrada)
  if (!parsed.success) return { ok: false, mensaje: DATOS_INVALIDOS }

  const { slug: cliente, orgId, name, startsOn, endsOn } = parsed.data

  if (endsOn < startsOn) {
    return { ok: false, mensaje: 'El sprint no puede terminar antes de empezar.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sprints')
    .insert({ org_id: orgId, name, starts_on: startsOn, ends_on: endsOn })
    .select('id, name, starts_on, ends_on')
    .maybeSingle()

  if (error) return fallo(error, 'No se pudo crear el sprint.')

  // Un INSERT que la política de RLS rechaza sí lanza error, pero un SELECT de
  // vuelta que ella filtra devuelve null en silencio. Los dos casos significan
  // lo mismo: el sprint no quedó donde esta persona puede verlo.
  if (!data) {
    return { ok: false, mensaje: 'El sprint no quedó guardado en tu estudio. Recarga la página.' }
  }

  refrescar(cliente)
  return {
    ok: true,
    sprint: { id: data.id, name: data.name, startsOn: data.starts_on, endsOn: data.ends_on },
  }
}
