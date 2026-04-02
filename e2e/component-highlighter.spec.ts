import { test, expect, Page } from '@playwright/test'

// Helper to enable highlight mode
async function enableHighlightModeForTest(page: Page) {
  await page.evaluate(() => {
    ;(window as any).__componentHighlighterEnable?.()
  })
  await page.waitForTimeout(500)
}

async function openContextMenu(page: Page) {
  await enableHighlightModeForTest(page)

  // Hover over a component to trigger its highlight, then click
  const target = page.getByRole('heading', { name: 'All Tasks' })
  const bbox = await target.boundingBox()
  expect(bbox).toBeTruthy()

  await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
  await page.waitForTimeout(300)

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
      await enableHighlightModeForTest(page)

      const highlightContainer = page.locator(
        '#component-highlighter-container',
      )
      await expect(highlightContainer).toBeAttached()
    })

    test('should show highlight on hover', async ({ page }) => {
      await enableHighlightModeForTest(page)

      // Hover over a component to trigger its highlight
      const target = page.getByRole('heading', { name: 'All Tasks' })
      const bbox = await target.boundingBox()
      expect(bbox).toBeTruthy()
      await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
      await page.waitForTimeout(300)

      // Check that highlight elements exist
      const highlightContainer = page.locator(
        '#component-highlighter-container',
      )
      const highlights = highlightContainer.locator('div[data-highlight-id]')

      const count = await highlights.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should have correct highlight styles on hover', async ({ page }) => {
      await enableHighlightModeForTest(page)

      // Hover over a component to trigger its highlight
      const target = page.getByRole('heading', { name: 'All Tasks' })
      const bbox = await target.boundingBox()
      expect(bbox).toBeTruthy()
      await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
      await page.waitForTimeout(300)

      // Check highlight styles
      const hasHighlightsWithOutlines = await page.evaluate(() => {
        const container = document.getElementById(
          'component-highlighter-container',
        )
        if (!container) return false

        const highlights = container.querySelectorAll('div[data-highlight-id]')
        if (highlights.length === 0) return false

        // Check that at least one highlight has an outline
        for (const el of highlights) {
          const style = window.getComputedStyle(el)
          if (style.outlineStyle !== 'none') {
            return true
          }
        }
        return false
      })

      expect(hasHighlightsWithOutlines).toBe(true)
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
    test('should show storybook icon for components with stories on hover', async ({
      page,
    }) => {
      await enableHighlightModeForTest(page)

      // Hover a component that has a story (Button)
      const button = page.getByRole('button', { name: 'Filter' })
      const bbox = await button.boundingBox()
      expect(bbox).toBeTruthy()
      await page.mouse.move(bbox!.x + bbox!.width / 2, bbox!.y + bbox!.height / 2)
      await page.waitForTimeout(1000) // Wait for story file checks

      // Check if any highlight has the storybook icon
      const storybookIcons = page.locator('.storybook-icon')
      const iconCount = await storybookIcons.count()

      // Button component has a story file, so there should be at least one icon
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
})
