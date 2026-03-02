import { expect, type Page } from '@playwright/test'

export async function enableHighlighting(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterEnable?.()
    ;(window as any).__componentHighlighterDraw?.()
    ;(window as any).__componentHighlighterToggle?.()
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
  const highlightId = await getHighlightIdByComponent(page, componentName)
  expect(highlightId).toBeTruthy()

  const clicked = await page.evaluate((id) => {
    const el = document.querySelector(
      `#component-highlighter-container div[data-highlight-id="${id}"]`,
    ) as HTMLElement | null
    if (!el) return false

    const rect = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    )

    return true
  }, highlightId)

  expect(clicked).toBe(true)
  await page.waitForTimeout(300)
}

export async function hoverTaskListHeading(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterToggle?.()
  })

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
