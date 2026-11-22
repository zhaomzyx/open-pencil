import { expectDefined } from '@open-pencil/test-support/assert'

import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'
const editor = useEditorSetup('/?test')

test('the layers and properties share a resizable dock on the right', async () => {
  const panel = editor.page.getByTestId('layers-panel')
  const before = await panel.boundingBox()
  expect(before).not.toBeNull()

  const properties = expectDefined(
    await editor.page.getByTestId('properties-panel').boundingBox(),
    'properties bounds'
  )
  const layers = expectDefined(before, 'layer bounds')
  expect(layers.x).toBeCloseTo(properties.x, 0)
  expect(layers.y).toBeGreaterThanOrEqual(properties.y + properties.height - 1)
  const handle = editor.page.getByTestId('right-splitter-handle')
  const handleBox = await handle.boundingBox()
  expect(handleBox).not.toBeNull()

  const handleBounds = expectDefined(handleBox, 'splitter handle bounds')
  const beforeBounds = expectDefined(before, 'layers panel bounds')
  const cx = handleBounds.x + handleBounds.width / 2
  const cy = handleBounds.y + handleBounds.height / 2

  await editor.page.mouse.move(cx, cy)
  await editor.page.mouse.down()
  await editor.page.mouse.move(cx - 80, cy, { steps: 10 })
  await editor.page.mouse.up()
  await editor.canvas.waitForRender()

  const after = expectDefined(await panel.boundingBox(), 'resized layers panel bounds')
  expect(after.width).toBeGreaterThan(beforeBounds.width + 40)
  editor.canvas.assertNoErrors()
})

test('panel width persists after page reload', async () => {
  // Allow Reka's auto-save debounce to flush before recording the width
  await editor.page.waitForTimeout(300)
  const recordedWidth = expectDefined(
    await editor.page.getByTestId('layers-panel').boundingBox(),
    'persisted layers panel bounds'
  ).width

  await editor.page.reload()
  await editor.canvas.waitForInit()

  const after = expectDefined(
    await editor.page.getByTestId('layers-panel').boundingBox(),
    'reloaded layers panel bounds'
  )
  expect(Math.abs(after.width - recordedWidth)).toBeLessThanOrEqual(2)
  editor.canvas.assertNoErrors()
})

test('a panel floats, keeps its position on reload, and docks back on the right', async () => {
  const { page } = editor
  const panel = page.getByTestId('workspace-panel-layers')
  const handle = page.getByTestId('workspace-panel-drag-layers')
  const dock = page.getByTestId('workspace-panel-dock')
  await expect(panel).toHaveAttribute('data-placement', 'docked')

  async function dragPanel(x: number, y: number) {
    const box = expectDefined(await handle.boundingBox(), 'panel drag handle bounds')
    await page.mouse.move(box.x + 12, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 8 })
    await page.mouse.up()
  }

  await dragPanel(340, 210)
  await expect(panel).toHaveAttribute('data-placement', 'floating')
  await expect(panel.getByTestId('layers-tree')).toBeVisible()
  const floating = expectDefined(await panel.boundingBox(), 'floating panel bounds')

  await page.reload()
  await editor.canvas.waitForInit()
  await expect(panel).toHaveAttribute('data-placement', 'floating')
  await expect.poll(async () => (await panel.boundingBox())?.x).toBeCloseTo(floating.x, 0)
  await expect.poll(async () => (await panel.boundingBox())?.y).toBeCloseTo(floating.y, 0)

  const drop = expectDefined(await dock.boundingBox(), 'panel dock bounds')
  await dragPanel(drop.x + drop.width / 2, drop.y + drop.height / 4)
  await expect(dock.getByTestId('workspace-panel-layers')).toHaveAttribute(
    'data-placement',
    'docked'
  )
  const properties = expectDefined(
    await page.getByTestId('workspace-panel-properties').boundingBox(),
    'properties bounds'
  )
  const layers = expectDefined(await panel.boundingBox(), 'docked layers bounds')
  expect(layers.y).toBeLessThan(properties.y)
  editor.canvas.assertNoErrors()
})

/** Marks the canvases on screen, so a later check can tell whether they are the same elements. */
async function markCanvases() {
  return editor.page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas[data-ready="1"]')]
    for (const canvas of canvases) canvas.setAttribute('data-test-kept', '')
    return canvases.length
  })
}

/** The canvases on screen now, and how many of them are the ones marked earlier. */
async function keptCanvases() {
  return editor.page.evaluate(() => ({
    total: document.querySelectorAll('canvas[data-ready="1"]').length,
    kept: document.querySelectorAll('canvas[data-ready="1"][data-test-kept]').length
  }))
}

// Hiding and showing the panels keeps the canvas, with its drawing surfaces, rather than
// starting a new one, which costs every WebGL context it holds.
test('Cmd+Backslash hides panels and keeps the canvas', async () => {
  const shown = await markCanvases()
  await editor.page.keyboard.press('ControlOrMeta+\\')
  await editor.canvas.waitForRender()

  await expect(editor.page.getByTestId('layers-panel')).not.toBeVisible()
  expect(await keptCanvases()).toEqual({ total: shown, kept: shown })
  editor.canvas.assertNoErrors()
})

test('Cmd+Backslash shows panels again and keeps the canvas', async () => {
  const hidden = await markCanvases()
  await editor.page.keyboard.press('ControlOrMeta+\\')
  await editor.canvas.waitForRender()

  await expect(editor.page.getByTestId('layers-panel')).toBeVisible()
  expect(await keptCanvases()).toEqual({ total: hidden, kept: hidden })
  editor.canvas.assertNoErrors()
})

// The right panel opens at one width on any window, rather than as a share that grows with it.
test('the properties panel reopens at one width on a narrow and a wide window', async ({
  browser,
  baseURL
}) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    const panel = page.getByTestId('properties-panel')
    const panelWidth = async () =>
      expectDefined(await panel.boundingBox(), 'properties panel bounds').width

    await page.goto('/?test')
    await expect(panel).toBeVisible()
    const narrow = await panelWidth()
    expect(narrow).toBeGreaterThan(240)
    expect(narrow).toBeLessThan(270)

    // Neither pressing a handle without moving it nor hiding and showing the panels resizes them.
    const handle = expectDefined(
      await page.getByTestId('right-splitter-handle').boundingBox(),
      'right splitter handle bounds'
    )
    await page.mouse.click(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.keyboard.press('ControlOrMeta+\\')
    await page.keyboard.press('ControlOrMeta+\\')
    await expect(panel).toBeVisible()

    // A fixed width is a repeating share of 1920 px; saved, it would reopen narrower at 1280 px.
    for (const width of [1920, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.reload()
      await expect(panel).toBeVisible()
      expect(Math.abs((await panelWidth()) - narrow)).toBeLessThanOrEqual(1)
    }
  } finally {
    await context.close()
  }
})

test('a keyboard resize survives a reload and hiding the panels', async () => {
  const panel = editor.page.getByTestId('layers-panel')
  const panelWidth = async () =>
    expectDefined(await panel.boundingBox(), 'layers panel bounds').width
  const before = await panelWidth()

  await editor.page.getByTestId('right-splitter-handle').focus()
  await editor.page.keyboard.press('ArrowLeft')
  const resized = await panelWidth()
  expect(resized).toBeGreaterThan(before + 2)

  await editor.page.reload()
  await editor.canvas.waitForInit()
  expect(Math.abs((await panelWidth()) - resized)).toBeLessThanOrEqual(1)

  await editor.page.keyboard.press('ControlOrMeta+\\')
  await editor.page.keyboard.press('ControlOrMeta+\\')
  await expect(panel).toBeVisible()
  expect(Math.abs((await panelWidth()) - resized)).toBeLessThanOrEqual(1)
  editor.canvas.assertNoErrors()
})
