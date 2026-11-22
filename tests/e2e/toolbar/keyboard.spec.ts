import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('toolbar arrows move focus without selecting a tool', async ({ page }) => {
  await page.goto('/?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  const toolbar = page.getByTestId('toolbar')
  await expect(toolbar).toHaveAttribute('role', 'toolbar')
  await expect(toolbar).toHaveAttribute('aria-orientation', 'vertical')
  const buttons = toolbar.getByRole('button')
  const first = buttons.first()
  const second = buttons.nth(1)
  await first.focus()
  const previousTool = await page.evaluate(() => window.openPencil?.getStore?.().state.activeTool)
  await first.press('ArrowDown')
  await expect(second).toBeFocused()
  await second.press('ArrowUp')
  await expect(first).toBeFocused()
  expect(await page.evaluate(() => window.openPencil?.getStore?.().state.activeTool)).toBe(
    previousTool
  )
  await first.press('End')
  await expect(buttons.last()).toBeFocused()
  await buttons.last().press('Home')
  await expect(first).toBeFocused()
  canvas.assertNoErrors()
})
