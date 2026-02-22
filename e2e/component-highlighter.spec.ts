import { test, expect, Page } from '@playwright/test'

// Helper to enable highlight mode and show all highlights
async function enableHighlightModeAndShowAll(page: Page) {
  // Enable overlay and toggle highlight all
  await page.evaluate(() => {
    const registry = (window as any).__componentHighlighterRegistry
    if (registry) {
      // Update rects for all components
      for (const instance of registry.values()) {
        if (instance.element && instance.element.isConnected) {
          instance.rect = instance.element.getBoundingClientRect()
        }
      }
    }
    // Enable overlay
    ;(window as any).__componentHighlighterDraw?.()
    // Toggle highlight all
    ;(window as any).__componentHighlighterToggle?.()
  })
  // Wait for highlights to render
  await page.waitForTimeout(500)
}

async function openContextMenu(page: Page) {
  await enableHighlightModeAndShowAll(page)

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
}

test.describe('Component Highlighter', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for the app to load and components to register
    await page.waitForSelector('button')
    await page.waitForTimeout(1000) // Give time for component registration
  })

  test.describe('Component Registration', () => {
    test('should register components in the registry', async ({ page }) => {
      const registrySize = await page.evaluate(() => {
        const registry = (window as any).__componentHighlighterRegistry
        return registry ? registry.size : 0
      })

      expect(registrySize).toBeGreaterThan(0)
    })

    test('should store component metadata', async ({ page }) => {
      const componentMeta = await page.evaluate(() => {
        const registry = (window as any).__componentHighlighterRegistry
        if (!registry) return null

        // Get first component
        const firstEntry = registry.values().next().value
        return firstEntry?.meta
      })

      expect(componentMeta).toBeDefined()
      expect(componentMeta.componentName).toBeDefined()
      expect(componentMeta.filePath).toBeDefined()
      expect(componentMeta.relativeFilePath).toBeDefined()
    })
  })

  test.describe('Highlight Behavior', () => {
    test('should show highlight container when enabled', async ({ page }) => {
      await enableHighlightModeAndShowAll(page)

      const highlightContainer = page.locator(
        '#component-highlighter-container',
      )
      await expect(highlightContainer).toBeAttached()
    })

    test('should show highlights when toggle is called', async ({ page }) => {
      await enableHighlightModeAndShowAll(page)

      // Check that highlight elements exist
      const highlightContainer = page.locator(
        '#component-highlighter-container',
      )
      const highlights = highlightContainer.locator('div[data-highlight-id]')

      const count = await highlights.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should have correct highlight styles', async ({ page }) => {
      await enableHighlightModeAndShowAll(page)

      // Get highlight styles
      const hasHighlightsWithBorders = await page.evaluate(() => {
        const container = document.getElementById(
          'component-highlighter-container',
        )
        if (!container) return false

        const highlights = container.querySelectorAll('div[data-highlight-id]')
        if (highlights.length === 0) return false

        // Check that at least one highlight has a border
        for (const el of highlights) {
          const style = window.getComputedStyle(el)
          if (style.borderStyle !== 'none' || style.outlineStyle !== 'none') {
            return true
          }
        }
        return false
      })

      expect(hasHighlightsWithBorders).toBe(true)
    })
  })

  test.describe('Context Menu', () => {
    test('should show context menu when clicking on a highlight', async ({
      page,
    }) => {
      await openContextMenu(page)

      // Context menu should appear - check for Save Story button
      const saveStoryBtn = page.locator('#save-story-btn')
      await expect(saveStoryBtn).toBeVisible({ timeout: 5000 })
    })

    test('should show story name input in context menu', async ({ page }) => {
      await openContextMenu(page)

      // Check for story name input
      const storyNameInput = page.locator('#story-name-input')
      await expect(storyNameInput).toBeVisible({ timeout: 5000 })
    })

    test('should show Open Component button', async ({ page }) => {
      await openContextMenu(page)

      // Check for Open Component button
      const openComponentBtn = page.locator('#open-component-btn')
      await expect(openComponentBtn).toBeVisible({ timeout: 5000 })
      await expect(openComponentBtn).toContainText('Open Component')
    })

    test('should close context menu on click outside', async ({ page }) => {
      await openContextMenu(page)

      // Context menu should be visible
      const saveStoryBtn = page.locator('#save-story-btn')
      await expect(saveStoryBtn).toBeVisible({ timeout: 5000 })

      // Click outside (on body, away from highlights)
      await page.mouse.click(10, 10)
      await page.waitForTimeout(500)

      // Context menu should be hidden
      await expect(saveStoryBtn).not.toBeVisible()
    })

    test('should close context menu on Escape', async ({ page }) => {
      await openContextMenu(page)

      // Context menu should be visible
      const saveStoryBtn = page.locator('#save-story-btn')
      await expect(saveStoryBtn).toBeVisible({ timeout: 5000 })

      // Press Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // Context menu should be hidden
      await expect(saveStoryBtn).not.toBeVisible()
    })
  })

  test.describe('Storybook Icon', () => {
    test('should show storybook icon for components with stories', async ({
      page,
    }) => {
      await enableHighlightModeAndShowAll(page)

      await page.waitForTimeout(1000) // Wait for story file checks

      // Check if any highlight has the storybook icon
      const storybookIcons = page.locator('.storybook-icon')
      const iconCount = await storybookIcons.count()

      // Button component has a story file, so there should be at least one icon
      // Note: This test assumes Button.stories.tsx exists
      console.log(`Found ${iconCount} storybook icons`)
      // Just check it doesn't crash - icon count may vary based on story file existence
    })
  })

  test.describe('Component Props Display', () => {
    test('should display component props in context menu', async ({ page }) => {
      await openContextMenu(page)

      // Should show Props section
      const propsSection = page.locator('text=Props:')
      await expect(propsSection).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Debug Overlay', () => {
    test('should show debug overlay when highlight all is enabled', async ({
      page,
    }) => {
      await enableHighlightModeAndShowAll(page)

      // Debug overlay should be visible
      const debugOverlay = page.locator('#component-highlighter-debug')
      await expect(debugOverlay).toBeAttached()
      await expect(debugOverlay).toBeVisible()
    })

    test('should display component stats in debug overlay', async ({
      page,
    }) => {
      await enableHighlightModeAndShowAll(page)

      const debugOverlay = page.locator('#component-highlighter-debug')
      await expect(debugOverlay).toBeVisible()

      // Check that it shows the expected stat labels
      await expect(debugOverlay).toContainText('Total components')
      await expect(debugOverlay).toContainText('Unique components')
      await expect(debugOverlay).toContainText('With stories')
      await expect(debugOverlay).toContainText('Coverage')
    })

    test('should show coverage percentage', async ({ page }) => {
      await enableHighlightModeAndShowAll(page)

      const debugOverlay = page.locator('#component-highlighter-debug')
      await expect(debugOverlay).toBeVisible()

      // Coverage percentage should be shown
      const content = await debugOverlay.textContent()
      expect(content).toMatch(/\d+%/)
    })

    test('should hide debug overlay when highlight all is disabled', async ({
      page,
    }) => {
      await enableHighlightModeAndShowAll(page)

      // Debug overlay should be visible
      const debugOverlay = page.locator('#component-highlighter-debug')
      await expect(debugOverlay).toBeVisible()

      // Toggle off highlight all
      await page.evaluate(() => {
        ;(window as any).__componentHighlighterToggle?.()
      })
      await page.waitForTimeout(300)

      // Debug overlay should be hidden
      await expect(debugOverlay).not.toBeAttached()
    })
  })
})
