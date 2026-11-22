import { expect, test, type Page } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'
import {
  toolbarFlyoutItemTestId,
  toolbarFlyoutTestId,
  toolbarToolTestId
} from '#tests/helpers/test-ids'

test.use({ locale: 'en-US' })

/** The tools the toolbar shows, in order: a flyout counts as the tool its button shows. */
function toolbarOrder(page: Page) {
  return page
    .getByTestId('toolbar')
    .locator('button[aria-pressed]')
    .evaluateAll((buttons) =>
      buttons.flatMap((button) => button.getAttribute('data-test-id') ?? [])
    )
}

test('the toolbar hides, reorders and regroups tools from Settings and keeps the layout', async ({
  page
}) => {
  await page.goto('/?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()

  await page.getByTestId('toolbar').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Customize toolbar…' }).click()
  const settings = page.getByTestId('settings-toolbar-panel')
  await expect(settings).toBeVisible()

  await settings.getByRole('switch', { name: 'Show Pen', exact: true }).click()
  await settings.getByRole('switch', { name: 'Show Pencil', exact: true }).click()
  // Dropping Comment onto Hand puts both in one menu; Text's grip moves it with the keyboard.
  await settings
    .getByRole('button', { name: 'Reorder Comment' })
    .dragTo(settings.locator('[data-entry="HAND"]'))
  await settings.getByRole('button', { name: 'Reorder Text' }).press('ArrowUp')
  await page.getByTestId('app-settings-done').click()
  await expect(page.getByTestId('app-settings-dialog')).toBeHidden()

  const expectCustomized = async () => {
    await expect(page.getByTestId(toolbarToolTestId('PEN'))).toHaveCount(0)
    await expect(page.getByTestId(toolbarToolTestId('PENCIL'))).toHaveCount(0)
    expect(await toolbarOrder(page)).toEqual(
      (['SELECT', 'FRAME', 'RECTANGLE', 'TEXT', 'HAND'] as const).map((tool) =>
        toolbarToolTestId(tool)
      )
    )
    await page.getByTestId(toolbarFlyoutTestId('HAND')).click()
    await page.getByTestId(toolbarFlyoutItemTestId('COMMENT')).click()
    await expect(page.getByTestId(toolbarToolTestId('COMMENT'))).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  }
  await expectCustomized()

  await page.reload()
  await canvas.waitForInit()
  await expectCustomized()

  await canvas.pressKey('p')
  expect(await page.evaluate(() => window.openPencil?.getStore?.().state.activeTool)).toBe('PEN')

  await page.getByTestId('toolbar').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Customize toolbar…' }).click()
  await page.getByRole('button', { name: 'Reset to default' }).click()
  // Back at the default layout, the section has nothing left to reset.
  await expect(page.getByRole('button', { name: 'Reset to default' })).toHaveCount(0)
  await page.getByTestId('app-settings-done').click()
  await expect(page.getByTestId(toolbarToolTestId('PEN'))).toBeVisible()
  canvas.assertNoErrors()
})

test('the desktop toolbar stays at the top of the rail across floating position changes', async ({
  page
}) => {
  await page.goto('/?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  const toolbar = page.getByTestId('toolbar')
  const rail = page.locator('[data-tool-rail]').filter({ has: toolbar })
  const customize = page.getByRole('menuitem', { name: 'Customize toolbar…' })
  const settings = page.getByTestId('settings-toolbar-panel')
  const position = settings.getByTestId('settings-toolbar-position')
  const alignment = settings.getByTestId('settings-toolbar-alignment')

  const expectTopLeft = async () => {
    await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical')
    const column = await rail.boundingBox()
    const bar = await toolbar.boundingBox()
    const drawingArea = await canvas.canvas.boundingBox()
    if (!column || !bar || !drawingArea) throw new Error('toolbar or canvas is not laid out')
    expect(bar.y).toBeCloseTo(column.y)
    expect(column.x + column.width).toBeLessThanOrEqual(drawingArea.x)

    const trigger = page.getByTestId(toolbarFlyoutTestId('RECTANGLE'))
    await trigger.click()
    const item = page.getByTestId(toolbarFlyoutItemTestId('ELLIPSE'))
    await expect(item).toBeVisible()
    const option = await item.boundingBox()
    if (!option) throw new Error('flyout is not laid out')
    expect(option.x).toBeGreaterThanOrEqual(column.x + column.width)
    await page.keyboard.press('Escape')
    await expect(item).toBeHidden()
  }
  await expectTopLeft()

  await toolbar.click({ button: 'right' })
  await expect(customize).toBeVisible()
  await expect(page.getByRole('menuitemradio')).toHaveCount(0)
  await customize.click()
  await position.getByRole('button', { name: 'Top', exact: true }).click()
  await alignment.getByRole('button', { name: 'Right', exact: true }).click()
  await page.getByTestId('app-settings-done').click()
  await expect(settings).toBeHidden()
  await expectTopLeft()

  await page.reload()
  await canvas.waitForInit()
  await expectTopLeft()

  await toolbar.click({ button: 'right' })
  await customize.click()
  await expect(position.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(alignment.getByRole('button', { name: 'Right', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await page.getByRole('button', { name: 'Reset to default' }).click()
  await expect(page.getByRole('button', { name: 'Reset to default' })).toHaveCount(0)
  await page.getByTestId('app-settings-done').click()
  await expectTopLeft()
  canvas.assertNoErrors()
})
