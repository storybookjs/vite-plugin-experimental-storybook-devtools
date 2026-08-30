import type { test as testBase, expect as expectBase } from '@playwright/test'

/**
 * Opens the real DevTools dock panel (the `storybook-devtools` iframe dock)
 * and asserts the panel SPA actually renders and receives synced data —
 * the seam every window-global-driven suite skips.
 */
export function registerPanelRenderSuite(
  test: typeof testBase,
  expect: typeof expectBase,
  opts: { componentName: string },
) {
  test.describe('storybook panel render', () => {
    test('panel renders and coverage lists a component from the page', async ({
      page,
    }) => {
      await page.goto('/')

      // Playwright CSS locators pierce the dock's open shadow root.
      // The collapsed dock expands on hover and its container intercepts
      // real pointer events, so dispatch the click straight to the button.
      const dockBtn = page.locator(
        'devframes-dock-embedded button[aria-label="Storybook"]',
      )
      await dockBtn.waitFor({ state: 'attached', timeout: 20_000 })
      await dockBtn.dispatchEvent('click')

      const panel = page.frameLocator('devframes-dock-embedded iframe')

      // The panel SPA booted: its rail rendered (fails on stale/unserved assets).
      await expect(panel.locator('.rail-btn').first()).toBeVisible({
        timeout: 15_000,
      })

      // Coverage requires the full pipeline: transform tracking on the
      // server, registry sync from the app page, and the get-coverage RPC.
      await panel.locator('.rail-btn[title="Coverage"]').click()
      await expect(panel.locator('#pane-coverage')).toContainText(
        opts.componentName,
        { timeout: 20_000 },
      )
    })
  })
}
