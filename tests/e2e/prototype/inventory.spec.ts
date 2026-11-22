import { expect, test as base, type Locator, type Page } from '@playwright/test'

import { DEADLINE_MS } from '@open-pencil/std/timing'

import { CanvasHelper } from '#tests/helpers/canvas'
import { layerDriver } from '#tests/helpers/canvas/layers'
import { pageScene } from '#tests/helpers/canvas/page-scene'
import type * as InventoryScene from '#tests/helpers/canvas/prototype/scene'
import { getFirstSelectedNodeId, hasNode } from '#tests/helpers/code-panel'
import { toolbarToolTestId } from '#tests/helpers/test-ids'

const test = base.extend({
  page: [
    async ({ page }, use) => {
      await page.goto('/?test&no-rulers')
      await new CanvasHelper(page).waitForInit()
      await use(page)
    },
    { scope: 'test', timeout: DEADLINE_MS.slowRequest }
  ]
})

function openInventory(page: Page, wireStart = true) {
  return pageScene<typeof InventoryScene>(
    () => page,
    '/tests/helpers/canvas/prototype/scene.ts'
  ).build('createInventory', wireStart)
}

function action(scope: Page | Locator, name: string) {
  return scope.getByRole('button', { name, exact: true })
}

function projected(scope: Page | Locator, id: string) {
  return scope.locator(`[data-prototype-source="${id}"]`)
}

async function enterDetails(scope: Page | Locator) {
  await action(scope, 'Select potion').click()
  await expect(action(scope, 'Discard')).toBeVisible()
}

async function dismissDiscard(scope: Page | Locator, confirm: boolean) {
  await action(scope, 'Discard').click()
  const decision = action(scope, confirm ? 'Confirm discard' : 'Cancel')
  await decision.click()
  await expect(decision).toHaveCount(0)
}

test('plays original frames, checks stock, closes the overlay and resets from the start', async ({
  page
}) => {
  const ids = await openInventory(page)
  await page.getByTestId('editor-start-preview').click()
  await expect(page.locator('[data-prototype-screen]')).toHaveCount(1)
  await expect(page.locator(`[data-prototype-screen="${ids.inventory}"]`)).toBeVisible()
  await enterDetails(page)
  const count = projected(page, ids.count)
  await expect(count).toHaveText('3')
  const discard = action(page, 'Discard')
  await discard.focus()
  await page.keyboard.press('Enter')
  const cancel = action(page, 'Cancel')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cancel).toHaveCount(0)
  await expect(discard).toBeFocused()
  await expect(count).toHaveText('3')
  // Once empty, the condition skips the decrement but the following close still runs.
  for (const remaining of ['2', '1', '0', '0']) {
    await dismissDiscard(page, true)
    await expect(count).toHaveText(remaining)
  }
  await action(page, 'Return to backpack').click()
  await enterDetails(page)
  await expect(count).toHaveText('0')
  await page.locator('[data-property="preview-reset"]').click()
  await enterDetails(page)
  await expect(count).toHaveText('3')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-prototype-screen]')).toHaveCount(0)
})

test('two views can play the same original inventory independently', async ({ page }) => {
  const ids = await openInventory(page)
  await page.getByRole('menuitem', { name: 'View', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Split right' }).click()
  const panes = page.locator('[data-active-pane]')
  const left = panes.nth(0)
  const right = panes.nth(1)
  await page.getByTestId('editor-start-preview').click()
  await enterDetails(right)
  await dismissDiscard(right, true)
  await left.click({ position: { x: 30, y: 80 } })
  await page.getByTestId('editor-start-preview').click()
  await enterDetails(left)
  await expect(projected(left, ids.count)).toHaveText('3')
  await expect(projected(right, ids.count)).toHaveText('2')
  await action(left, 'Discard').click()
  await expect(action(left, 'Confirm discard')).toBeVisible()
  await expect(action(right, 'Confirm discard')).toHaveCount(0)
})

test('an overlay comment returns to the original layer and its interaction summary', async ({
  page
}) => {
  const ids = await openInventory(page)
  await page.getByTestId('editor-start-preview').click()
  await enterDetails(page)
  await action(page, 'Discard').click()
  await page.getByTestId('prototype-comment').click()
  await projected(page, ids.confirm).click({ position: { x: 2, y: 2 } })
  const composer = page.getByRole('textbox', { name: 'Add a comment' })
  await composer.fill('Check the discard quantity before release.')
  await composer.press('Enter')
  await expect(page.locator('[data-slot="comment-thread"]')).toContainText(
    'Check the discard quantity'
  )
  await expect.poll(() => getFirstSelectedNodeId(page)).toBe(ids.confirm)
  await page.keyboard.press('Escape')
  await page.getByTestId('properties-tab-code').click()
  const summary = page.getByTestId('prototype-summary')
  await expect(summary).toContainText('Potion stock')
  await expect(summary).toContainText('closeOverlay')

  await page.getByTestId('properties-tab-design').click()
  await page.keyboard.press('Backspace')
  await expect.poll(() => hasNode(page, ids.confirm)).toBe(false)
  await page.getByTestId(toolbarToolTestId('COMMENT')).click()
  await page
    .locator('[data-slot="comment-list-item"]')
    .filter({ hasText: 'Check the discard quantity' })
    .click()
  await expect(page.locator('[data-slot="comment-thread"]')).toContainText(
    'Check the discard quantity'
  )
  await expect.poll(() => getFirstSelectedNodeId(page)).toBeNull()
})

test('authors a destination on an original layer and plays it again from a saved file', async ({
  page
}, testInfo) => {
  const ids = await openInventory(page, false)
  const layers = layerDriver(() => page)
  await layers.select([ids.inventory])
  await page.getByTestId('properties-tab-prototype').click()
  await page.getByRole('checkbox', { name: 'Starting frame' }).check()
  await layers.select([ids.potion])
  await page.getByRole('combobox', { name: 'Add action' }).click()
  await page.getByRole('option', { name: 'Navigate to' }).click()
  await page.getByRole('combobox', { name: 'Destination frame' }).click()
  await page.getByRole('option', { name: 'Potion details' }).click()
  await page.getByTestId('editor-start-preview').click()
  await enterDetails(page)
  await dismissDiscard(page, true)
  await expect(projected(page, ids.count)).toHaveText('2')
  await page.keyboard.press('Escape')

  await page.evaluate(() => {
    window.showSaveFilePicker = undefined
  })
  page.once('dialog', (prompt) => prompt.accept('Inventory review.fig'))
  const download = page.waitForEvent('download')
  await page.getByTestId('menubar-file').click()
  await page.getByRole('menuitem', { name: 'Save As…' }).click()
  const file = testInfo.outputPath('Inventory review.fig')
  await (await download).saveAs(file)
  await page.getByTestId('tabbar-close').click()
  await expect(page.getByTestId('recent-files-home')).toBeVisible()

  await page.evaluate(() => {
    window.showOpenFilePicker = undefined
  })
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('home-open-file').click()
  await (await chooser).setFiles(file)
  await expect(page.getByRole('treeitem').filter({ hasText: 'Backpack' })).toBeVisible()
  await page.getByTestId('editor-start-preview').click()
  await enterDetails(page)
  const screen = page.locator('[data-prototype-screen]')
  await expect(screen.getByText('3', { exact: true })).toBeVisible()
  await dismissDiscard(page, true)
  await expect(screen.getByText('2', { exact: true })).toBeVisible()
})
