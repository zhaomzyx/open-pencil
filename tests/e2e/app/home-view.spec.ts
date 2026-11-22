import { expect, test } from '@playwright/test'

test('Home and the editor share one workspace and the document menu returns on reopen', async ({
  page
}) => {
  await page.goto('/')
  const home = page.getByTestId('recent-files-home')
  const homeTab = page.getByRole('tab', { name: 'Home', exact: true })
  const header = page.getByTestId('editor-workspace-menubar')
  const menubar = header.getByRole('menubar')
  const canvas = page.getByTestId('canvas-element').first()

  await expect(home).toBeVisible()
  await expect(header).toBeVisible()
  await expect(canvas).toHaveCount(0)
  await home.getByTestId('home-new-design').click()
  await expect(menubar).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ready', '1')
  await expect(home).toHaveCount(0)

  await homeTab.click()
  await expect(home).toBeVisible()
  await expect(header).toBeVisible()
  await expect(menubar).toHaveCount(0)
  await expect(canvas).toHaveCount(0)

  const documentTab = page.getByRole('tab', { name: 'Untitled' })
  await documentTab.click()
  await expect(menubar).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ready', '1')
  await documentTab.hover()
  await page.getByTestId('tabbar-close').click()
  await expect(home).toBeVisible()
  await expect(canvas).toHaveCount(0)

  await home.getByTestId('home-new-design').click()
  await expect(menubar).toBeVisible()
  await expect(canvas).toHaveAttribute('data-ready', '1')
  await expect(home).toHaveCount(0)
})

for (const width of [390, 1280]) {
  test(`home view selection remains selected and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/?recent-files')
    const home = page.getByTestId('recent-files-home')
    await expect(home).toBeVisible()
    const grid = home.getByRole('button', { name: 'Grid view', exact: true })
    const list = home.getByRole('button', { name: 'List view', exact: true })
    await expect(grid).toHaveCount(1)
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    await grid.click()
    await expect(grid).toHaveAttribute('aria-pressed', 'true')
    await list.click()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
    await page.reload()
    await expect(list).toHaveAttribute('aria-pressed', 'true')
  })
}
