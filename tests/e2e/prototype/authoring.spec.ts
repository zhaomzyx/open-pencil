import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import { layerDriver } from '#tests/helpers/canvas/layers'
import { pageScene, showView } from '#tests/helpers/canvas/page-scene'
import type * as InventoryScene from '#tests/helpers/canvas/prototype/scene'

test('dragging to a frame adds an undoable action before a numeric condition', async ({ page }) => {
  test.slow()
  await page.goto('/?test&no-rulers')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  const ids = await pageScene<typeof InventoryScene>(
    () => page,
    '/tests/helpers/canvas/prototype/scene.ts'
  ).build('createInventory', false)
  const layers = layerDriver(() => page)
  await showView(page, { zoom: 0.65, panX: 12, panY: 45 })
  await layers.select([ids.potion])
  await page.getByRole('tab', { name: 'Prototype' }).click()
  const connector = page.getByTestId('prototype-connector')
  const destination = await layers.screenCenter('Potion details')
  await connector.dragTo(canvas.canvas, { targetPosition: destination })
  const inspector = page.getByTestId('prototype-panel')
  const frame = inspector.getByRole('combobox', { name: 'Destination frame' })
  await expect(frame).toHaveText('Potion details')
  await page.getByTestId('menubar-edit').click()
  await page.getByRole('menuitem', { name: /^Undo/ }).click()
  await expect(frame).toHaveCount(0)
  await page.getByTestId('menubar-edit').click()
  await page.getByRole('menuitem', { name: /^Redo/ }).click()
  await expect(frame).toHaveText('Potion details')
  await inspector.getByRole('combobox', { name: 'Add action' }).click()
  await page.getByRole('option', { name: 'If number' }).click()
  await inspector.getByRole('combobox', { name: 'Number variable' }).click()
  await page.getByRole('option', { name: 'Potion stock' }).click()
  const condition = inspector.getByRole('listitem').filter({ hasText: 'If number' })
  await condition.getByRole('combobox', { name: 'Add action' }).click()
  await page.getByRole('option', { name: 'Add to number' }).click()
  await condition.getByRole('combobox', { name: 'Number variable' }).last().click()
  await page.getByRole('option', { name: 'Potion stock' }).click()
  await expect(condition.getByRole('listitem')).toContainText('Add to number')
  await condition.getByRole('button', { name: 'Move action up' }).first().click()
  await expect(inspector.getByRole('listitem').first()).toContainText('1. If number')
})
