import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

type TestLike = {
  describe: (name: string, fn: () => void) => void
  beforeEach: (fn: (ctx: { page: Page }) => Promise<void>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (name: string, fn: (ctx: { page: Page }) => Promise<void>): any
}

export type CommonSuiteOptions = {
  framework: 'react' | 'vue'
  targetComponent: string
}

async function enableHighlighting(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterEnable?.()
    ;(window as any).__componentHighlighterDraw?.()
    ;(window as any).__componentHighlighterToggle?.()
  })
  await page.waitForTimeout(300)
}

async function getHighlightRef(page: Page, componentName: string) {
  return page.evaluate((name) => {
    const registry = (window as any).__componentHighlighterRegistry as
      | Map<string, { id: string; meta?: { componentName?: string } }>
      | undefined

    if (!registry) return null

    const target = Array.from(registry.values()).find(
      (entry) => entry.meta?.componentName === name,
    )

    if (!target?.id) return null

    return target.id
  }, componentName)
}

async function hoverComponentHighlight(page: Page, _componentName: string) {
  // Turn off highlight-all to validate real hover behavior.
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterToggle?.()
  })

  const target = page.getByRole('heading', { name: 'All Tasks' })
  const bbox = await target.boundingBox()
  expect(bbox).toBeTruthy()

  await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
  await page.waitForTimeout(250)
}

async function clickComponentHighlight(page: Page, componentName: string) {
  const highlightId = await getHighlightRef(page, componentName)
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

export function registerCommonHighlighterSuite(test: TestLike, opts: CommonSuiteOptions) {
  test.describe(`${opts.framework} common highlighter features`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('button')
      await page.waitForTimeout(800)
      await enableHighlighting(page)
    })

    test('renders highlight container and debug overlay', async ({ page }) => {
      await expect(page.locator('#component-highlighter-container')).toBeVisible()
      await expect(page.locator('#component-highlighter-debug')).toBeVisible()
      await expect(page.locator('#component-highlighter-debug')).toContainText('Total components')
      await expect(page.locator('#component-highlighter-debug')).toContainText('Coverage')
    })

    test('shows hover highlight behavior when hovering a component', async ({ page }) => {
      await hoverComponentHighlight(page, opts.targetComponent)

      const hasHoveredHighlight = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll(
            '#component-highlighter-container div[data-highlight-id]',
          ),
        ) as HTMLElement[]

        return els.some((el) => {
          const style = window.getComputedStyle(el)
          return (
            style.borderColor.includes('255, 71, 133') ||
            style.backgroundColor.includes('255, 71, 133')
          )
        })
      })

      expect(hasHoveredHighlight).toBe(true)
    })

    test('opens context menu on highlighted component click', async ({ page }) => {
      await clickComponentHighlight(page, opts.targetComponent)

      await expect(page.locator('#open-component-btn')).toBeVisible()
      await expect(page.locator('#save-story-btn')).toBeVisible()
      await expect(page.locator('#story-name-input')).toBeVisible()
      await expect(page.locator('text=Props:')).toBeVisible()
    })

    test('supports context menu close interactions', async ({ page }) => {
      await clickComponentHighlight(page, opts.targetComponent)
      await expect(page.locator('#save-story-btn')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.locator('#save-story-btn')).not.toBeVisible()

      await clickComponentHighlight(page, opts.targetComponent)
      await expect(page.locator('#save-story-btn')).toBeVisible()
      await page.mouse.click(10, 10)
      await expect(page.locator('#save-story-btn')).not.toBeVisible()
    })

    test('save story button transitions to saving state', async ({ page }) => {
      await clickComponentHighlight(page, opts.targetComponent)
      await page.locator('#save-story-btn').click()
      await expect(page.locator('#save-story-btn')).toContainText('Saving...')
      await expect(page.locator('#save-story-btn')).toBeDisabled()
    })
  })
}
