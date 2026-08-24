import type { Plugin } from 'vite'
import type { FrameworkConfig } from './frameworks'
import { defineCommand, defineDockEntry } from '@vitejs/devtools-kit'
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import type { DevToolsViewAction, KitNodeContext } from '@vitejs/devtools-kit'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import {
  ConsoleNotificationService,
  DevToolsNotificationService,
} from './notifications'
import { computeCoverage } from './coverage-dashboard'
import {
  createStorybookDevframe,
  type StorybookDevframeState,
} from './devframe'
import {
  createComponentHighlighterUnplugin,
  getComponentHighlighterRuntimePaths,
  type ChDiagnostics,
  type ComponentHighlighterUnpluginHost,
} from './unplugin'

import type { SerializedRegistryInstance, RegistryDiff } from './shared-types'
export type { SerializedRegistryInstance, RegistryDiff }

const COMPONENT_HIGHLIGHTER_ICON =
  "data:image/svg+xml;utf8,<svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M12 1C12.5523 1 13 1.44772 13 2V7.5C13 7.77614 12.7761 8 12.5 8C12.2239 8 12 7.77614 12 7.5V2H2V12.0039H7.5C7.77612 12.0039 7.99996 12.2278 8 12.5039C8 12.78 7.77614 13.0039 7.5 13.0039H2C1.44771 13.0039 1 12.5562 1 12.0039V2C1 1.44772 1.44771 1 2 1H12Z' fill='%23515151'/><path d='M9.50098 6.00391C9.77697 6.00444 10.0004 6.22885 10 6.50488C9.99946 6.78088 9.77506 7.00427 9.49902 7.00391L7.70801 7.00098L12.8535 12.1465C13.0488 12.3417 13.0488 12.6583 12.8535 12.8535C12.6583 13.0488 12.3417 13.0488 12.1465 12.8535L7 7.70703V9.5C7 9.77614 6.77614 10 6.5 10C6.22386 10 6 9.77614 6 9.5V6.50391C6 6.46848 6.00276 6.43373 6.00977 6.40039C6.05604 6.1717 6.25871 5.99968 6.50098 6L9.50098 6.00391Z' fill='%23515151'/></svg>"

export interface ComponentHighlighterOptions {
  /** URL of the Storybook instance */
  storybookUrl?: string
  /**
   * Glob patterns to include for component instrumentation
   * @default ["**\/*.{tsx,jsx}"] for React, varies by framework
   */
  include?: string[]
  /**
   * Glob patterns to exclude from component instrumentation
   * @default ["**\/node_modules/**", "**\/dist/**", "**\/*.d.ts"]
   */
  exclude?: string[]
  /**
   * Event name for the "create story" event
   * @default 'component-highlighter:create-story'
   */
  eventName?: string
  /**
   * Whether to enable the overlay in development
   * @default true
   */
  enableOverlay?: boolean
  /**
   * Custom devtools dock ID
   * @default 'component-highlighter'
   */
  devtoolsDockId?: string
  /**
   * Force instrumentation even in production builds
   * @default false
   */
  force?: boolean
  /**
   * Enable verbose debug logging (browser console)
   * @default false
   */
  debugMode?: boolean
  /**
   * Automatically write story files when "Create Story" is clicked
   * @default true
   */
  writeStoryFiles?: boolean
  /**
   * Custom directory for story files (relative to component)
   * If not set, stories are created next to the component
   */
  storiesDir?: string
  /**
   * Whether to add `react`/`react-dom` to Vite's `resolve.dedupe`.
   *
   * The plugin's bundled `react-element-to-jsx-string` resolves *its own*
   * React (this plugin's copy), which can differ from your app's. When they
   * differ (e.g. your app is on React 18 but the plugin's copy is 19), the
   * library's internal `React.isValidElement` rejects your elements and prop
   * serialization silently degrades to a "Failed to serialize" placeholder.
   * Deduping forces a single React instance and fixes it.
   *
   * - `'auto'` (default): apply the dedupe **only** when a React major
   *   mismatch is detected. Single-version apps (the common React 19 case)
   *   get no config mutation at all.
   * - `true`: always apply.
   * - `false`: never apply. Use this only if you intentionally run multiple
   *   React copies (module federation / micro-frontends). If a mismatch is
   *   detected while disabled, a warning is logged (it never fails silently).
   *
   * @default 'auto'
   */
  dedupeReact?: boolean | 'auto'
  /**
   * React Server Components mode (React only).
   *
   * When `true`, only modules declaring a `"use client"` directive are
   * instrumented. Server components (no directive) are left untouched — they
   * never mount a client fiber, so tagging is useless and would pull the
   * client runtime into the server module graph. Use this for RSC frameworks
   * such as TanStack Start.
   *
   * When `false` (default), every matching module is instrumented — correct
   * for a plain SPA, where there is no `"use client"` directive but every
   * component runs on the client.
   *
   * @default false
   */
  rsc?: boolean
  /**
   * How the runtime devtools-hook script is delivered to the browser.
   *
   * - `'html'` (default): prepend an inline `<script>` to the served HTML
   *   via Vite's `transformIndexHtml`.
   * - `'entry'`: inject a side-effect import of the hook into the app's
   *   entry module(s) (matched by the `entry` option) instead, so it runs
   *   before the app bundle without an HTML transform.
   *
   * @default 'html'
   */
  hookInjection?: 'html' | 'entry'
  /**
   * Picomatch pattern(s) identifying the app's entry module id(s). Required
   * when `hookInjection` is `'entry'`.
   */
  entry?: string | string[]
}

/**
 * Create the component highlighter plugin for a specific framework. Returns
 * an array — Vite flattens plugin arrays — of the transform plugin and the
 * devframe mount plugin.
 */
export function createComponentHighlighterPlugin(
  framework: FrameworkConfig,
  options: ComponentHighlighterOptions = {},
): Plugin[] {
  const logDebug = (...args: unknown[]) => {
    if (options.debugMode) {
      console.log('[component-highlighter]', ...args)
    }
  }

  const runtimePaths = getComponentHighlighterRuntimePaths(framework)

  const {
    devtoolsDockId = 'component-highlighter',
    storybookUrl = 'http://localhost:6006',
    force = false,
    writeStoryFiles = true,
    storiesDir,
    dedupeReact = 'auto',
    hookInjection = 'html',
  } = options

  let isServe = false
  // Vite's standard CSP integration: when the app sets `html.cspNonce`, Vite
  // stamps its injected tags with this nonce. We mirror it onto the inline
  // DevTools-hook <script> so it survives a strict Content-Security-Policy.
  let cspNonce: string | undefined
  // Structured diagnostics (DevTools `ctx.diagnostics`), wired in `kitSetup`.
  // Handles surface non-fatal instrumentation issues — parse failures and
  // unsupported authoring patterns — to the DevTools UI.
  let chDiagnostics: ChDiagnostics | null = null

  // State shared between this plugin's transform hooks and the devframe's
  // RPC handlers (registered in `./devframe.ts`) and `kitSetup` below. Values
  // not yet known when the devframe's `setup(ctx)` runs (terminals, the
  // DevTools notification service, shared-state handles) are filled in by
  // `kitSetup`, which runs after it; handlers read these fields lazily at
  // call time so they always see the current value.
  const state: StorybookDevframeState = {
    server: undefined,
    notifications: new ConsoleNotificationService(),
    transformedComponents: new Map<string, string>(),
    devtoolsTerminals: null,
    storybookSession: null,
    terminalLogs: [],
    registryState: null,
    pendingVisitState: null,
    pendingTabState: null,
  }

  const host: ComponentHighlighterUnpluginHost = {
    isServe: () => isServe,
    loadDevSource: async (absPath) => {
      if (!state.server) return null
      const transformed = await state.server.transformRequest(absPath)
      return transformed?.code ?? null
    },
    transformedComponents: state.transformedComponents,
    getDiagnostics: () => chDiagnostics,
  }

  // The unplugin-produced Vite plugin carries the portable hooks: transform
  // (with the Vite-specific `{ ssr }` gate composed in via unplugin's `vite`
  // extension field), resolveId, and load. Extended below with the
  // Vite-only hooks unplugin has no equivalent for.
  const unpluginVitePlugin = createComponentHighlighterUnplugin(
    framework,
    options,
    host,
  ).vite() as Plugin

  const transformPlugin: Plugin = {
    ...unpluginVitePlugin,
    name: 'vite-plugin-experimental-storybook-devtools',
    enforce: 'pre',
    configResolved(config) {
      isServe = config.command === 'serve'
      cspNonce = (config as { html?: { cspNonce?: string } }).html?.cspNonce
    },
    config: (viteConfig) => {
      viteConfig.optimizeDeps ??= {}
      // Exclude our client modules from dep optimization – they are ESM and
      // don't need pre-bundling. Including them causes unnecessary dep
      // re-optimization on first load.
      viteConfig.optimizeDeps.exclude ??= []
      viteConfig.optimizeDeps.exclude.push(
        'vite-plugin-experimental-storybook-devtools/client/vite-devtools',
        'vite-plugin-experimental-storybook-devtools/client/listeners',
        'vite-plugin-experimental-storybook-devtools/client/overlay',
      )

      // @testing-library/dom and aria-query are CJS-only packages. Pre-bundle
      // them so Vite handles the CJS→ESM conversion and named imports work.
      // Use the `vite-plugin-experimental-storybook-devtools > @testing-library/dom`
      // form so Vite resolves these deps from THIS plugin's node_modules. With
      // pnpm's isolated store the packages are not hoisted into the consumer's
      // node_modules, so a bare `@testing-library/dom` specifier fails to resolve.
      viteConfig.optimizeDeps.include ??= []
      viteConfig.optimizeDeps.include.push(
        'vite-plugin-experimental-storybook-devtools > @testing-library/dom',
        'aria-query',
      )

      // The client modules above are excluded from optimization, so Vite never
      // crawls them at startup and never discovers their third-party imports.
      // Without this, those deps are found lazily when DevTools connects,
      // triggering a mid-session re-optimization + full page reload in every
      // consuming app. Pre-declare them so they are bundled at server startup.
      viteConfig.optimizeDeps.include.push(
        'xstate',
        'nanoevents',
        '@medv/finder',
        'dom-accessibility-api',
      )

      if (framework.name === 'react') {
        // react-element-to-jsx-string and its dependency react-is are CJS-only
        // packages that live in this plugin's node_modules, not the consumer's.
        // We use resolve.alias to redirect the imports to our copies so Vite's
        // dep optimizer can find them. optimizeDeps.include triggers pre-bundling
        // (CJS→ESM conversion) so named imports work in the browser.
        // IMPORTANT: alias must be used instead of a resolveId hook here — aliases
        // are applied before the dep optimization lookup, so Vite pre-bundles the
        // result. A resolveId hook returning an absolute path bypasses the cache
        // and serves the raw CJS file, which breaks named ESM imports.
        const _require = createRequire(import.meta.url)
        viteConfig.resolve ??= {}
        // alias can be an array or a plain object; normalise to a mutable array
        type AliasEntry = { find: string | RegExp; replacement: string }
        const existingAliases: AliasEntry[] = Array.isArray(viteConfig.resolve.alias)
          ? [...viteConfig.resolve.alias]
          : Object.entries(viteConfig.resolve.alias ?? {}).map(
              ([find, replacement]) => ({ find, replacement }),
            )
        viteConfig.resolve.alias = [
          ...existingAliases,
          {
            find: 'react-element-to-jsx-string/dist/esm/index.js',
            replacement: _require.resolve(
              'react-element-to-jsx-string/dist/esm/index.js',
            ),
          },
          {
            find: 'react-is',
            replacement: _require.resolve('react-is'),
          },
        ]
        viteConfig.optimizeDeps.include.push(
          'react-element-to-jsx-string/dist/esm/index.js',
          'react-is',
        )

        // react-element-to-jsx-string is resolved from THIS plugin's
        // node_modules (it is not the consumer's dependency). Its own
        // `import React from 'react'` therefore binds the plugin's pinned
        // React copy. If that differs from the app's React (e.g. the app is
        // on React 18 but the plugin's copy is 19), the library's internal
        // `React.isValidElement` rejects the app's elements and prop
        // serialization silently degrades to `{/* Failed to serialize */}`.
        // Adding react/react-dom to resolve.dedupe forces a single React
        // instance across the client graph (app + runtime + serializer).
        //
        // This is only *needed* when the majors mismatch. By default
        // (`dedupeReact: 'auto'`) we detect that and apply the dedupe only
        // then — so a single-version app (the common React 19 case today)
        // gets no config mutation at all.
        const majorOf = (fromDir: string): number | null => {
          try {
            const req = createRequire(path.join(fromDir, 'noop.js'))
            const pkg = req('react/package.json') as { version?: string }
            const m = /^(\d+)\./.exec(pkg.version || '')
            return m ? Number(m[1]) : null
          } catch {
            return null
          }
        }
        const appRoot =
          (viteConfig.root && path.resolve(viteConfig.root)) || process.cwd()
        const appReactMajor = majorOf(appRoot)
        const pluginReactMajor = majorOf(
          path.dirname(fileURLToPath(import.meta.url)),
        )
        // Mismatch (or an undetectable app version → assume the safe path).
        const mismatch =
          appReactMajor === null ||
          pluginReactMajor === null ||
          appReactMajor !== pluginReactMajor

        const shouldDedupe =
          dedupeReact === true ||
          (dedupeReact === 'auto' && mismatch)

        logDebug(
          `dedupeReact=${String(dedupeReact)} appReactMajor=${appReactMajor} ` +
            `pluginReactMajor=${pluginReactMajor} mismatch=${mismatch} ` +
            `→ ${shouldDedupe ? 'APPLY react/react-dom dedupe' : 'NO config mutation'}`,
        )
        if (shouldDedupe) {
          viteConfig.resolve.dedupe ??= []
          for (const dep of ['react', 'react-dom']) {
            if (!viteConfig.resolve.dedupe.includes(dep)) {
              viteConfig.resolve.dedupe.push(dep)
            }
          }
        } else if (dedupeReact === false && mismatch) {
          // Never fail silently: the user explicitly opted out but we detect
          // the exact condition that degrades prop serialization.
          console.warn(
            '[component-highlighter] Detected a React version mismatch ' +
              `(app: ${appReactMajor ?? 'unknown'}, plugin serializer: ` +
              `${pluginReactMajor ?? 'unknown'}) while \`dedupeReact: false\`. ` +
              'Prop serialization may degrade to "Failed to serialize". ' +
              'Add react/react-dom to resolve.dedupe, or set ' +
              "`dedupeReact: 'auto'`. See the README (React version support).",
          )
        }
      }
    },
    configureServer(srv) {
      state.server = srv

      if (fs.existsSync(runtimePaths.runtimeHelperSourcePath)) {
        srv.watcher.add(runtimePaths.runtimeHelperSourcePath)
      }
      if (fs.existsSync(runtimePaths.runtimeModuleSourcePath)) {
        srv.watcher.add(runtimePaths.runtimeModuleSourcePath)
      }
    },
    transformIndexHtml() {
      // The 'entry' hook-injection strategy delivers the devtools hook via
      // a module import instead — injecting it here too would run it twice.
      if (hookInjection === 'entry') return
      if (!isServe && !force) return
      const snippet = framework.htmlHeadSnippet?.()
      if (!snippet) return
      return [
        {
          tag: 'script',
          attrs: {
            type: 'text/javascript',
            ...(cspNonce ? { nonce: cspNonce } : {}),
          },
          children: snippet,
          injectTo: 'head-prepend',
        },
      ]
    },
    handleHotUpdate(ctx) {
      if (ctx.file === runtimePaths.runtimeHelperSourcePath) {
        const mod = ctx.server.moduleGraph.getModuleById(
          runtimePaths.resolvedRuntimeHelperVirtualId,
        )
        return mod ? [mod] : []
      }
      if (ctx.file === runtimePaths.runtimeModuleSourcePath) {
        const mod = ctx.server.moduleGraph.getModuleById(
          runtimePaths.resolvedFrameworkVirtualModuleId,
        )
        return mod ? [mod] : []
      }
      return
    },
  }

  const definition = createStorybookDevframe({
    framework,
    storybookUrl,
    writeStoryFiles,
    storiesDir,
    logDebug,
    state,
  })

  // Kit-only setup: docks, commands, terminals, messages, diagnostics — none
  // of these are part of the portable `DevframeNodeContext`, so they're wired
  // here (against the kit-augmented `KitNodeContext`) rather than in the
  // devframe's own `setup(ctx)`. Runs after the devframe-level setup above.
  const kitSetup = (ctx: KitNodeContext) => {
    // Upgrade to DevTools notifications when the Messages API is available.
    if (ctx.messages) {
      state.notifications = new DevToolsNotificationService(ctx.messages)
    }

    // Structured diagnostics: a coded catalog of the plugin's non-fatal
    // detection gaps, surfaced through the DevTools diagnostics host instead
    // of bare console warnings. Emitted from the transform hook.
    if (ctx.diagnostics) {
      const diagnostics = ctx.diagnostics.defineDiagnostics({
        // Function form returns a clean URL for every code (the string form
        // would append the lowercased code as a path segment).
        docsBase: () =>
          'https://github.com/yannbf/vite-plugin-experimental-storybook-devtools/blob/main/docs/REACT_PATTERNS.md',
        codes: {
          CH_TRANSFORM_FAILED: {
            why: (p: { file: string; detail: string }) =>
              `Failed to instrument ${p.file} for component detection: ${p.detail}`,
            fix: 'The file was served unmodified, so its components have no stories/highlights. Check that it parses as valid TS/JSX.',
          },
          CH_UNSUPPORTED_PATTERN: {
            why: (p: { name: string; detail: string }) =>
              `Component "${p.name}" can’t be detected: ${p.detail}`,
            fix: 'See the supported authoring-pattern matrix for the recommended form.',
          },
        },
      })
      ctx.diagnostics.register(diagnostics)
      chDiagnostics = diagnostics as ChDiagnostics
    }

    // Store terminals reference for the start-storybook RPC handler
    state.devtoolsTerminals = ctx.terminals

    // Register dock entry for component highlighter UI
    ctx.docks.register(
      defineDockEntry<DevToolsViewAction>({
        id: devtoolsDockId,
        title: 'Component Highlighter',
        icon: COMPONENT_HIGHLIGHTER_ICON,
        type: 'action',
        action: {
          importFrom:
            'vite-plugin-experimental-storybook-devtools/client/vite-devtools',
          importName: 'default',
        },
      }),
    )

    // ─── Helper: open a specific tab in the panel ──────────────────

    function openPanelTab(tab: string) {
      // Store in shared state so the panel picks it up on load or via subscription
      if (state.pendingTabState) {
        state.pendingTabState.mutate(() => tab)
      }
      // Tell the client to switch the dock to the panel (if not already open)
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-open-panel-tab',
        args: [{ tab }],
      })
      // Tell the panel directly to switch tabs (if already open)
      ctx.rpc.broadcast({
        method: 'component-highlighter:do-switch-tab',
        args: [{ tab }],
      })
    }

    // ─── Commands (Mod+K palette) ──────────────────────────────────

    ctx.commands.register(
      defineCommand({
        id: 'storybook:toggle-highlight-mode',
        title: 'Toggle Component Highlighter',
        description: 'Start or stop inspecting components on the page',
        icon: 'ph:crosshair',
        category: 'Storybook',
        keybindings: [{ key: 'Mod+Shift+H' }],
        handler: () => {
          ctx.rpc.broadcast({
            method: 'component-highlighter:do-set-highlight-mode',
            args: [{ enabled: true, toggle: true }],
          })
        },
      }),
    )

    ctx.commands.register(
      defineCommand({
        id: 'storybook:create-missing-stories',
        title: 'Write Stories for Missing Components',
        description:
          'Generate story files for all visible components without stories',
        icon: 'ph:file-plus-duotone',
        category: 'Storybook',
        handler: async () => {
          // Use the registry snapshot + coverage data to find uncovered visible components
          const coverage = computeCoverage(
            state.transformedComponents,
            ctx.cwd,
            storiesDir,
          )
          const uncovered = coverage.entries.filter((e) => !e.hasStory)
          if (uncovered.length === 0) {
            state.notifications.notify({
              message: 'All components already have stories',
              level: 'success',
              toast: true,
              autoDismissMs: 3000,
              category: 'story-creation',
            })
            return
          }

          // Find visible uncovered components in the registry snapshot
          let storiesCreated = 0
          for (const entry of uncovered) {
            // Find a matching instance in the registry
            const allInstances = state.registryState?.value() ?? []
            const instances = (
              allInstances as SerializedRegistryInstance[]
            ).filter(
              (inst) =>
                inst.meta.filePath === entry.filePath && inst.isConnected,
            )
            if (instances.length === 0) continue

            // Deduplicate by props fingerprint
            const seen = new Set<string>()
            for (const inst of instances) {
              const fp = inst.serializedProps
                ? JSON.stringify(inst.serializedProps)
                : '{}'
              if (seen.has(fp)) continue
              seen.add(fp)

              // Invoke the create-story handler directly
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (ctx.rpc.invokeLocal as any)(
                'component-highlighter:create-story',
                {
                  meta: inst.meta,
                  serializedProps: inst.serializedProps,
                  skipNavigation: true,
                },
              )
              storiesCreated++
            }
          }

          state.notifications.notify({
            message:
              storiesCreated > 0
                ? `Created stories for ${storiesCreated} component${storiesCreated === 1 ? '' : 's'}`
                : 'No visible uncovered components found — navigate to a page with components first',
            level: storiesCreated > 0 ? 'success' : 'info',
            toast: true,
            autoDismissMs: 4000,
            category: 'story-creation',
          })

          // Open the coverage tab so the user can see the updated results
          openPanelTab('coverage')
        },
      }),
    )

    ctx.commands.register(
      defineCommand({
        id: 'storybook:see-coverage',
        title: 'See Component Coverage',
        description:
          'Open the coverage dashboard showing story status for all components',
        icon: 'ph:chart-bar-duotone',
        category: 'Storybook',
        handler: () => {
          openPanelTab('coverage')
        },
      }),
    )

    ctx.commands.register(
      defineCommand({
        id: 'storybook:open-docs',
        title: 'Open Storybook Docs',
        description: 'Open the Storybook documentation website',
        icon: 'ph:book-open-duotone',
        category: 'Storybook',
        handler: () => {
          // Server-side commands can't open browser tabs directly,
          // but we can broadcast to the client to do it
          ctx.rpc.broadcast({
            method: 'component-highlighter:do-open-url',
            args: [{ url: 'https://storybook.js.org/docs' }],
          })
        },
      }),
    )
  }

  return [
    transformPlugin,
    createPluginFromDevframe(definition, { setup: kitSetup }),
  ]
}
