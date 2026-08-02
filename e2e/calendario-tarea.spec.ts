import { entrarComoEstudio } from './sesion'
import { expect, test } from '@playwright/test'

/**
 * Alta rápida de un pendiente desde el calendario, sin pasar por el perfil
 * del cliente.
 *
 * Cubre el caso que motiva la función: el botón "+" de un día abre el modal,
 * y desde ahí se puede escribir un pendiente para uno o varios clientes a la
 * vez.
 */
test('agregar un pendiente para dos clientes desde el día del calendario', async ({
  page,
}, info) => {
  await entrarComoEstudio(page, info)
  await page.goto('/calendario?mes=2026-09')
  await page.waitForLoadState('networkidle')

  await page.getByRole('button', { name: 'Agregar un pendiente el día 20' }).first().click()

  const dialogo = page.getByRole('dialog')
  await expect(dialogo).toBeVisible()

  const guardar = dialogo.getByRole('button', { name: /Guardar/ })
  await expect(guardar).toBeDisabled()

  await dialogo.getByPlaceholder('Escribe el pendiente…').fill('Confirmar catering con el cliente')
  await dialogo.getByRole('checkbox').first().check()
  await dialogo.getByRole('checkbox').nth(1).check()

  await expect(guardar).toHaveText('Guardar para 2')
  await guardar.click()

  await expect(dialogo.getByText('Guardado para 2 clientes.')).toBeVisible()
})
