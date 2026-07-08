import { test, expect } from '@playwright/test'
import { registerCommonHighlighterSuite } from './common-highlighter-suite'
import { registerHighlightPanelStateSuite } from './common-highlight-panel-state-suite'
import { registerLivePropEditSuite } from './common-live-prop-edit-suite'

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

test.describe('Nuxt playground detection coverage', () => {
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
registerHighlightPanelStateSuite(test as any)
registerLivePropEditSuite(test as any, {
  // Same shared component source as the Vue playground (symlinked), so the
  // live-prop-edit targets match playground-vue-detection.spec.ts.
  dataTypeTargets: [
    {
      componentName: 'Header',
      path: ['title'],
      payload: { kind: 'string', text: 'E2E Title' },
      probe: { selector: '.header-title', contains: 'E2E Title' },
    },
    {
      componentName: 'TaskList',
      path: ['count'],
      payload: { kind: 'number', text: '777' },
      probe: { selector: '.task-list-count', contains: '777' },
    },
    {
      componentName: 'TaskCard',
      path: ['task', 'title'],
      payload: { kind: 'json', text: '"E2E Task Title"' },
      probe: { selector: '.task-card-title', contains: 'E2E Task Title' },
    },
  ],
})
