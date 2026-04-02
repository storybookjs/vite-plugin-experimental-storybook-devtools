import { expect, type Page } from '@playwright/test'

export async function enableHighlighting(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterEnable?.()
  })
  await page.waitForTimeout(300)
}

export async function getHighlightIdByComponent(page: Page, componentName: string) {
  return page.evaluate((name) => {
    const registry = (window as any).__componentHighlighterRegistry as
      | Map<string, { id: string; meta?: { componentName?: string } }>
      | undefined

    if (!registry) return null

    const target = Array.from(registry.values()).find(
      (entry) => entry.meta?.componentName === name,
    )

    return target?.id || null
  }, componentName)
}

export async function clickComponentHighlight(page: Page, componentName: string) {
  // Use the test hook to directly select a component by its registry ID,
  // which opens the context menu without needing highlight-all mode.
  const highlightId = await getHighlightIdByComponent(page, componentName)
  expect(highlightId).toBeTruthy()

  const selected = await page.evaluate((id) => {
    return (window as any).__componentHighlighterSelectById?.(id) ?? false
  }, highlightId)

  expect(selected).toBe(true)
  await page.waitForTimeout(300)
}

export async function hoverTaskListHeading(page: Page) {
  const target = page.getByRole('heading', { name: 'All Tasks' })
  const bbox = await target.boundingBox()
  expect(bbox).toBeTruthy()

  await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
  await page.waitForTimeout(250)
}

export async function waitForCreateStoryRequest(page: Page, action: () => Promise<void>) {
  const eventPromise = page.evaluate(() => {
    return new Promise<any>((resolve) => {
      const handler = (event: Event) => {
        const customEvent = event as CustomEvent
        window.removeEventListener(
          'component-highlighter:create-story-request',
          handler,
        )
        resolve(customEvent.detail)
      }

      window.addEventListener('component-highlighter:create-story-request', handler)
    })
  })

  await action()
  return eventPromise
}

export async function exerciseTaskFormInteractions(page: Page) {
  await page.getByLabel('Task Name').fill('Ship highlighter tests')
  await page.getByLabel('Priority').selectOption('high')
  await page.getByLabel('Deadline').fill('Tomorrow')
  await page.getByLabel('Assignee').fill('Yann')
  await page.getByLabel('Status').selectOption('in-progress')
}
