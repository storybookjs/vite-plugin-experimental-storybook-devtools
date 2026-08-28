/**
 * Portable instrumentation core, built on `unplugin`.
 *
 * Owns everything that has no bundler-specific shape: the transform pipeline
 * (filter → framework.detect → framework.transform), the virtual modules
 * (runtime helpers, the framework runtime module, the devtools-hook module),
 * and the entry-injection strategy for delivering the devtools hook without
 * an HTML transform. Bundler-only concerns a plugin still needs — reading a
 * file through a running dev server, config/HTML mutation, HMR wiring — are
 * supplied by the caller through {@link ComponentHighlighterUnpluginHost} or
 * layered on afterwards (see `src/create-component-highlighter-plugin.ts`,
 * the Vite adapter).
 *
 * unplugin's generic `transform` hook type has no third parameter, so it
 * cannot see Vite's `{ ssr }` transform option — SSR must never run this
 * instrumentation (the runtime module uses browser-only APIs). The `vite`
 * field on `UnpluginOptions` is unplugin's own per-bundler override
 * mechanism: at `.vite()` time it is `Object.assign`-merged onto the
 * produced plugin, so `vite.transform` fully replaces the generic
 * `transform` for the Vite target. That replacement is a thin wrapper
 * around the same core logic that adds the `{ ssr }` gate Vite's real
 * transform hook receives as its third argument.
 */
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createFilter } from 'vite'
import { createUnplugin } from 'unplugin'
import type { UnpluginOptions } from 'unplugin'
import type { FrameworkConfig } from './frameworks'
import type { TransformIssue } from './frameworks/types'
import type { ComponentHighlighterOptions } from './create-component-highlighter-plugin'

/** Structured diagnostics dispatch, registered by the DevTools kit (see `kitSetup` in the Vite adapter). Not part of unplugin's or devframe's portable context. */
export type ChDiagnostics = {
  CH_TRANSFORM_FAILED: (p: {
    file: string
    detail: string
    sources?: string[]
  }) => unknown
  CH_UNSUPPORTED_PATTERN: (p: {
    name: string
    file: string
    detail: string
    sources?: string[]
  }) => unknown
}

/**
 * Bundler-supplied dependencies the portable core cannot provide itself.
 * The Vite adapter is currently the only implementer.
 */
export interface ComponentHighlighterUnpluginHost {
  /** Whether the dev server is running (Vite: `config.command === 'serve'`). */
  isServe: () => boolean
  /**
   * Read a file's transformed dev-source through a running dev server.
   * Returns `null` (or is omitted) to fall back to reading the file straight
   * off disk. Vite-only: backed by `server.transformRequest`.
   */
  loadDevSource?: (absPath: string) => Promise<string | null>
  /** Component name → file path, shared with the coverage dashboard. */
  transformedComponents: Map<string, string>
  /** Current diagnostics dispatch, or `null` before the kit registers it. */
  getDiagnostics: () => ChDiagnostics | null
}

/** Virtual module whose body is the framework's inline devtools-hook script, for the `entry` hook-injection strategy. */
export const DEVTOOLS_HOOK_VIRTUAL_ID = 'virtual:component-highlighter/devtools-hook'
const RESOLVED_DEVTOOLS_HOOK_VIRTUAL_ID = `\0${DEVTOOLS_HOOK_VIRTUAL_ID}`
const DEVTOOLS_HOOK_IMPORT_STATEMENT = `import '${DEVTOOLS_HOOK_VIRTUAL_ID}'\n`

export interface ComponentHighlighterRuntimePaths {
  packageRoot: string
  runtimeHelperVirtualId: string
  resolvedRuntimeHelperVirtualId: string
  runtimeHelperFilePath: string
  runtimeHelperSourcePath: string
  runtimeModuleSourcePath: string
  runtimeModuleFilePath: string
  resolvedFrameworkVirtualModuleId: string
}

/**
 * Computes the runtime-helper and framework-runtime-module paths for a
 * framework. Shared by the portable core's `resolveId`/`load` and by the
 * Vite adapter's `configureServer` (watcher registration) and
 * `handleHotUpdate` (module-graph invalidation), which have no unplugin
 * equivalent and stay Vite-only.
 */
export function getComponentHighlighterRuntimePaths(
  framework: FrameworkConfig,
): ComponentHighlighterRuntimePaths {
  const runtimeHelperVirtualId = 'virtual:component-highlighter/runtime-helpers'
  const resolvedRuntimeHelperVirtualId = `\0${runtimeHelperVirtualId}`
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const runtimeHelperFilePath = path.join(
    packageRoot,
    'dist',
    'runtime-helpers.mjs',
  )
  const runtimeHelperSourcePath = path.join(
    packageRoot,
    'src',
    'runtime-helpers.ts',
  )
  const runtimeModuleSourcePath = path.join(
    packageRoot,
    'src',
    `${framework.runtimeModuleFile}.ts`,
  )
  const runtimeModuleFilePath = path.join(
    packageRoot,
    'dist',
    `${framework.runtimeModuleFile}.mjs`,
  )
  return {
    packageRoot,
    runtimeHelperVirtualId,
    resolvedRuntimeHelperVirtualId,
    runtimeHelperFilePath,
    runtimeHelperSourcePath,
    runtimeModuleSourcePath,
    runtimeModuleFilePath,
    resolvedFrameworkVirtualModuleId: '\0' + framework.virtualModuleId,
  }
}

function buildComponentHighlighterUnpluginOptions(
  framework: FrameworkConfig,
  options: ComponentHighlighterOptions,
  host: ComponentHighlighterUnpluginHost,
): UnpluginOptions {
  const {
    include = framework.extensions.map((ext) => `**/*${ext}`),
    exclude = [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.d.ts',
      '**/*.stories.*',
      '**/stories.*',
      '**/*.story.*',
      '**/story.*',
    ],
    force = false,
    debugMode = false,
    rsc = false,
    hookInjection = 'html',
    entry,
  } = options

  if (hookInjection === 'entry' && !entry) {
    throw new Error(
      "[component-highlighter] hookInjection: 'entry' requires an `entry` option " +
        '(picomatch pattern(s) matching the app entry module id).',
    )
  }

  const filter = createFilter(include, exclude)
  const entryFilter = entry ? createFilter(entry) : undefined
  // A file re-transforms on every edit; report each distinct diagnostic once.
  const reportedDiagnostics = new Set<string>()

  const paths = getComponentHighlighterRuntimePaths(framework)

  const logDebug = (...args: unknown[]) => {
    if (debugMode) {
      console.log('[component-highlighter]', ...args)
    }
  }

  function runTransform(
    code: string,
    id: string,
    viteOptions?: { ssr?: boolean | undefined },
  ): string | undefined {
    // Only transform in dev/serve mode unless force is enabled.
    if (!host.isServe() && !force) {
      return
    }

    // Never instrument components for SSR builds — the runtime module uses
    // browser-only APIs (CustomEvent, window) and would crash in Node.js.
    if (viteOptions?.ssr) {
      return
    }

    let workingCode = code
    let mutated = false

    if (hookInjection === 'entry' && entryFilter?.(id)) {
      // Vite re-runs `transform` from the on-disk source on every HMR
      // update — there is no cross-call state to key a dedupe set on that
      // would not go stale the moment the entry file is next edited. The
      // content check alone is both sufficient and correct: each call
      // starts from fresh source, so a call whose input does not already
      // carry the import always needs it, and one whose input already does
      // (e.g. the author wrote it by hand) never needs it twice.
      if (!workingCode.includes(DEVTOOLS_HOOK_VIRTUAL_ID)) {
        // ES import hoisting runs this before the rest of the module body,
        // and before the framework loads — independent of where it lands
        // relative to other imports.
        workingCode = DEVTOOLS_HOOK_IMPORT_STATEMENT + workingCode
        mutated = true
      }
    }

    // Skip non-matching files.
    if (!filter(id)) {
      return mutated ? workingCode : undefined
    }

    // Check if this framework handles this file.
    if (!framework.detect(workingCode, id)) {
      return mutated ? workingCode : undefined
    }

    logDebug(`Transforming ${id}`)

    const result = framework.transform(workingCode, id, {
      rsc,
      onIssue: (issue: TransformIssue) => {
        const diagnostics = host.getDiagnostics()
        if (!diagnostics) return
        const key = `${issue.code}:${issue.file}:${issue.name ?? ''}`
        if (reportedDiagnostics.has(key)) return
        reportedDiagnostics.add(key)
        const sources = issue.loc ? [issue.loc] : undefined
        if (issue.code === 'transform-failed') {
          diagnostics.CH_TRANSFORM_FAILED({
            file: issue.file,
            detail: issue.detail,
            ...(sources ? { sources } : {}),
          })
        } else {
          diagnostics.CH_UNSUPPORTED_PATTERN({
            name: issue.name ?? 'component',
            file: issue.file,
            detail: issue.detail,
            ...(sources ? { sources } : {}),
          })
        }
      },
    })

    // Track transformed components for coverage.
    if (result) {
      const componentName = path.basename(id, path.extname(id))
      host.transformedComponents.set(componentName, id)
    }

    return result ?? (mutated ? workingCode : undefined)
  }

  return {
    name: 'vite-plugin-experimental-storybook-devtools',
    enforce: 'pre',
    resolveId(id: string) {
      // HMR invalidation appends ?t=<timestamp> to re-fetched imports —
      // strip any query before matching our virtual ids.
      const bareId = id.split('?', 1)[0]!
      if (bareId === paths.runtimeHelperVirtualId) {
        return paths.resolvedRuntimeHelperVirtualId
      }
      if (bareId === paths.resolvedRuntimeHelperVirtualId) {
        return paths.resolvedRuntimeHelperVirtualId
      }
      if (bareId === framework.virtualModuleId) {
        return '\0' + bareId
      }
      if (bareId === DEVTOOLS_HOOK_VIRTUAL_ID) {
        return RESOLVED_DEVTOOLS_HOOK_VIRTUAL_ID
      }
      return null
    },
    async load(id: string) {
      if (id === paths.resolvedRuntimeHelperVirtualId) {
        const shouldUseSource =
          host.isServe() && fs.existsSync(paths.runtimeHelperSourcePath)

        if (shouldUseSource) {
          const devSource = await host.loadDevSource?.(
            paths.runtimeHelperSourcePath,
          )
          if (devSource != null) {
            return devSource
          }
          return fs.readFileSync(paths.runtimeHelperSourcePath, 'utf-8')
        }

        if (!fs.existsSync(paths.runtimeHelperFilePath)) {
          throw new Error(
            '[component-highlighter] runtime helpers not built. Run `pnpm build` first.',
          )
        }
        return fs.readFileSync(paths.runtimeHelperFilePath, 'utf-8')
      }
      if (id === paths.resolvedFrameworkVirtualModuleId) {
        const shouldUseSource =
          host.isServe() && fs.existsSync(paths.runtimeModuleSourcePath)

        // Replace the loader-injected build constants declared by the runtime
        // modules (`declare const __COMPONENT_HIGHLIGHTER_*__`). The project
        // root lets the Vue runtime derive exact cwd-relative paths at runtime
        // (React gets them from its build-time transform instead).
        const injectBuildConstants = (code: string) =>
          code
            .replace(
              /__COMPONENT_HIGHLIGHTER_DEBUG__/g,
              debugMode ? 'true' : 'false',
            )
            .replace(/__COMPONENT_HIGHLIGHTER_ROOT__/g, () =>
              JSON.stringify(process.cwd().replace(/\\/g, '/')),
            )

        // Vite's import-analysis rewrites the helpers import to its /@id/
        // form and, after an HMR invalidation, appends a `?t=<timestamp>`
        // query. Normalize both back to the bare virtual id so resolveId
        // matches when the browser re-imports this module.
        const normalizeRuntimeImports = (code: string) =>
          code
            .replace(
              /\/\@id\/__x00__virtual:component-highlighter\/runtime-helpers(\?t=\d+)?/g,
              'virtual:component-highlighter/runtime-helpers',
            )
            .replace(
              /\/_nuxtvirtual:component-highlighter\/runtime-helpers(\?t=\d+)?/g,
              'virtual:component-highlighter/runtime-helpers',
            )

        if (shouldUseSource) {
          const devSource = await host.loadDevSource?.(
            paths.runtimeModuleSourcePath,
          )
          if (devSource != null) {
            return injectBuildConstants(normalizeRuntimeImports(devSource))
          }
          return injectBuildConstants(
            normalizeRuntimeImports(
              fs.readFileSync(paths.runtimeModuleSourcePath, 'utf-8'),
            ),
          )
        }

        if (!fs.existsSync(paths.runtimeModuleFilePath)) {
          throw new Error(
            '[component-highlighter] runtime module not built. Run `pnpm build` first.',
          )
        }

        return injectBuildConstants(
          normalizeRuntimeImports(
            fs.readFileSync(paths.runtimeModuleFilePath, 'utf-8'),
          ),
        )
      }
      if (id === RESOLVED_DEVTOOLS_HOOK_VIRTUAL_ID) {
        return framework.htmlHeadSnippet?.() ?? ''
      }
      return null
    },
    transform(code: string, id: string) {
      return runTransform(code, id)
    },
    vite: {
      // Untyped third parameter: letting it flow from the `UnpluginOptions`
      // return type's `vite: Partial<VitePlugin>` contextual type is what
      // gives it Vite's real `{ ssr, moduleType }` transform-options shape.
      transform(code, id, viteOptions) {
        return runTransform(code, id, viteOptions)
      },
    },
  }
}

/**
 * Builds the `unplugin` instance for one framework + options combination.
 * `.vite()` produces the Vite plugin (composed further by
 * `create-component-highlighter-plugin.ts` with Vite-only hooks); the same
 * call is also how unit tests exercise the real, Vite-composed hooks
 * (including the `{ ssr }`-gated transform) without a running Vite instance.
 */
export function createComponentHighlighterUnplugin(
  framework: FrameworkConfig,
  options: ComponentHighlighterOptions,
  host: ComponentHighlighterUnpluginHost,
) {
  return createUnplugin(() =>
    buildComponentHighlighterUnpluginOptions(framework, options, host),
  )
}
