/**
 * Reads the user's actual Storybook configuration (framework package,
 * renderer, builder, stories globs, addons, project root) instead of
 * hardcoding it. Backed by `storybook/internal/common`: `getStorybookInfo`
 * needs an absolute `configDir` to resolve independently of `process.cwd()`;
 * `getProjectRoot` takes no `cwd` argument at all and always reads
 * `process.cwd()` directly. Both are loaded lazily (dynamic `import()`, or a
 * lazy `require()` where a caller has no async entry point), never at
 * module top level of a host plugin entry.
 */
import { createRequire } from 'module'
import * as path from 'path'
import type { StoriesEntry } from 'storybook/internal/types'

export interface StorybookProjectInfo {
  /** Absolute path to the config directory, e.g. `<project>/.storybook`. */
  configDir: string
  /** Absolute path to the resolved main config file. */
  mainConfigPath: string
  /** Storybook framework package, e.g. `@storybook/react-vite`. */
  frameworkPackage: string | undefined
  /** Storybook renderer, e.g. `react`, `vue3`. */
  renderer: string | undefined
  /** Storybook builder, e.g. `vite`, `webpack5`. */
  builder: string | undefined
  /** Raw `stories` entries from the main config (strings or specifier objects, unnormalised). */
  storiesGlobs: StoriesEntry[]
  /** Addon package names from the main config. */
  addons: string[]
}

const projectCache = new Map<string, Promise<StorybookProjectInfo | null>>()

/**
 * Resolves the user's Storybook project info for `cwd`, memoised per cwd.
 * Returns `null` when no Storybook main config is found — absence of a
 * config is not an error, callers fall back to their own defaults.
 */
export function resolveStorybookProject(
  cwd: string,
): Promise<StorybookProjectInfo | null> {
  const cached = projectCache.get(cwd)
  if (cached) return cached

  const promise = loadStorybookProject(cwd)
  projectCache.set(cwd, promise)
  return promise
}

async function loadStorybookProject(
  cwd: string,
): Promise<StorybookProjectInfo | null> {
  try {
    // `webpackIgnore` keeps this off Next's server webpack bundle — a
    // string-literal dynamic import is otherwise still statically bundled
    // (not just lazily run), and `storybook/internal/common` transitively
    // pulls in `oxc-resolver`'s native `.node` binding for tsconfig-paths
    // resolution, which webpack can't parse and fails the build.
    const { getStorybookInfo } = await import(
      /* webpackIgnore: true */ 'storybook/internal/common'
    )
    const info = await getStorybookInfo(path.resolve(cwd, '.storybook'), cwd)
    if (!info.mainConfigPath) return null

    return {
      configDir: info.configDir ?? path.resolve(cwd, '.storybook'),
      mainConfigPath: info.mainConfigPath,
      frameworkPackage: info.frameworkPackage,
      renderer: info.renderer,
      builder: info.builder,
      storiesGlobs: Array.isArray(info.mainConfig?.stories)
        ? info.mainConfig.stories
        : [],
      addons: info.addons ?? [],
    }
  } catch {
    // getStorybookInfo throws (invariant) when no main config is found
    // under the given configDir — that's the common "not a Storybook
    // project" case here, not a failure worth surfacing.
    return null
  }
}

let resolvedRoot: { value: string | undefined } | undefined

/**
 * Resolves the repository root the way Storybook itself does: the
 * `STORYBOOK_PROJECT_ROOT` env override, else the nearest ancestor under
 * version control, else the nearest ancestor with a workspace manifest or
 * lockfile. Memoised process-wide since the result can't change within a
 * single run.
 *
 * `getProjectRoot` takes no `cwd` argument — it always resolves against the
 * real `process.cwd()` at call time, not a caller-supplied directory — so
 * this only makes sense for hosts that run with the repo's own `cwd` (true
 * for every host in this package; each starts its dev server from the
 * project root).
 *
 * Synchronous because its one call site (`createStorybookDevframe`) builds
 * its result synchronously and has no async entry point to await from: a
 * Next.js `route.ts` re-exports its `GET`/`POST`/`DELETE` handlers directly
 * from that call, so it can't become async without breaking that public
 * API. `storybook` ships a CJS build as well as an ESM one, so a lazy
 * `require()` — never at module top level, since the module is large — gives
 * sync access.
 */
export function resolveProjectRootSync(): string | undefined {
  if (resolvedRoot) return resolvedRoot.value

  try {
    const require = createRequire(import.meta.url)
    const { getProjectRoot } = require('storybook/internal/common') as {
      getProjectRoot: () => string
    }
    resolvedRoot = { value: getProjectRoot() }
  } catch {
    resolvedRoot = { value: undefined }
  }
  return resolvedRoot.value
}
