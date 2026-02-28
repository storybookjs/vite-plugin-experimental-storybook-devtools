import { test, expect } from '@playwright/test'
import { registerCommonHighlighterSuite } from './common-highlighter-suite'

type RegistrySnapshot = {
  size: number
  uniqueNames: string[]
  hasUnknownFilePath: boolean
  byName: Record<string, number>
}

async function getRegistrySnapshot(page: Parameters<typeof test>[0]['page']) {
  return page.evaluate(() => {
    const registry = (window as any).__componentHighlighterRegistry as
      | Map<
          string,
          {
            meta?: { componentName?: string; filePath?: string }
          }
        >
      | undefined

    if (!registry) return null

    const entries = Array.from(registry.values())
    const byName: Record<string, number> = {}

    for (const entry of entries) {
      const name = entry.meta?.componentName || 'Unknown'
      byName[name] = (byName[name] || 0) + 1
    }

    const uniqueNames = Object.keys(byName).sort()
    const hasUnknownFilePath = entries.some((entry) => {
      const filePath = entry.meta?.filePath || ''
      return filePath === 'unknown' || filePath.trim() === ''
    })

    const snapshot: RegistrySnapshot = {
      size: registry.size,
      uniqueNames,
      hasUnknownFilePath,
      byName,
    }

    return snapshot
  })
}

test.describe('React playground detection coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('button')
    await page.waitForTimeout(1000)
  })

  test('detects the expected 7 distinct components on initial render', async ({
    page,
  }) => {
    const snapshot = await getRegistrySnapshot(page)

    expect(snapshot).toBeTruthy()
    expect(snapshot?.hasUnknownFilePath).toBe(false)

    // Expected baseline set from App.tsx initial render.
    expect(snapshot?.uniqueNames).toEqual([
      'App',
      'Badge',
      'Button',
      'Header',
      'Modal',
      'TaskCard',
      'TaskList',
    ])

    // Basic sanity check that key components are actually instantiated.
    expect(snapshot?.byName.TaskCard).toBeGreaterThanOrEqual(3)
    expect(snapshot?.byName.Button).toBeGreaterThanOrEqual(1)
  })

  test('tracks modal subtree components after opening the task form', async ({
    page,
  }) => {
    await page.getByRole('button', { name: '+ New Task' }).click()
    await page.waitForTimeout(500)

    const snapshot = await getRegistrySnapshot(page)

    expect(snapshot).toBeTruthy()
    expect(snapshot?.hasUnknownFilePath).toBe(false)

    // Modal open should add form controls/components to the registry.
    expect(snapshot?.uniqueNames).toEqual(
      expect.arrayContaining(['TaskForm', 'Input', 'Select']),
    )
  })

  test('uses real source metadata for TaskList (no unknown path)', async ({
    page,
  }) => {
    const meta = await page.evaluate(() => {
      const registry = (window as any).__componentHighlighterRegistry as
        | Map<string, { meta?: { componentName?: string; filePath?: string } }>
        | undefined

      if (!registry) return null

      const taskList = Array.from(registry.values()).find(
        (entry) => entry.meta?.componentName === 'TaskList',
      )

      return taskList?.meta || null
    })

    expect(meta).toBeTruthy()
    expect(meta?.filePath).toContain('/playground/react/src/components/TaskList.tsx')
    expect(meta?.filePath).not.toBe('unknown')
  })

})

registerCommonHighlighterSuite(test as any, {
  framework: 'react',
  targetComponent: 'TaskList',
})
