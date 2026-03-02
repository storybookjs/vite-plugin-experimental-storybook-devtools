import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  clickComponentHighlight,
  enableHighlighting,
  exerciseTaskFormInteractions,
  hoverTaskListHeading,
  waitForCreateStoryRequest,
} from './highlighter-helpers'

type TestLike = {
  describe: (name: string, fn: () => void) => void
  beforeEach: (fn: (ctx: { page: Page }) => Promise<void>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (name: string, fn: (ctx: { page: Page }) => Promise<void>): any
}

const TARGET_COMPONENT = 'TaskList'
const INTERACTION_COMPONENT = 'TaskForm'

export function registerCommonHighlighterSuite(test: TestLike) {
  test.describe('common highlighter features', () => {
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
      await hoverTaskListHeading(page)

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
      await clickComponentHighlight(page, TARGET_COMPONENT)

      await expect(page.locator('#open-component-btn')).toBeVisible()
      await expect(page.locator('#save-story-btn')).toBeVisible()
      await expect(page.locator('#story-name-input')).toBeVisible()
      await expect(page.locator('text=Props:')).toBeVisible()
    })

    test('supports context menu close interactions', async ({ page }) => {
      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(page.locator('#save-story-btn')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.locator('#save-story-btn')).not.toBeVisible()

      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(page.locator('#save-story-btn')).toBeVisible()
      await page.mouse.click(10, 10)
      await expect(page.locator('#save-story-btn')).not.toBeVisible()
    })

    test('save story emits create-story request with serialized props', async ({ page }) => {
      await clickComponentHighlight(page, TARGET_COMPONENT)

      const payload = await waitForCreateStoryRequest(page, async () => {
        await page.locator('#story-name-input').fill('E2ESaveStory')
        await page.locator('#save-story-btn').click()
      })

      expect(payload.meta.componentName).toBe(TARGET_COMPONENT)
      expect(payload.storyName).toBe('E2ESaveStory')
      expect(payload.serializedProps).toBeTruthy()
      expect(payload.includePlayFunction).toBe(false)
    })

    test('save story with interactions captures TaskForm interactions', async ({ page }) => {
      await page.getByRole('button', { name: '+ New Task' }).click()
      await page.waitForTimeout(250)

      await clickComponentHighlight(page, INTERACTION_COMPONENT)
      await page.locator('#save-story-with-interactions-btn').click()

      await expect(page.locator('#component-highlighter-recording-indicator')).toBeVisible()

      await exerciseTaskFormInteractions(page)

      const payload = await waitForCreateStoryRequest(page, async () => {
        await page.locator('#recording-stop-btn').click()
      })

      expect(payload.meta.componentName).toBe(INTERACTION_COMPONENT)
      expect(payload.includePlayFunction).toBe(true)
      expect(Array.isArray(payload.playFunction)).toBe(true)
      expect(payload.playFunction.length).toBeGreaterThan(0)
    })
  })
}
