import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'
import { unzipSync } from 'fflate'

import { expect, test } from '#tests/e2e/fixtures'
import { CanvasHelper } from '#tests/helpers/canvas'
import { testPath } from '#tests/helpers/paths'

const chromiumExecutable = process.env.OPENPENCIL_CHROMIUM_EXECUTABLE
if (chromiumExecutable) {
  test.use({ launchOptions: { executablePath: chromiumExecutable } })
}

function documentContent(page: Page) {
  return page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    return [...store.graph.getAllNodes()]
      .map((node) => {
        const type = String(node.type)
        const content = {
          id: node.id,
          type: node.type,
          name: node.name,
          parentId: node.parentId,
          childIds: [...node.childIds],
          visible: node.visible,
          opacity: node.opacity,
          rotation: node.rotation,
          text: typeof Reflect.get(node, 'text') === 'string' ? Reflect.get(node, 'text') : null
        }
        return type === 'PAGE' || type === 'CANVAS'
          ? content
          : { ...content, x: node.x, y: node.y, width: node.width, height: node.height }
      })
      .sort((first, second) => first.id.localeCompare(second.id))
  })
}

test('an older browser Recents entry shows its embedded cover before and after reopening and reloading', async ({
  page
}) => {
  test.setTimeout(45_000)
  const archive = await readFile(testPath('fixtures', 'slots.fig'))
  const expectedCover = unzipSync(archive)['thumbnail.png']

  await page.goto('/?recent-files')
  const home = page.getByTestId('recent-files-home')
  await expect(home).toBeVisible()

  const id = 'browser:older-embedded-cover'
  await page.evaluate(
    async ({ id, name, bytes }) => {
      localStorage.setItem(
        'open-pencil:recent-browser-files',
        JSON.stringify([
          {
            id,
            kind: 'browser',
            name,
            updatedAt: '2026-11-21T12:00:00.000Z',
            documentKind: 'design'
          }
        ])
      )

      const request = indexedDB.open('open-pencil-recent-files', 3)
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result)
        request.onupgradeneeded = () => {
          for (const store of ['handles', 'contents', 'thumbnails']) {
            if (!request.result.objectStoreNames.contains(store)) {
              request.result.createObjectStore(store)
            }
          }
        }
      })
      const transaction = database.transaction(['contents', 'thumbnails'], 'readwrite')
      transaction.objectStore('contents').put(
        {
          bytes: new Blob([new Uint8Array(bytes)]),
          name,
          type: 'application/octet-stream',
          lastModified: Date.now()
        },
        id
      )
      // This is what a record made before covers were cached looks like.
      transaction.objectStore('thumbnails').delete(id)
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error)
        transaction.onabort = () => reject(transaction.error)
      })
      database.close()
    },
    { id, name: 'slots.fig', bytes: new Uint8Array(archive) }
  )

  await page.reload()
  const entry = home.locator('[data-slot="document-entry"]').filter({ hasText: 'slots.fig' })
  const preview = entry.locator('[data-slot="preview"] img')
  await expect(preview).toHaveJSProperty('naturalWidth', 335)
  const displayedBytes = await preview.evaluate(async (image: HTMLImageElement) => {
    const response = await fetch(image.src)
    return Array.from(new Uint8Array(await response.arrayBuffer()))
  })
  expect(Buffer.from(displayedBytes)).toEqual(Buffer.from(expectedCover))

  await entry.locator('[data-slot="trigger"]').click()
  const tab = page.getByTestId('tabbar-tab').filter({ hasText: 'slots' })
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('canvas-element').first()).toHaveAttribute('data-ready', '1')
  await tab.hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()
  await expect(entry.locator('[data-slot="preview"] img')).toBeVisible()

  await page.reload()
  await expect(entry.locator('[data-slot="preview"] img')).toBeVisible()
})

test('browser Recents reopen a picked file after reload and list a successful Save as', async ({
  page
}) => {
  test.setTimeout(45_000)
  // Stand in for the OS dialogs with real, structured-cloneable handles in the test origin.
  await page.addInitScript(() => {
    Reflect.set(globalThis, '__recentTestPickedFolder', 'first')
    window.showOpenFilePicker = async () => {
      const root = await navigator.storage.getDirectory()
      const folder = String(Reflect.get(globalThis, '__recentTestPickedFolder') ?? 'first')
      const dir = await root.getDirectoryHandle(folder)
      return [await dir.getFileHandle('picked.fig')]
    }
    window.showSaveFilePicker = async () => {
      const root = await navigator.storage.getDirectory()
      return root.getFileHandle('saved.fig', { create: true })
    }
  })
  await page.goto('/')
  const home = page.getByTestId('recent-files-home')
  const open = home.getByTestId('home-open-file')
  const recentFiles = home.locator('[data-slot="document-entry"] [data-slot="trigger"]')
  const tabs = page.getByTestId('tabbar-tab')
  const canvas = new CanvasHelper(page)
  const closeCurrent = async () => {
    await tabs.last().hover()
    await page.getByTestId('tabbar-close').last().click()
    await expect(home).toBeVisible()
  }

  await expect(home).toBeVisible()
  const bytes = Array.from(await readFile(testPath('fixtures', 'slots.fig')))
  await page.evaluate(async (contents) => {
    const root = await navigator.storage.getDirectory()
    for (const folder of ['first', 'second']) {
      const dir = await root.getDirectoryHandle(folder, { create: true })
      const handle = await dir.getFileHandle('picked.fig', { create: true })
      const writable = await handle.createWritable()
      await writable.write(new Uint8Array(contents))
      await writable.close()
    }
  }, bytes)

  for (const _attempt of ['first open', 'second open']) {
    await open.click()
    await expect(tabs.last()).toContainText('picked')
    await canvas.waitForInit()
    await closeCurrent()
    await expect(recentFiles).toHaveCount(1)
  }

  await page.evaluate(() => Reflect.set(globalThis, '__recentTestPickedFolder', 'second'))
  await open.click()
  await expect(tabs.last()).toContainText('picked')
  await canvas.waitForInit()
  await closeCurrent()
  await expect(recentFiles).toHaveCount(2)

  await page.reload()
  await expect(recentFiles).toHaveCount(2)
  await recentFiles.first().click()
  await expect(tabs.last()).toContainText('picked')
  await canvas.waitForInit()
  await closeCurrent()

  await home.getByTestId('home-new-design').click()
  await canvas.waitForInit()
  await canvas.drawRect(200, 200, 120, 80)
  const writtenLayer = page.getByTestId('layers-item').filter({ hasText: /\bRectangle\b/ })
  await expect(writtenLayer).toHaveCount(1)
  await page.getByTestId('menubar-file').click()
  await page.getByRole('menuitem', { name: /^Save as/i }).click()
  await expect(tabs.last()).toContainText('saved')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const root = await navigator.storage.getDirectory()
        const handle = await root.getFileHandle('saved.fig')
        return (await handle.getFile()).size
      })
    )
    .toBeGreaterThan(0)
  await closeCurrent()
  await expect(recentFiles.first()).toContainText('saved.fig')
  await page.reload()
  await recentFiles.first().click()
  await expect(tabs.last()).toContainText('saved')
  await expect(writtenLayer).toHaveCount(1)
})

test('browser Recents reopen a handleless File with the same content after reload', async ({
  page
}) => {
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined
  })
  await page.goto('/')
  const home = page.getByTestId('recent-files-home')
  const recent = home.locator('[data-slot="document-entry"] [data-slot="trigger"]').filter({
    hasText: 'slots.fig'
  })
  const tabs = page.getByTestId('tabbar-tab')
  const canvas = new CanvasHelper(page)

  const chooser = page.waitForEvent('filechooser')
  await home.getByTestId('home-open-file').click()
  await (await chooser).setFiles(testPath('fixtures', 'slots.fig'))
  await expect(tabs.last()).toContainText('slots')
  await canvas.waitForInit()
  const original = await documentContent(page)
  const opened = page.getByRole('tab', { name: 'slots', exact: true })
  const pinnedHome = page.getByRole('tab', { name: 'Home', exact: true })
  const originalTab = await opened.getAttribute('id')
  expect(originalTab).toBeTruthy()

  await pinnedHome.click()
  await recent.click()
  await expect(opened).toHaveAttribute('aria-selected', 'true')
  await expect(opened).toHaveAttribute('id', originalTab ?? '')
  await expect(tabs).toHaveCount(2)

  await opened.hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(pinnedHome).toHaveAttribute('aria-selected', 'true')
  await expect(tabs).toHaveCount(1)
  await recent.click()
  await expect(opened).toHaveAttribute('aria-selected', 'true')
  await expect(opened).not.toHaveAttribute('id', originalTab ?? '')
  await expect(tabs).toHaveCount(2)
  await canvas.waitForInit()
  expect(await documentContent(page)).toEqual(original)

  await tabs.last().hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()
  await page.reload()
  await expect(home).toBeVisible()
  await recent.click()
  await canvas.waitForInit()
  expect(await documentContent(page)).toEqual(original)
})

test('a downloaded design reopens from Recents with the same content after reload', async ({
  page
}) => {
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined
    window.showSaveFilePicker = undefined
  })
  await page.goto('/')

  const home = page.getByTestId('recent-files-home')
  const tabs = page.getByTestId('tabbar-tab')
  const canvas = new CanvasHelper(page)

  await home.getByTestId('home-new-design').click()
  await canvas.waitForInit()
  await canvas.drawRect(200, 200, 120, 80)
  await page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    const rectangle = [...store.graph.getAllNodes()].find((node) => node.type === 'RECTANGLE')
    if (!rectangle) throw new Error('Rectangle unavailable')
    store.graph.updateNode(rectangle.id, { name: 'Downloaded marker' })
  })
  const original = await documentContent(page)

  await page.getByTestId('menubar-file').click()
  page.once('dialog', (dialog) => dialog.accept('downloaded.fig'))
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /^Save as/i }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('downloaded.fig')
  await tabs.last().hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()

  const recent = home
    .locator('[data-slot="document-entry"] [data-slot="trigger"]')
    .filter({ hasText: 'downloaded.fig' })
  await expect(recent).toHaveCount(1)
  await recent.click()
  await canvas.waitForInit()
  expect(await documentContent(page)).toEqual(original)

  await tabs.last().hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()
  await page.reload()
  await expect(home).toBeVisible()
  await recent.click()
  await canvas.waitForInit()
  expect(await documentContent(page)).toEqual(original)
})

test('a selected handleless file is recorded before decoding and a failed file is not', async ({
  page
}) => {
  test.setTimeout(45_000)
  await page.addInitScript(() => {
    window.showOpenFilePicker = undefined
  })
  await page.goto('/')

  const home = page.getByTestId('recent-files-home')
  const open = home.getByTestId('home-open-file')
  const recent = home.locator('[data-slot="document-entry"] [data-slot="trigger"]')
  const tabs = page.getByTestId('tabbar-tab')
  const canvas = new CanvasHelper(page)

  const validChooser = page.waitForEvent('filechooser')
  await open.click()
  await (await validChooser).setFiles(testPath('fixtures', 'gold-preview.fig'))
  await expect(tabs.last()).toContainText('gold-preview')
  await expect
    .poll(() => page.evaluate(() => Boolean(window.openPencil?.getStore?.().state.preparation)))
    .toBe(true)
  await tabs.last().hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()
  await expect(recent).toHaveCount(1)

  await recent.click()
  await canvas.waitForInit()
  expect(
    await page.evaluate(
      () => [...(window.openPencil?.getStore?.().graph.getAllNodes() ?? [])].length
    )
  ).toBeGreaterThan(100)

  await tabs.last().hover()
  await page.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()

  const brokenChooser = page.waitForEvent('filechooser')
  await open.click()
  await (
    await brokenChooser
  ).setFiles({
    name: 'broken.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0, 1, 2, 3])
  })
  await expect(page.locator('[data-slot="toast"]').filter({ hasText: 'broken.fig' })).toBeVisible()
  await expect(home).toBeVisible()
  await expect(recent).toHaveCount(1)
})

test('a recovery copy keeps its content in Recents after discarding a later edit and reloading', async ({
  context,
  page
}) => {
  test.setTimeout(45_000)
  await page.goto('/')
  const canvas = new CanvasHelper(page)
  await page.getByTestId('home-new-design').click()
  await canvas.waitForInit()
  await canvas.drawRect(200, 200, 120, 80)
  const original = await documentContent(page)
  const prepared = await page.evaluate(async () => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    await store.persistRecoveryNow()
    return store.getRecoveryId()
  })
  expect(prepared).toBeTruthy()

  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('/')
  const home = reopened.getByTestId('recent-files-home')
  const recovery = reopened.getByTestId('home-recovery')
  await expect(recovery).toBeVisible()
  await recovery.locator('[data-slot="document-entry"] [data-slot="trigger"]').click()
  const restoredCanvas = new CanvasHelper(reopened)
  await restoredCanvas.waitForInit()
  expect(await documentContent(reopened)).toEqual(original)

  await restoredCanvas.drawRect(360, 200, 120, 80)
  await reopened.getByTestId('tabbar-close').last().click()
  const discard = reopened.getByRole('alertdialog', { name: /Save changes to/ })
  await expect(discard).toBeVisible()
  await discard.getByRole('button', { name: 'Don’t Save', exact: true }).click()
  await expect(home).toBeVisible()

  const recent = home
    .locator('[data-slot="document-entry"] [data-slot="trigger"]')
    .filter({ hasText: 'Untitled.fig' })
  await expect(recent).toHaveCount(1)
  await recent.click()
  await restoredCanvas.waitForInit()
  expect(await documentContent(reopened)).toEqual(original)

  await reopened.getByTestId('tabbar-close').last().click()
  await expect(home).toBeVisible()
  await reopened.reload()
  await expect(home).toBeVisible()
  await recent.click()
  await restoredCanvas.waitForInit()
  expect(await documentContent(reopened)).toEqual(original)
})

test.describe('a populated recent files list', () => {
  test.use({
    storageState: async ({ baseURL }, use) => {
      if (!baseURL) throw new Error('Browser test baseURL is required')
      await use({
        cookies: [],
        origins: [
          {
            origin: new URL(baseURL).origin,
            localStorage: [
              {
                name: 'open-pencil:preferences:v1',
                value: JSON.stringify({ version: 1, onboarding: { aiSetup: 'done' } })
              },
              {
                name: 'open-pencil:recent-documents',
                value: JSON.stringify(
                  Array.from({ length: 12 }, (_, index) => ({
                    id: `local:/design-${index}.fig`,
                    kind: 'local',
                    path: `/design-${index}.fig`,
                    name: `Recent design ${index}`,
                    updatedAt: '2026-01-01T00:00:00.000Z'
                  }))
                )
              }
            ]
          }
        ]
      })
    }
  })

  test('a file leaves Recents from its menu, which keeps no clear-all control', async ({
    page
  }) => {
    await page.goto('/?recent-files')
    await page.getByTestId('recent-files-home').waitFor()
    // As in Figma's Recents, the list has no control that clears all of it.
    await expect(
      page.getByTestId('recent-files-home').getByRole('button', { name: /clear/i })
    ).toHaveCount(0)
    const openButton = (name: RegExp) =>
      page.locator('[data-slot="trigger"]').and(page.getByRole('button', { name }))
    const removed = openButton(/Recent design 0\b/)
    await expect(removed).toHaveCount(1)

    await page.getByRole('button', { name: 'Actions for Recent design 0', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Remove from recent', exact: true }).click()
    await expect(removed).toHaveCount(0)
    await expect(openButton(/Recent design 1\b/)).toHaveCount(1)

    await page.reload()
    await page.getByTestId('recent-files-home').waitFor()
    await expect(openButton(/Recent design 1\b/)).toHaveCount(1)
    await expect(removed).toHaveCount(0)

    // The list view offers the same item, from a right-click as well as the ⋯ button.
    await page.getByRole('button', { name: 'List view', exact: true }).click()
    const listed = openButton(/Recent design 1\b/)
    await listed.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Remove from recent', exact: true }).click()
    await expect(listed).toHaveCount(0)
    await expect(openButton(/Recent design 2\b/)).toHaveCount(1)
  })

  test('the recent files limit in General settings updates the list and persists', async ({
    page
  }) => {
    await page.goto('/?recent-files')
    await page.getByTestId('recent-files-home').waitFor()
    // Each file's open button, not its actions menu.
    const documents = page
      .locator('[data-slot="trigger"]')
      .and(page.getByRole('button', { name: /Recent design/ }))
    await expect(documents).toHaveCount(10)

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
    const limit = page.getByRole('combobox', { name: 'Number of recent files' })
    await limit.click()
    await page.getByRole('option', { name: '25', exact: true }).click()
    await page.getByTestId('app-settings-done').click()
    await expect(documents).toHaveCount(12)

    await page.reload()
    await expect(documents).toHaveCount(12)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
    await expect(limit).toHaveText('25')
  })
})

test.describe('on a phone', () => {
  // A touch screen: a narrow desktop window keeps mouse-sized controls and focuses the search.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('keeps the New tab layout usable', async ({ page }) => {
    await page.goto('/?recent-files')

    const search = page.getByLabel('Search files…')
    await expect(search).toBeVisible()
    await expect(search).not.toBeFocused()
    await expect(search).toHaveAttribute('placeholder', 'Search files…')
    await expect(page.getByTestId('home-open-file')).toBeVisible()
    await expect(page.getByTestId('home-new-design')).toBeVisible()
    await expect(page.getByTestId('recent-files-home')).toHaveJSProperty(
      'scrollWidth',
      await page.getByTestId('recent-files-home').evaluate((element) => element.clientWidth)
    )
  })
})

test('a narrow window with a mouse keeps mouse-sized controls and focuses the search', async ({
  page
}) => {
  await page.setViewportSize({ width: 600, height: 800 })
  await page.goto('/?recent-files')

  await expect(page.getByLabel('Search files…')).toBeFocused()
  // Medium buttons, 32 px tall; touch screens get the 36 px large ones.
  expect((await page.getByTestId('home-open-file').boundingBox())?.height).toBe(32)
})

test('keeps Home pinned while creating and closing document tabs', async ({ page }) => {
  await page.goto('/?recent-files')

  const home = page.getByTestId('recent-files-home')
  const tabs = page.getByTestId('tabbar-tab')
  const homeTab = page.getByRole('tab', { name: 'Home', exact: true })
  const designTab = page.getByRole('tab', { name: 'Untitled', exact: true })
  const newFileTab = page.getByRole('tab', { name: 'New file', exact: true })
  const closeButtons = page.getByTestId('tabbar-close')

  await expect(home).toBeVisible()
  await expect(page.getByText('No recent files yet')).toBeVisible()
  await expect(tabs).toHaveCount(1)
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  await expect(closeButtons).toHaveCount(0)

  await home.getByTestId('home-new-design').click()

  await expect(home).toBeHidden()
  await expect(tabs).toHaveCount(2)
  await expect(homeTab).toHaveAttribute('aria-selected', 'false')
  await expect(designTab).toHaveAttribute('aria-selected', 'true')
  await expect(closeButtons).toHaveCount(1)

  await page.getByTestId('tabbar-new').click()

  await expect(home).toBeVisible()
  await expect(tabs).toHaveCount(3)
  await expect(newFileTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('Search files…')).toBeFocused()
  await expect(closeButtons).toHaveCount(2)

  await newFileTab.hover()
  await closeButtons.last().click()
  await expect(newFileTab).toHaveCount(0)
  await expect(designTab).toHaveAttribute('aria-selected', 'true')
  await expect(home).toBeHidden()

  await designTab.hover()
  await closeButtons.click()
  await expect(tabs).toHaveCount(1)
  await expect(homeTab).toHaveAttribute('aria-selected', 'true')
  await expect(home).toBeVisible()
})
