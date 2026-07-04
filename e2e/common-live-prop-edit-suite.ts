import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { waitForCreateStoryRequest } from './highlighter-helpers'

type TestLike = {
  describe: (name: string, fn: () => void) => void
  beforeEach: (fn: (ctx: { page: Page }) => Promise<void>) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (name: string, fn: (ctx: { page: Page }) => Promise<void>): any
}

/**
 * One data-type edit exercised against a live playground component:
 * `setProp(componentName, path, payload)` must flip `probe.selector`'s text
 * to contain `probe.contains`.
 */
export type PropEditDataTypeTarget = {
  componentName: string
  path: Array<string | number>
  payload: { kind: string; text: string }
  probe: { selector: string; contains: string }
}

export type LivePropEditSuiteOptions = {
  /**
   * Per-playground data-type edit targets (defaults to the React playground
   * set). The first target's component is also used for the invalid-payload
   * check, so it should have a string prop at `path`.
   */
  dataTypeTargets?: PropEditDataTypeTarget[]
}

const DEFAULT_DATA_TYPE_TARGETS: PropEditDataTypeTarget[] = [
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
    componentName: 'PropZoo',
    path: ['note'],
    payload: { kind: 'json', text: '"e2e note"' },
    probe: { selector: '.task-card-meta span', contains: 'e2e note' },
  },
]

/**
 * Live prop editing: the tooltip / panel pencil drives the runtime's
 * `window.__componentHighlighterSetProp` (React: `renderer.overrideProps`;
 * Vue: the reactive `instance.props` object). The tooltip/save/reset flows
 * use `TaskList.title`, which every playground shares; only the data-type
 * targets vary per playground.
 */
export function registerLivePropEditSuite(
  test: TestLike,
  options: LivePropEditSuiteOptions = {},
) {
  const dataTypeTargets = options.dataTypeTargets ?? DEFAULT_DATA_TYPE_TARGETS

  test.describe('live prop editing', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('button')
      await page.waitForTimeout(800)
      await page.evaluate(() =>
        (
          window as unknown as {
            __componentHighlighterActivateTracking?: () => void
          }
        ).__componentHighlighterActivateTracking?.(),
      )
      await page.waitForTimeout(300)
    })

    test('overrideProps API is available in dev', async ({ page }) => {
      const can = await page.evaluate(
        () =>
          (
            window as unknown as {
              __componentHighlighterCanEditProps?: () => boolean
            }
          ).__componentHighlighterCanEditProps?.() ?? false,
      )
      expect(can).toBe(true)
    })

    test('runtime setProp applies every data type live', async ({ page }) => {
      const result = await page.evaluate(async (targets) => {
        const w = window as any
        const reg = w.__componentHighlighterRegistry as Map<string, any>
        const setProp = w.__componentHighlighterSetProp
        const byName = (n: string) =>
          [...reg.values()].find((v) => v.meta?.componentName === n)
        const sleep = (ms: number) =>
          new Promise((r) => setTimeout(r, ms))

        // One override per component instance. (React DevTools' overrideProps
        // re-bases off the component's current props each call, so two
        // synchronous overrides on the SAME instance would clobber each other
        // — that's not a real-UX scenario: users edit one prop at a time.)
        const ok = targets.map(
          (t) => setProp(byName(t.componentName)?.id, t.path, t.payload).ok,
        )
        const rBad = setProp(
          byName(targets[0].componentName)?.id,
          targets[0].path,
          { kind: 'number', text: 'NaNaN' },
        ) // error path: non-numeric payload must be rejected
        await sleep(500)

        const probes = targets.map((t) => ({
          name: t.componentName,
          found: [...document.querySelectorAll(t.probe.selector)].some((el) =>
            (el.textContent || '').includes(t.probe.contains),
          ),
        }))
        return { ok, badOk: rBad.ok, badErr: rBad.error, probes }
      }, dataTypeTargets)

      expect(result.ok).toEqual(dataTypeTargets.map(() => true))
      expect(result.badOk).toBe(false)
      expect(result.badErr).toContain('not a number')
      expect(result.probes).toEqual(
        dataTypeTargets.map((t) => ({ name: t.componentName, found: true })),
      )
    })

    test('tooltip pencil → form → Apply edits the live app', async ({
      page,
    }) => {
      await page.evaluate(() => {
        const w = window as any
        w.__componentHighlighterEnable?.()
        const reg = w.__componentHighlighterRegistry as Map<string, any>
        const tl = [...reg.values()].find(
          (v) => v.meta?.componentName === 'TaskList',
        )
        w.__componentHighlighterSelectById(tl.id)
      })
      await page.waitForTimeout(600)

      const applied = await page.evaluate(async () => {
        const sleep = (ms: number) =>
          new Promise((r) => setTimeout(r, ms))
        const host = [...document.querySelectorAll('*')].find(
          (e) =>
            (e as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
              ?.getElementById?.('save-story-btn'),
        ) as (HTMLElement & { shadowRoot: ShadowRoot }) | undefined
        const sr = host?.shadowRoot
        if (!sr) return { err: 'no menu' }
        const keyEl = [...sr.querySelectorAll('.prop-key')].find(
          (k) => k.textContent?.trim() === 'title',
        )
        const vc = keyEl?.nextElementSibling as HTMLElement
        const pencil = vc?.querySelector(
          '.prop-edit-btn',
        ) as HTMLButtonElement | null
        if (!pencil) return { err: 'no pencil' }
        pencil.click()
        await sleep(200)
        const input = vc.querySelector(
          '.prop-edit-input',
        ) as HTMLInputElement
        input.value = 'Tooltip E2E Title'
        ;(vc.querySelector('.prop-edit-save') as HTMLButtonElement).click()
        await sleep(400)
        return {
          err: null,
          titleDom: document
            .querySelector('.task-list-title')
            ?.textContent?.trim(),
        }
      })

      expect(applied.err).toBeNull()
      expect(applied.titleDom).toBe('Tooltip E2E Title')
    })

    test('a live-edited prop is used in the created story payload', async ({
      page,
    }) => {
      // Open the tooltip for TaskList and edit `title` via the pencil.
      await page.evaluate(() => {
        const w = window as any
        w.__componentHighlighterEnable?.()
        const reg = w.__componentHighlighterRegistry as Map<string, any>
        const tl = [...reg.values()].find(
          (v) => v.meta?.componentName === 'TaskList',
        )
        w.__componentHighlighterSelectById(tl.id)
      })
      await page.waitForTimeout(600)

      await page.evaluate(async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const host = [...document.querySelectorAll('*')].find(
          (e) =>
            (e as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
              ?.getElementById?.('save-story-btn'),
        ) as (HTMLElement & { shadowRoot: ShadowRoot }) | undefined
        const sr = host!.shadowRoot
        const keyEl = [...sr.querySelectorAll('.prop-key')].find(
          (k) => k.textContent?.trim() === 'title',
        )
        const vc = keyEl!.nextElementSibling as HTMLElement
        ;(vc.querySelector('.prop-edit-btn') as HTMLButtonElement).click()
        await sleep(200)
        const input = vc.querySelector(
          '.prop-edit-input',
        ) as HTMLInputElement
        input.value = 'Edited Before Save'
        ;(vc.querySelector('.prop-edit-save') as HTMLButtonElement).click()
        await sleep(450) // allow override commit + reserialization
      })

      // Now save the story and capture the emitted create-story payload.
      const payload = await waitForCreateStoryRequest(page, async () => {
        await page.evaluate(() => {
          const host = [...document.querySelectorAll('*')].find(
            (e) =>
              (e as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
                ?.getElementById?.('save-story-btn'),
          ) as (HTMLElement & { shadowRoot: ShadowRoot }) | undefined
          const sr = host!.shadowRoot
          const nameInput = sr.getElementById(
            'story-name-input',
          ) as HTMLInputElement
          nameInput.value = 'EditedPropsStory'
          nameInput.dispatchEvent(new Event('input', { bubbles: true }))
          ;(sr.getElementById('save-story-btn') as HTMLButtonElement).click()
        })
      })

      expect(payload.meta.componentName).toBe('TaskList')
      // The created story must carry the EDITED value, not the original.
      expect(payload.serializedProps?.title).toBe('Edited Before Save')
      // Raw (unclonable) props must NOT cross the RPC boundary — serializedProps
      // is the single source of truth. Guards the registry/create-story contract.
      expect(payload.props).toBeUndefined()
    })

    test('re-opening the editor seeds the current edited value, not the original', async ({
      page,
    }) => {
      await page.evaluate(() => {
        const w = window as any
        w.__componentHighlighterEnable?.()
        const reg = w.__componentHighlighterRegistry as Map<string, any>
        const tl = [...reg.values()].find(
          (v) => v.meta?.componentName === 'TaskList',
        )
        w.__componentHighlighterSelectById(tl.id)
      })
      await page.waitForTimeout(600)

      const result = await page.evaluate(async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const host = [...document.querySelectorAll('*')].find(
          (e) =>
            (e as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
              ?.getElementById?.('save-story-btn'),
        ) as (HTMLElement & { shadowRoot: ShadowRoot }) | undefined
        const sr = host!.shadowRoot
        const valCell = () =>
          [...sr.querySelectorAll('.prop-key')]
            .find((k) => k.textContent?.trim() === 'title')!
            .nextElementSibling as HTMLElement

        // First edit: open, capture the seeded (original) value, set a new one.
        ;(valCell().querySelector('.prop-edit-btn') as HTMLButtonElement).click()
        await sleep(150)
        const firstSeed = (
          valCell().querySelector('.prop-edit-input') as HTMLInputElement
        ).value
        const input = valCell().querySelector(
          '.prop-edit-input',
        ) as HTMLInputElement
        input.value = 'Edited Once'
        ;(
          valCell().querySelector('.prop-edit-save') as HTMLButtonElement
        ).click()
        await sleep(400)

        // Re-open: the editor must seed the value we just set, not the original.
        ;(valCell().querySelector('.prop-edit-btn') as HTMLButtonElement).click()
        await sleep(150)
        const secondSeed = (
          valCell().querySelector('.prop-edit-input') as HTMLInputElement
        ).value
        return { firstSeed, secondSeed }
      })

      expect(result.firstSeed).not.toBe('Edited Once')
      expect(result.secondSeed).toBe('Edited Once')
    })

    test('reset button appears after an edit and restores the original value', async ({
      page,
    }) => {
      await page.evaluate(() => {
        const w = window as any
        w.__componentHighlighterEnable?.()
        const reg = w.__componentHighlighterRegistry as Map<string, any>
        const tl = [...reg.values()].find(
          (v) => v.meta?.componentName === 'TaskList',
        )
        w.__componentHighlighterSelectById(tl.id)
      })
      await page.waitForTimeout(600)

      const result = await page.evaluate(async () => {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
        const host = [...document.querySelectorAll('*')].find(
          (e) =>
            (e as HTMLElement & { shadowRoot?: ShadowRoot }).shadowRoot
              ?.getElementById?.('save-story-btn'),
        ) as (HTMLElement & { shadowRoot: ShadowRoot }) | undefined
        const sr = host!.shadowRoot
        const valCell = () =>
          [...sr.querySelectorAll('.prop-key')]
            .find((k) => k.textContent?.trim() === 'title')!
            .nextElementSibling as HTMLElement
        const resetBtn = () =>
          valCell().querySelector('.prop-reset-btn') as HTMLButtonElement | null
        const titleDom = () =>
          document.querySelector('.task-list-title')?.textContent?.trim()

        const originalDom = titleDom()
        // No reset affordance before any edit.
        const resetBeforeEdit = resetBtn()

        // Edit.
        ;(valCell().querySelector('.prop-edit-btn') as HTMLButtonElement).click()
        await sleep(150)
        ;(
          valCell().querySelector('.prop-edit-input') as HTMLInputElement
        ).value = 'Reset Me'
        ;(
          valCell().querySelector('.prop-edit-save') as HTMLButtonElement
        ).click()
        await sleep(400)
        const editedDom = titleDom()
        const resetAfterEdit = resetBtn()
        const resetShownAfterEdit =
          !!resetAfterEdit && resetAfterEdit.style.display !== 'none'

        // Reset.
        resetAfterEdit!.click()
        await sleep(400)
        const restoredDom = titleDom()
        const after = resetBtn()
        const resetHiddenAfterReset = !after || after.style.display === 'none'

        return {
          originalDom,
          resetBeforeEdit: !!resetBeforeEdit && resetBeforeEdit.style.display !== 'none',
          editedDom,
          resetShownAfterEdit,
          restoredDom,
          resetHiddenAfterReset,
        }
      })

      expect(result.resetBeforeEdit).toBe(false)
      expect(result.editedDom).toBe('Reset Me')
      expect(result.resetShownAfterEdit).toBe(true)
      expect(result.restoredDom).toBe(result.originalDom)
      expect(result.resetHiddenAfterReset).toBe(true)
    })
  })
}
