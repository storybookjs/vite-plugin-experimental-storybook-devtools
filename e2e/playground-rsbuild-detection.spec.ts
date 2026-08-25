import { test, expect } from '@playwright/test'
import { registerCommonHighlighterSuite } from './common-highlighter-suite'
import { registerHighlightPanelStateSuite } from './common-highlight-panel-state-suite'
import { registerLivePropEditSuite } from './common-live-prop-edit-suite'
import { registerListenersReplaySuite } from './common-listeners-replay-suite'

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

test.describe('Rsbuild playground detection coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('button')
    await page.waitForTimeout(1000)
  })

  test('detects the expected component set (incl. all authoring patterns) on initial render', async ({
    page,
  }) => {
    const snapshot = await getRegistrySnapshot(page)

    expect(snapshot).toBeTruthy()
    expect(snapshot?.hasUnknownFilePath).toBe(false)

    // Same shared src as playground/react (symlinked). See
    // docs/REACT_PATTERNS.md for the supported/unsupported pattern matrix.
    expect(snapshot?.uniqueNames).toEqual([
      'App',
      'Badge',
      'Button',
      'DefaultBanner',
      'Disclosure',
      'FancyField',
      'GenericList',
      'Header',
      'IconChip',
      'LegacyCounter',
      'MemoForwardInput',
      'MemoStat',
      'Modal',
      'PatternShowcase',
      'PropZoo',
      'ReactMemoCard',
      'TaskCard',
      'TaskList',
    ])

    // Supported patterns must be present (regression guards).
    expect(snapshot?.uniqueNames).toEqual(
      expect.arrayContaining([
        'LegacyCounter', // class component
        'ReactMemoCard', // React.memo(...) member-expression wrapper
        'MemoStat', // memo(...) bare wrapper
        'FancyField', // forwardRef(...)
        'MemoForwardInput', // memo(forwardRef(...))
        'DefaultBanner', // default export (function decl)
        'IconChip', // default export via identifier
        'GenericList', // generic component
        'Disclosure', // compound (dot-notation) parent
        'PropZoo', // many prop kinds
      ]),
    )

    // Unsupported-detection demonstrators must be ABSENT.
    expect(snapshot?.uniqueNames).not.toContain('FramedNote')
    expect(snapshot?.uniqueNames).not.toContain('AnonWidget')
    expect(snapshot?.uniqueNames).not.toContain('Summary')
    expect(snapshot?.uniqueNames).not.toContain('Panel')

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
    // playground/rsbuild/src is a symlink to the canonical playground/react/src
    // (single source of truth). Rspack resolves symlinks to the real path, so
    // we assert the real component file rather than a playground-specific
    // prefix — the guarantee that matters is "real source, not 'unknown'".
    expect(meta?.filePath).toContain('/src/components/TaskList.tsx')
    expect(meta?.filePath).not.toBe('unknown')
  })
})

registerCommonHighlighterSuite(test as any)
registerHighlightPanelStateSuite(test as any)
registerLivePropEditSuite(test as any)
registerListenersReplaySuite(test as any)
