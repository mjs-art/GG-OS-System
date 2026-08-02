import { entrarComoEstudio } from './sesion'
import { expect, test } from '@playwright/test'

/**
 * El login de verdad, de punta a punta.
 *
 * No usa la API de admin para generar el link: eso produce un link de flujo
 * implícito (token en el fragmento) que NO es el que recibe un usuario real, y
 * probarlo así daría un falso negativo. Aquí se llena el formulario, se saca el
 * correo de Mailpit y se abre ese link en el MISMO contexto de navegador —
 * que es lo que importa, porque el verificador de PKCE vive en una cookie de
 * ese contexto.
 *
 * Es la prueba más valiosa del repo: si el login se rompe, no hay app.
 */

test('el magic link deja la sesión abierta', async ({ page }, info) => {
  await entrarComoEstudio(page, info)

  await expect(page).not.toHaveURL(/\/entrar/)
  await expect(page).not.toHaveURL(/link_invalido/)
})

test('con sesión, las pantallas del estudio cargan de verdad', async ({ page }, info) => {
  await entrarComoEstudio(page, info)

  await page.goto('/clientes')
  await expect(page.getByRole('heading', { name: 'Clientes', level: 1 })).toBeVisible()
  // Que exista el cliente del seed prueba que RLS le da acceso a Ana.
  await expect(page.getByText('Bar Ficticio')).toBeVisible()

  await page.goto('/calendario?mes=2026-09')
  await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeVisible()

  await page.goto('/cliente/bar-ficticio?mes=2026-09')
  await expect(page.getByRole('heading', { name: 'Bar Ficticio', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resumen', level: 2 })).toBeVisible()
})
