import { test, expect } from '@playwright/test'
import { registerCommonHighlighterSuite } from './common-highlighter-suite'

type RegistrySnapshot = {
  size: number
  uniqueNames: string[]
  hasUnknownFilePath: boolean
}

async function getRegistrySnapshot(page: Parameters<typeof test>[0]['page']) {
  return page.evaluate(() => {
    const registry = (window as any).__componentHighlighterRegistry as
      | Map<string, { meta?: { componentName?: string; filePath?: string } }>
      | undefined

    if (!registry) return null

    const entries = Array.from(registry.values())
    const uniqueNames = Array.from(
      new Set(entries.map((entry) => entry.meta?.componentName || 'Unknown')),
    ).sort()

    const hasUnknownFilePath = entries.some((entry) => {
      const filePath = entry.meta?.filePath || ''
      return filePath === 'unknown' || filePath.trim() === ''
    })

    const snapshot: RegistrySnapshot = {
      size: registry.size,
      uniqueNames,
      hasUnknownFilePath,
    }

    return snapshot
  })
}

test.describe('Vue playground detection coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('button')
    await page.waitForTimeout(1000)
  })

  test('detects expected baseline components on initial render', async ({
    page,
  }) => {
    const snapshot = await getRegistrySnapshot(page)

    expect(snapshot).toBeTruthy()
    expect(snapshot?.hasUnknownFilePath).toBe(false)

    // Vue names can include "Anonymous" for script setup root in some toolchains,
    // so validate the key concrete components are present.
    expect(snapshot?.uniqueNames).toEqual(
      expect.arrayContaining([
        'Header',
        'TaskList',
        'TaskCard',
        'Button',
        'Badge',
        'Modal',
      ]),
    )
  })

  test('tracks modal form components when modal opens', async ({ page }) => {
    await page.getByRole('button', { name: '+ New Task' }).click()
    await page.waitForTimeout(500)

    const snapshot = await getRegistrySnapshot(page)

    expect(snapshot).toBeTruthy()
    expect(snapshot?.hasUnknownFilePath).toBe(false)
    expect(snapshot?.uniqueNames).toEqual(
      expect.arrayContaining(['TaskForm', 'Input', 'Select']),
    )
  })

})

registerCommonHighlighterSuite(test as any)
