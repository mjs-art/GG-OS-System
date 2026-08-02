#!/usr/bin/env node
/**
 * Concatena las migraciones en `docs/sql/esquema-completo.sql`.
 *
 * Existe para cuando la CLI de Supabase no está disponible —sin token, sin
 * Docker, o desde una sesión que no puede correr comandos— y hay que pegar el
 * esquema a mano en el editor SQL del panel.
 *
 * NO es la fuente de verdad. Se regenera con `pnpm sql:bundle`; editarlo a
 * mano es tirar el trabajo.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const SALIDA = 'docs/sql/esquema-completo.sql'

const migraciones = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

if (migraciones.length === 0) {
  console.error(`No hay migraciones en ${DIR}`)
  process.exit(1)
}

const versiones = migraciones.map((m) => `('${m.split('_')[0]}')`).join(',\n  ')

const partes = [
  `-- =============================================================================
-- STUDIO OS · ESQUEMA COMPLETO
--
-- Las ${migraciones.length} migraciones concatenadas en orden, para pegar en el editor SQL de
-- Supabase cuando la CLI no esté disponible.
--
-- ESTO ES UN RESPALDO, NO LA FUENTE DE VERDAD.
--
-- La forma correcta de aplicar cambios es la CLI:
--
--     supabase link --project-ref <ref>
--     supabase db push
--
-- Se genera con \`pnpm sql:bundle\`. Si lo editas a mano, la próxima
-- generación se lo lleva.
--
-- CÓMO USARLO
--
--   · Base VACÍA: pega todo de corrido.
--   · Base que YA tiene parte aplicada: NO pegues todo. Revisa antes cuáles
--     faltan con \`supabase migration list\`, o en el panel:
--     Database → Migrations. Pegar una ya aplicada truena en el primer
--     \`create table\` que exista — molesto pero no destructivo, porque
--     ninguna de estas migraciones borra nada.
--   · Después de pegar, corre el INSERT del final o la CLI va a querer
--     aplicarlas otra vez.
--
-- Lo que NO incluye, a propósito:
--   · \`supabase/seed.sql\` — datos FICTICIOS de desarrollo. No van a producción.
--   · La configuración de auth (site_url, redirect URLs, registro cerrado).
--     Vive en el panel, no en SQL.
-- =============================================================================
`,
]

for (const m of migraciones) {
  partes.push(
    `\n\n-- =============================================================================\n` +
      `-- ${m}\n` +
      `-- =============================================================================\n\n`,
    readFileSync(join(DIR, m), 'utf8'),
  )
}

partes.push(`

-- =============================================================================
-- REGISTRO DE MIGRACIONES
--
-- Solo si aplicaste el archivo a mano. Le dice a la CLI que estas versiones ya
-- corrieron; sin esto, el próximo \`db push\` intenta aplicarlas de nuevo.
-- =============================================================================

insert into supabase_migrations.schema_migrations (version) values
  ${versiones}
on conflict (version) do nothing;
`)

mkdirSync('docs/sql', { recursive: true })
writeFileSync(SALIDA, partes.join(''))
console.log(`${SALIDA} · ${migraciones.length} migraciones`)
