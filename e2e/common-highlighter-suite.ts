import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  clickComponentHighlight,
  enableHighlighting,
  exerciseTaskFormInteractions,
  hoverComponent,
  hoverTaskListHeading,
  isHighlightActive,
  locateInstance,
  toggleHighlightVisibility,
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
const MULTI_INSTANCE_COMPONENT = 'Badge'

export function registerCommonHighlighterSuite(test: TestLike) {
  test.describe('common highlighter features', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('button')
      await page.waitForTimeout(800)
      await enableHighlighting(page)
    })

    test('renders highlight container', async ({ page }) => {
      await expect(page.locator('#component-highlighter-container')).toBeVisible()
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
          // Highlights use outline (not border) for strokes
          return (
            style.outlineColor.includes('255, 71, 133') ||
            style.backgroundColor.includes('255, 71, 133')
          )
        })
      })

      expect(hasHoveredHighlight).toBe(true)
    })

    test('hide highlights hides only the selection and keeps hover/select working', async ({ page }) => {
      const boxes = page.locator('#component-highlighter-container div[data-highlight-id]')
      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(boxes).not.toHaveCount(0)

      await toggleHighlightVisibility(page)
      await expect(boxes).toHaveCount(0)
      expect(await isHighlightActive(page)).toBe(true)
      await expect(page.locator('[data-coverage-highlight]')).toHaveCount(0)

      // Hovering a different component (outside the context menu) still
      // draws its hover highlight.
      const headerId = await hoverComponent(page, 'Header')
      await expect(boxes).toHaveCount(1)
      await expect(boxes.first()).toHaveAttribute('data-highlight-id', headerId)

      await toggleHighlightVisibility(page)
      await expect(boxes.count()).resolves.toBeGreaterThan(1)
    })

    test('locate pulses the exact selected instance, not the first match', async ({ page }) => {
      const ids = await page.evaluate((name) => {
        const registry = (window as any).__componentHighlighterRegistry as Map<
          string,
          { id: string; meta: { componentName: string } }
        >
        return Array.from(registry.values())
          .filter((i) => i.meta.componentName === name)
          .map((i) => i.id)
      }, MULTI_INSTANCE_COMPONENT)
      expect(ids.length).toBeGreaterThan(1)

      const { pulse, target, labelOpacity } = await locateInstance(
        page,
        MULTI_INSTANCE_COMPONENT,
        ids[1],
      )
      expect(target).not.toBeNull()
      expect(pulse).toEqual(target)
      expect(labelOpacity).toBe('1')
    })

    test('opens context menu on highlighted component click', async ({ page }) => {
      await clickComponentHighlight(page, TARGET_COMPONENT)

      await expect(page.locator('#open-component-btn')).toBeVisible()
      await expect(page.locator('#save-story-btn')).toBeVisible()
      await expect(page.locator('#story-name-input')).toBeVisible()
      await expect(page.locator('text=Properties')).toBeVisible()
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
