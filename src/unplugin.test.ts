import * as fs from 'fs'
import { describe, it, expect } from 'vitest'
import type { Plugin } from 'vite'
import {
  createComponentHighlighterUnplugin,
  getComponentHighlighterRuntimePaths,
  DEVTOOLS_HOOK_VIRTUAL_ID,
  type ComponentHighlighterUnpluginHost,
} from './unplugin'
import { reactFramework } from './frameworks/react'
import type { ComponentHighlighterOptions } from './create-component-highlighter-plugin'

/**
 * Every hook below is a plain function (never the rollup object-hook form)
 * that ignores `this`. Cast away rollup's `this: PluginContext` requirement
 * so tests can call it as a free function.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asFn(hook: unknown): (...args: any[]) => unknown {
  if (typeof hook !== 'function') {
    throw new Error('expected a function-form hook')
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hook as (...args: any[]) => unknown
}

function buildHost(
  overrides: Partial<ComponentHighlighterUnpluginHost> = {},
): ComponentHighlighterUnpluginHost {
  return {
    isServe: () => true,
    transformedComponents: new Map<string, string>(),
    getDiagnostics: () => null,
    ...overrides,
  }
}

function buildPlugin(options: ComponentHighlighterOptions): Plugin {
  return createComponentHighlighterUnplugin(
    reactFramework,
    options,
    buildHost(),
  ).vite() as Plugin
}

const NON_JSX_CODE = `export function helper() {\n  return 'hello'\n}\n`
const JSX_COMPONENT_CODE = `import React from 'react'\n\nexport function Button() {\n  return <button>Click</button>\n}\n`

describe('createComponentHighlighterUnplugin', () => {
  describe("hookInjection: 'entry'", () => {
    it('throws when `entry` is missing', () => {
      expect(() =>
        createComponentHighlighterUnplugin(
          reactFramework,
          { hookInjection: 'entry' },
          buildHost(),
        ).vite(),
      ).toThrow(/requires an `entry` option/)
    })

    it('prepends the devtools-hook import to a matching entry module exactly once', () => {
      const plugin = buildPlugin({
        hookInjection: 'entry',
        entry: '**/main.tsx',
      })
      const transform = asFn(plugin.transform)
      const id = '/app/src/main.tsx'

      const first = transform(NON_JSX_CODE, id) as string
      expect(first.startsWith(`import '${DEVTOOLS_HOOK_VIRTUAL_ID}'\n`)).toBe(
        true,
      )
      expect(first).toContain(NON_JSX_CODE)
      expect(first.split(DEVTOOLS_HOOK_VIRTUAL_ID).length - 1).toBe(1)

      // Idempotent: transforming code that already carries the import (e.g.
      // the author wrote it by hand, or a second pass over the same id)
      // never prepends a second one.
      const second = transform(first, id)
      if (typeof second === 'string') {
        expect(second.split(DEVTOOLS_HOOK_VIRTUAL_ID).length - 1).toBe(1)
      }

      // Re-transforming from the pristine on-disk source again (simulating
      // an HMR update) still injects — the check is per-call content, not a
      // one-shot flag that would go stale after the first transform.
      const third = transform(NON_JSX_CODE, id) as string
      expect(third.split(DEVTOOLS_HOOK_VIRTUAL_ID).length - 1).toBe(1)
    })

    it('leaves non-entry modules untouched', () => {
      const plugin = buildPlugin({
        hookInjection: 'entry',
        entry: '**/main.tsx',
      })
      const transform = asFn(plugin.transform)

      // Not the entry id, and not JSX either — filter/detect skip it too.
      const result = transform(NON_JSX_CODE, '/app/src/utils.ts')
      expect(result).toBeUndefined()
    })

    it('still runs the component transform when the entry is itself a component file', () => {
      const plugin = buildPlugin({
        hookInjection: 'entry',
        entry: '**/main.tsx',
      })
      const transform = asFn(plugin.transform)

      const result = transform(JSX_COMPONENT_CODE, '/app/src/main.tsx') as string
      expect(result).toContain(DEVTOOLS_HOOK_VIRTUAL_ID)
      expect(result).toContain('__chRegisterMeta(Button, {')
    })
  })

  describe("hookInjection: 'html' (default)", () => {
    it('leaves transform output identical to the plain framework transform (no import prepended)', () => {
      const plugin = buildPlugin({})
      const transform = asFn(plugin.transform)
      const id = '/app/src/Button.tsx'

      const result = transform(JSX_COMPONENT_CODE, id) as string
      const direct = reactFramework.transform(JSX_COMPONENT_CODE, id, {
        rsc: false,
      })

      expect(result).not.toContain(DEVTOOLS_HOOK_VIRTUAL_ID)
      expect(result).toBe(direct)
    })
  })

  describe('load: dev-source gating', () => {
    it('serves the built dist file, not raw source, when the host has no loadDevSource', async () => {
      const plugin = createComponentHighlighterUnplugin(
        reactFramework,
        {},
        buildHost({ isServe: () => true }),
      ).vite() as Plugin
      const resolveId = asFn(plugin.resolveId)
      const load = asFn(plugin.load)

      const resolved = resolveId(
        'virtual:component-highlighter/runtime-helpers',
        undefined,
        { isEntry: false },
      )
      const loaded = (await load(resolved as string)) as string

      // `interface LivePropEditor` is a TypeScript-only construct present in
      // src/runtime-helpers.ts but stripped from the built dist output —
      // its absence confirms the dist file was served, not the raw source.
      expect(loaded).not.toContain('interface LivePropEditor')
    })
  })

  describe('devtools-hook virtual module', () => {
    it('resolves and loads the framework hook script', async () => {
      const plugin = buildPlugin({ hookInjection: 'entry', entry: '**/main.tsx' })
      const resolveId = asFn(plugin.resolveId)
      const load = asFn(plugin.load)

      const resolved = resolveId(DEVTOOLS_HOOK_VIRTUAL_ID, undefined, {
        isEntry: false,
      })
      expect(resolved).toBe(`\0${DEVTOOLS_HOOK_VIRTUAL_ID}`)

      const loaded = await load(resolved as string)
      expect(loaded).toBe(reactFramework.htmlHeadSnippet?.())
    })
  })

  describe('dev-source vs. built-dist read path', () => {
    const paths = getComponentHighlighterRuntimePaths(reactFramework)

    it('serves the built dist file when the host provides no loadDevSource, even though the src file exists', async () => {
      // The src file must exist so the only thing gating the dev-source path
      // is the absence of `loadDevSource` on the host.
      expect(fs.existsSync(paths.runtimeHelperSourcePath)).toBe(true)
      expect(fs.existsSync(paths.runtimeHelperFilePath)).toBe(true)

      const load = (host: ComponentHighlighterUnpluginHost) => {
        const plugin = createComponentHighlighterUnplugin(
          reactFramework,
          {},
          host,
        ).vite() as Plugin
        return asFn(plugin.load)
      }

      const noLoadDevSourceResult = await load(buildHost())(
        paths.resolvedRuntimeHelperVirtualId,
      )
      // A host with `isServe: false` never had a dev-source path to begin
      // with, so it always served the dist file — the same result a host
      // omitting `loadDevSource` while serving must now also produce.
      const neverServingResult = await load(
        buildHost({ isServe: () => false }),
      )(paths.resolvedRuntimeHelperVirtualId)

      expect(noLoadDevSourceResult).toBe(neverServingResult)
      expect(noLoadDevSourceResult).toBe(
        fs.readFileSync(paths.runtimeHelperFilePath, 'utf-8'),
      )
      expect(noLoadDevSourceResult).not.toBe(
        fs.readFileSync(paths.runtimeHelperSourcePath, 'utf-8'),
      )

      const frameworkModuleResult = await load(buildHost())(
        paths.resolvedFrameworkVirtualModuleId,
      )
      const frameworkModuleNeverServingResult = await load(
        buildHost({ isServe: () => false }),
      )(paths.resolvedFrameworkVirtualModuleId)
      expect(frameworkModuleResult).toBe(frameworkModuleNeverServingResult)
    })

    it('reads the dev source when the host provides loadDevSource and the src file exists', async () => {
      const host = buildHost({
        loadDevSource: async (absPath) => `/* dev */ ${absPath}`,
      })
      const plugin = createComponentHighlighterUnplugin(
        reactFramework,
        {},
        host,
      ).vite() as Plugin
      const load = asFn(plugin.load)

      const runtimeHelpersResult = await load(
        paths.resolvedRuntimeHelperVirtualId,
      )
      expect(runtimeHelpersResult).toBe(
        `/* dev */ ${paths.runtimeHelperSourcePath}`,
      )
    })

    it('falls back to the raw on-disk source when a provided loadDevSource returns null', async () => {
      const host = buildHost({
        loadDevSource: async () => null,
      })
      const plugin = createComponentHighlighterUnplugin(
        reactFramework,
        {},
        host,
      ).vite() as Plugin
      const load = asFn(plugin.load)

      const runtimeHelpersResult = await load(
        paths.resolvedRuntimeHelperVirtualId,
      )
      expect(runtimeHelpersResult).toBe(
        fs.readFileSync(paths.runtimeHelperSourcePath, 'utf-8'),
      )
    })
  })
})
