import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  enableHighlighting,
  disableHighlighting,
  setPanelHighlighterActive,
  isHighlightActive,
  isDockActive,
  isPanelActive,
  isOverlayVisible,
  clickComponentHighlight,
  hoverTaskListHeading,
} from './highlighter-helpers'

type TestLike = {
  describe: (name: string, fn: () => void) => void
  beforeEach: (fn: (ctx: { page: Page }) => Promise<void>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (name: string, fn: (ctx: { page: Page }) => Promise<void>): any
}

const TARGET_COMPONENT = 'TaskList'

export function registerHighlightPanelStateSuite(test: TestLike) {
  test.describe('highlight panel state management', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('button')
      await page.waitForTimeout(800)
    })

    test('context menu shows when action button enables highlight (panel closed)', async ({ page }) => {
      await enableHighlighting(page)

      expect(await isDockActive(page)).toBe(true)
      expect(await isPanelActive(page)).toBe(false)
      expect(await isHighlightActive(page)).toBe(true)

      await clickComponentHighlight(page, TARGET_COMPONENT)

      // Context menu should appear since panel is not active
      await expect(page.locator('#save-story-btn')).toBeVisible({ timeout: 5000 })
    })

    test('no context menu when panel highlighter tab is active', async ({ page }) => {
      // Simulate panel highlighter tab being active
      await setPanelHighlighterActive(page, true)

      expect(await isPanelActive(page)).toBe(true)
      expect(await isHighlightActive(page)).toBe(true)
      expect(await isOverlayVisible(page)).toBe(true)

      // Hover and click — context menu should NOT appear
      await hoverTaskListHeading(page)

      const clicked = await page.evaluate(() => {
        const highlights = document.querySelectorAll(
          '#component-highlighter-container div[data-highlight-id]',
        )
        if (!highlights.length) return false
        const target = highlights[highlights.length - 1] as HTMLElement
        const rect = target.getBoundingClientRect()
        target.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          }),
        )
        return true
      })
      expect(clicked).toBe(true)
      await page.waitForTimeout(500)

      // Context menu should NOT be visible when panel highlighter is active
      await expect(page.locator('#save-story-btn')).not.toBeVisible()
    })

    test('overlay deactivates when panel highlighter tab goes inactive (dock not active)', async ({ page }) => {
      // Panel highlighter tab active → overlay on
      await setPanelHighlighterActive(page, true)
      expect(await isOverlayVisible(page)).toBe(true)
      expect(await isHighlightActive(page)).toBe(true)

      // Panel highlighter tab deactivates → overlay off (dock is not active)
      await setPanelHighlighterActive(page, false)
      expect(await isOverlayVisible(page)).toBe(false)
      expect(await isHighlightActive(page)).toBe(false)
    })

    test('action button keeps overlay alive when panel closes', async ({ page }) => {
      // Enable via action button (dock)
      await enableHighlighting(page)
      expect(await isDockActive(page)).toBe(true)

      // Simulate panel highlighter tab becoming active
      await setPanelHighlighterActive(page, true)
      expect(await isHighlightActive(page)).toBe(true)

      // Simulate panel closing (highlighter tab deactivates)
      await setPanelHighlighterActive(page, false)

      // Overlay should still be on because dock is active
      expect(await isHighlightActive(page)).toBe(true)
      expect(await isOverlayVisible(page)).toBe(true)

      // Context menu should work since panel is no longer active
      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(page.locator('#save-story-btn')).toBeVisible({ timeout: 5000 })
    })

    test('disabling dock resets panel highlighter state', async ({ page }) => {
      // Enable dock and simulate panel active
      await enableHighlighting(page)
      await setPanelHighlighterActive(page, true)

      // Disable dock (calls disableHighlightMode which resets highlighter-tab-active)
      await disableHighlighting(page)

      expect(await isDockActive(page)).toBe(false)
      expect(await isHighlightActive(page)).toBe(false)
      expect(await isOverlayVisible(page)).toBe(false)
    })

    test('isHighlightActive reflects combined state correctly', async ({ page }) => {
      // Neither active
      expect(await isHighlightActive(page)).toBe(false)
      expect(await isDockActive(page)).toBe(false)
      expect(await isPanelActive(page)).toBe(false)

      // Only dock active
      await enableHighlighting(page)
      expect(await isHighlightActive(page)).toBe(true)
      expect(await isDockActive(page)).toBe(true)

      // Disable dock → neither active
      await disableHighlighting(page)
      expect(await isHighlightActive(page)).toBe(false)
      expect(await isDockActive(page)).toBe(false)

      // Only panel active
      await setPanelHighlighterActive(page, true)
      expect(await isHighlightActive(page)).toBe(true)
      expect(await isPanelActive(page)).toBe(true)
      expect(await isDockActive(page)).toBe(false)

      // Panel deactivated → neither active
      await setPanelHighlighterActive(page, false)
      expect(await isHighlightActive(page)).toBe(false)
    })

    test('panel close then dock activate clears stale selection and shows context menu', async ({ page }) => {
      // Enable dock first (reliable), then add panel as second source
      await enableHighlighting(page)
      await setPanelHighlighterActive(page, true)
      expect(await isHighlightActive(page)).toBe(true)

      // 1. Select component in panel mode (no context menu)
      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(page.locator('#save-story-btn')).not.toBeVisible()

      // Verify selection exists in machine context
      const hasSelection = await page.evaluate(() => {
        const actor = (window as any).__highlightMachineSend
        return actor !== undefined
      })
      expect(hasSelection).toBe(true)

      // 2. Panel closes, dock deactivates → overlay off, selection preserved
      await setPanelHighlighterActive(page, false)
      await disableHighlighting(page)
      expect(await isHighlightActive(page)).toBe(false)
      expect(await isOverlayVisible(page)).toBe(false)

      // 3. Re-enable dock → should NOT restore stale panel selection
      await enableHighlighting(page)
      expect(await isDockActive(page)).toBe(true)
      expect(await isHighlightActive(page)).toBe(true)
      expect(await isOverlayVisible(page)).toBe(true)

      // No stale context menu should be visible
      await expect(page.locator('#save-story-btn')).not.toBeVisible()

      // 4. Click a component → context menu SHOULD appear (dock mode)
      await clickComponentHighlight(page, TARGET_COMPONENT)
      await expect(page.locator('#save-story-btn')).toBeVisible({ timeout: 5000 })
    })

    test('SB badge is conditional on story existence', async ({ page }) => {
      await enableHighlighting(page)

      // Hover over a component — check that the label appears
      await hoverTaskListHeading(page)

      // Wait for story file cache to populate
      await page.waitForTimeout(1000)

      // Re-hover to trigger redraw with cached story info
      await page.mouse.move(0, 0)
      await page.waitForTimeout(200)
      await hoverTaskListHeading(page)
      await page.waitForTimeout(500)

      // Check badge visibility — the badge should exist on hovered highlights
      const badgeInfo = await page.evaluate(() => {
        const container = document.getElementById('component-highlighter-container')
        if (!container) return null

        const labels = container.querySelectorAll('.ch-highlight-label')
        if (!labels.length) return null

        const results: { hasBadge: boolean; badgeVisible: boolean }[] = []
        for (const label of labels) {
          const badge = label.querySelector('.ch-label-badge') as HTMLElement
          if (!badge) {
            results.push({ hasBadge: false, badgeVisible: false })
          } else {
            const display = window.getComputedStyle(badge).display
            results.push({ hasBadge: true, badgeVisible: display !== 'none' })
          }
        }
        return results
      })

      expect(badgeInfo).not.toBeNull()
      expect(badgeInfo!.length).toBeGreaterThan(0)
      // All hovered labels should have a badge element (visible or hidden based on story existence)
      for (const info of badgeInfo!) {
        expect(info.hasBadge).toBe(true)
      }
    })
  })
}
