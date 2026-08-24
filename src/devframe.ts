/**
 * Storybook devframe definition.
 *
 * Registers the plugin's RPC surface and shared state on the devframe-level
 * `DevframeNodeContext` — the framework-neutral context every devframe
 * `setup()` receives, whether mounted standalone or (as here) inside Vite
 * DevTools via `createPluginFromDevframe`. Kit-only surfaces (docks,
 * terminals, messages, commands) aren't part of this context; they're wired
 * separately in `create-component-highlighter-plugin.ts`'s `kitSetup`, which
 * runs after this file's `setup(ctx)` and shares mutable state with it
 * through `deps.state`.
 */
import { createRequire } from 'module'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { ViteDevServer } from 'vite'
import { defineDevframe, defineRpcFunction } from 'devframe'
import type { FrameworkConfig, SerializedProps } from './frameworks'
import type { NotificationService } from './notifications'
import type { SerializedRegistryInstance, RegistryDiff } from './shared-types'
import type { CoverageData } from './coverage-dashboard'
import { computeCoverage } from './coverage-dashboard'

// RPC function type declarations. `devframe` (not `@vitejs/devtools-kit`) owns
// these registries as of kit 0.6 — the kit re-exports the same interfaces, so
// client code augmenting either module sees the same merged shape.
declare module 'devframe' {
  interface DevframeRpcServerFunctions {
    'component-highlighter:highlight-target': (
      data: ComponentHighlightData | null,
    ) => void
    'component-highlighter:toggle-overlay': (data: { enabled: boolean }) => void
    'component-highlighter:create-story': (data: ComponentStoryData) => void
    'component-highlighter:get-coverage': () => CoverageData
    'component-highlighter:push-registry-diff': (diff: RegistryDiff) => void
    'component-highlighter:scroll-to-component': (data: {
      componentName: string
    }) => void
    'component-highlighter:highlight-coverage-instances': (
      data: { componentName: string; hasStory: boolean } | null,
    ) => void
    'component-highlighter:highlight-coverage-batch': (
      data: Array<{ componentName: string; hasStory: boolean }>,
    ) => void
    'component-highlighter:set-highlight-mode': (data: {
      enabled: boolean
    }) => void
    'component-highlighter:visit-story': (data: {
      relativeFilePath: string
      preferredStoryName?: string
    }) => void
    'component-highlighter:notify': (data: {
      message: string
      level?: string
    }) => void
    'component-highlighter:select-component': (
      data: SerializedRegistryInstance | null,
    ) => void
    'component-highlighter:set-prop': (data: {
      id: string
      path: Array<string | number>
      payload: { kind: string; text: string }
    }) => void
    'component-highlighter:reset-prop': (data: {
      id: string
      path: Array<string | number>
    }) => void
    /** Panel bootstrap config — the auto-derived panel dock URL can't carry query params, so the panel fetches this over RPC. */
    'component-highlighter:get-config': () => { storybookUrl: string; cwd: string }
    'component-highlighter:storybook-status': () => { running: boolean }
    'component-highlighter:storybook-index': () => unknown
    'component-highlighter:start-storybook': () => {
      started: boolean
      alreadyRunning?: boolean
      error?: string
    }
    'component-highlighter:get-terminal-logs': (arg: {
      since: number
    }) => { lines: string[]; total: number }
    'component-highlighter:check-story': (arg: {
      componentPath: string
    }) => { hasStory: boolean; storyPath: string | null }
  }

  interface DevframeRpcClientFunctions {
    'component-highlighter:do-scroll-to-component': (data: {
      componentName: string
    }) => void
    'component-highlighter:do-highlight-coverage': (
      data: { componentName: string; hasStory: boolean } | null,
    ) => void
    'component-highlighter:do-highlight-coverage-batch': (
      data: Array<{ componentName: string; hasStory: boolean }>,
    ) => void
    'component-highlighter:do-set-highlight-mode': (data: {
      enabled: boolean
      toggle?: boolean
    }) => void
    'component-highlighter:do-visit-story': (data: {
      relativeFilePath: string
      preferredStoryName?: string
    }) => void
    'component-highlighter:do-open-url': (data: { url: string }) => void
    'component-highlighter:do-open-panel-tab': (data: { tab: string }) => void
    'component-highlighter:do-switch-tab': (data: { tab: string }) => void
    'component-highlighter:do-select-component': (
      data: SerializedRegistryInstance | null,
    ) => void
    'component-highlighter:do-set-prop': (data: {
      id: string
      path: Array<string | number>
      payload: { kind: string; text: string }
    }) => void
    'component-highlighter:do-reset-prop': (data: {
      id: string
      path: Array<string | number>
    }) => void
    /** Server→client broadcast announcing a story file write finished (success or failure). */
    'component-highlighter:story-created': (data: {
      filePath: string
      componentName: string
      componentPath: string
      relativeFilePath?: string
      storyName: string
      isAppend: boolean
      skipNavigation?: boolean
    }) => void
  }

  interface DevframeRpcSharedStates {
    'component-highlighter:registry': SerializedRegistryInstance[]
    'component-highlighter:pending-visit': {
      relativeFilePath: string
      preferredStoryName?: string
    } | null
    'component-highlighter:pending-tab': string | null
    'component-highlighter:highlight-active': boolean
    'component-highlighter:selected-component': SerializedRegistryInstance | null
    'component-highlighter:highlighter-tab-active': boolean
  }
}

interface ComponentHighlightData {
  meta: {
    componentName: string
    filePath: string
    relativeFilePath?: string
    sourceId: string
    isDefaultExport?: boolean
  }
  props: Record<string, unknown>
  serializedProps?: SerializedProps
  rect: DOMRect
}

interface ComponentStoryData {
  meta: {
    componentName: string
    filePath: string
    relativeFilePath?: string
    sourceId: string
    isDefaultExport?: boolean
  }
  /**
   * Story generation reads `serializedProps` only — raw live props hold
   * unclonable values and are never sent over RPC.
   */
  serializedProps?: SerializedProps
  /** Component registry for import resolution: componentName -> filePath */
  componentRegistry?: Record<string, string>
  /** Custom story name */
  storyName?: string
  /** Play function code lines generated from recorded interactions */
  playFunction?: string[]
  /** Import statements required by the play function */
  playImports?: string[]
  /** When true, skip navigating to the story after creation (e.g. batch "Create all") */
  skipNavigation?: boolean
}

/**
 * Mutable state shared between the transform plugin and this devframe's
 * RPC handlers. Values not yet known at devframe-`setup()` time (terminals,
 * the DevTools notification service, shared-state handles) are populated
 * later by `kitSetup` in `create-component-highlighter-plugin.ts` — RPC
 * handlers read these fields lazily at call time, by which point setup has
 * completed.
 */
export interface StorybookDevframeState {
  server: ViteDevServer | undefined
  notifications: NotificationService
  transformedComponents: Map<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  devtoolsTerminals: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storybookSession: any
  terminalLogs: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registryState: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingVisitState: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pendingTabState: any
}

export interface CreateStorybookDevframeDeps {
  framework: FrameworkConfig
  storybookUrl: string
  writeStoryFiles: boolean
  storiesDir: string | undefined
  logDebug: (...args: unknown[]) => void
  state: StorybookDevframeState
}

const MAX_LOG_LINES = 2000

const STORYBOOK_ICON =
  "data:image/svg+xml;utf8,<svg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'><g transform='translate(1.49,0)'><path d='M0.424547 12.6139L0.000492865 1.31474C-0.013512 0.941579 0.272618 0.625325 0.645319 0.602032L10.256 0.00136365C10.6354 -0.0223467 10.9621 0.265968 10.9858 0.645333C10.9867 0.659626 10.9872 0.673944 10.9872 0.688265V13.0006C10.9872 13.3808 10.679 13.6889 10.2989 13.6889C10.2886 13.6889 10.2783 13.6887 10.2681 13.6882L1.08142 13.2756C0.723641 13.2595 0.437978 12.9717 0.424547 12.6139Z' fill='%23FF4785'/></g><g transform='translate(4.32,0.05)'><path d='M2.8709 2.41309C4.66253 2.41309 5.64141 3.37189 5.64141 5.19531C5.39918 5.38328 3.59731 5.51136 3.59551 5.24414C3.63363 4.2224 3.17581 4.17676 2.92168 4.17676C2.6802 4.17684 2.27422 4.25082 2.27422 4.79785C2.27474 6.1477 5.75567 6.07536 5.75567 8.7998C5.75543 10.3321 4.50986 11.1787 2.92168 11.1787C1.28271 11.1786 -0.149264 10.5148 0.0125021 8.21582C0.0781737 7.94653 2.15713 8.01044 2.15996 8.21582C2.13456 9.16434 2.35021 9.4442 2.89629 9.44434C3.31561 9.44434 3.50664 9.21248 3.50664 8.82324C3.50588 7.43713 0.0764084 7.38812 0.0759787 4.84668C0.0759787 3.38715 1.07952 2.41323 2.8709 2.41309ZM6.72637 1.58008C6.72811 1.63655 6.68328 1.68357 6.62676 1.68555C6.60253 1.68637 6.57842 1.67907 6.55938 1.66406L6.05059 1.2627L5.44805 1.71973C5.40288 1.75399 5.33876 1.74536 5.30449 1.7002C5.29007 1.68118 5.28299 1.65764 5.28399 1.63379L5.34844 0.0830078L6.67071 0L6.72637 1.58008Z' fill='white'/></g></svg>"

/**
 * Build the `storybook-devtools` devframe: the plugin's RPC surface, shared
 * state, and the panel's client assets. Mounted into Vite DevTools by
 * `createPluginFromDevframe` in `create-component-highlighter-plugin.ts`.
 */
export function createStorybookDevframe(deps: CreateStorybookDevframeDeps) {
  const { framework, storybookUrl, writeStoryFiles, storiesDir, logDebug, state } =
    deps

  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  )
  const pkgRequire = createRequire(import.meta.url)
  const pkg = pkgRequire('../package.json') as {
    version: string
    name: string
    homepage: string
    description: string
  }

  return defineDevframe({
    id: 'storybook-devtools',
    name: 'Storybook',
    version: pkg.version,
    packageName: pkg.name,
    homepage: pkg.homepage,
    description: pkg.description,
    importMetaUrl: import.meta.url,
    icon: STORYBOOK_ICON,
    clientAssets: path.join(packageRoot, 'dist', 'panel'),
    setup(ctx) {
      // ─── Shared state initialization ─────────────────────────────────
      // `ctx.rpc.sharedState.get` constrains its value type to `T extends
      // object` in devframe 0.9. Several of these states are nullable or
      // primitive (`string | null`, `boolean`), which don't satisfy that
      // constraint — pass `<any>` explicitly to opt out of inference for
      // those, matching the loosely-typed handles this module already keeps.

      ctx.rpc.sharedState
        .get<SerializedRegistryInstance[]>('component-highlighter:registry', {
          initialValue: [],
        })
        .then((s) => {
          state.registryState = s
        })

      ctx.rpc.sharedState
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .get<any>('component-highlighter:pending-visit', {
          initialValue: null as {
            relativeFilePath: string
            preferredStoryName?: string
          } | null,
        })
        .then((s) => {
          state.pendingVisitState = s
        })

      ctx.rpc.sharedState
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .get<any>('component-highlighter:pending-tab', {
          initialValue: null as string | null,
        })
        .then((s) => {
          state.pendingTabState = s
        })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ctx.rpc.sharedState.get<any>('component-highlighter:highlight-active', {
        initialValue: false,
      })

      ctx.rpc.sharedState.get<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >('component-highlighter:selected-component', {
        initialValue: null as SerializedRegistryInstance | null,
      })

      ctx.rpc.sharedState.get<
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >('component-highlighter:highlighter-tab-active', {
        initialValue: false,
      })

      // Register RPC functions for communication with the client
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:highlight-target',
          type: 'action',
          setup: () => ({
            handler: (data: ComponentHighlightData | null) => {
              logDebug('Highlight target:', data)
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:toggle-overlay',
          type: 'action',
          setup: () => ({
            handler: (data: { enabled: boolean }) => {
              logDebug('Toggle overlay:', data.enabled)
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:create-story',
          type: 'action',
          setup: () => ({
            handler: async (data: ComponentStoryData) => {
              logDebug(
                'Create story:',
                data.meta.componentName,
                'name:',
                data.storyName,
              )

              // Generate and write the story file
              if (writeStoryFiles && data.serializedProps) {
                try {
                  // Convert component registry from object to Map
                  const registryMap = new Map<string, string>()
                  if (data.componentRegistry) {
                    for (const [name, filePath] of Object.entries(
                      data.componentRegistry,
                    )) {
                      registryMap.set(name, filePath)
                    }
                  }
                  // Augment/fallback from the server's synced registry so
                  // referenced components (e.g. <TaskCard> inside
                  // <TaskList>'s children) resolve to real imports even when
                  // the caller didn't pass a componentRegistry — e.g.
                  // coverage "Generate all" and the command palette. Without
                  // this they'd be replaced with a "not exported" div.
                  try {
                    const all = (state.registryState?.value() ??
                      []) as SerializedRegistryInstance[]
                    for (const inst of all) {
                      const n = inst?.meta?.componentName
                      const fp = inst?.meta?.filePath
                      if (n && fp && !registryMap.has(n)) {
                        registryMap.set(n, fp)
                      }
                    }
                  } catch {
                    // registry not ready — fall back to caller-provided map
                  }

                  // Determine the output path
                  const componentDir = path.dirname(data.meta.filePath)
                  const componentFileName = path.basename(
                    data.meta.filePath,
                    path.extname(data.meta.filePath),
                  )
                  const storyExtension = framework.name === 'vue' ? 'ts' : 'tsx'
                  let outputPath = path.join(
                    componentDir,
                    `${componentFileName}.stories.${storyExtension}`,
                  )
                  if (storiesDir) {
                    outputPath = path.join(
                      componentDir,
                      storiesDir,
                      `${componentFileName}.stories.${storyExtension}`,
                    )
                  }

                  // Check if file already exists
                  let existingContent: string | undefined
                  if (fs.existsSync(outputPath)) {
                    existingContent = fs.readFileSync(outputPath, 'utf-8')
                    logDebug(`Appending to existing story file: ${outputPath}`)
                  }

                  // Dynamically import the framework-specific story generator
                  let generateStory: typeof import('./frameworks/react/story-generator').generateStory

                  if (framework.name === 'react') {
                    const { generateStory: generateReactStory } =
                      await import('./frameworks/react/story-generator')
                    generateStory = generateReactStory
                  } else if (framework.name === 'vue') {
                    const { generateStory: generateVueStory } =
                      await import('./frameworks/vue/story-generator')
                    generateStory = generateVueStory
                  } else {
                    throw new Error(`Unsupported framework: ${framework.name}`)
                  }

                  const story = generateStory({
                    meta: {
                      componentName: data.meta.componentName,
                      filePath: data.meta.filePath,
                      relativeFilePath:
                        data.meta.relativeFilePath ??
                        path.relative(process.cwd(), data.meta.filePath),
                      sourceId: data.meta.sourceId,
                      isDefaultExport: data.meta.isDefaultExport ?? false,
                    },
                    props: data.serializedProps,
                    componentRegistry: registryMap,
                    ...(data.storyName ? { storyName: data.storyName } : {}),
                    ...(existingContent ? { existingContent } : {}),
                    ...(data.playFunction
                      ? { playFunction: data.playFunction }
                      : {}),
                    ...(data.playImports
                      ? { playImports: data.playImports }
                      : {}),
                  })

                  if (data.playFunction?.length) {
                    logDebug(
                      `Story includes a play function with ${data.playFunction.length} lines`,
                    )
                  }

                  // Ensure the directory exists
                  const outputDir = path.dirname(outputPath)
                  if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true })
                  }

                  // Write the story file
                  fs.writeFileSync(outputPath, story.content, 'utf-8')
                  logDebug(
                    `Story "${story.storyName}" ${existingContent ? 'added to' : 'created in'}: ${outputPath}`,
                  )

                  const verb = existingContent ? 'added to' : 'created in'
                  state.notifications.notify({
                    message: `Story "${story.storyName}" ${verb} ${path.basename(outputPath)}`,
                    level: 'success',
                    toast: true,
                    autoDismissMs: 4000,
                    filePosition: { file: outputPath, line: 1 },
                    category: 'story-creation',
                  })

                  // Notify the client about the created file
                  ctx.rpc.broadcast({
                    method: 'component-highlighter:story-created',
                    args: [
                      {
                        filePath: outputPath,
                        componentName: data.meta.componentName,
                        componentPath: data.meta.filePath,
                        relativeFilePath:
                          data.meta.relativeFilePath ??
                          path.relative(process.cwd(), data.meta.filePath),
                        storyName: story.storyName,
                        isAppend: !!existingContent,
                        skipNavigation: !!data.skipNavigation,
                      },
                    ],
                    optional: true,
                  })

                  // Coverage dashboard auto-refreshes via client-side RPC polling
                } catch (error) {
                  state.notifications.notify({
                    message: `Failed to create story for ${data.meta.componentName}`,
                    level: 'error',
                    toast: true,
                    description:
                      error instanceof Error ? error.message : String(error),
                    category: 'story-creation',
                  })

                  // Still try to notify the client so the button resets
                  ctx.rpc.broadcast({
                    method: 'component-highlighter:story-created',
                    args: [
                      {
                        filePath: '',
                        componentName: data.meta.componentName,
                        componentPath: data.meta.filePath,
                        storyName: data.storyName ?? 'Unknown',
                        isAppend: false,
                      },
                    ],
                    optional: true,
                  })
                }
              }
            },
          }),
        }),
      )

      // Coverage dashboard — RPC to fetch coverage data
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:get-coverage',
          type: 'query',
          setup: () => ({
            handler: () => {
              const coverage = computeCoverage(
                state.transformedComponents,
                ctx.cwd,
                storiesDir,
              )
              return coverage
            },
          }),
        }),
      )

      // ─── Registry sync & panel→client relay RPCs ───────────────────

      // Client pushes incremental diffs; server applies them to shared state
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:push-registry-diff',
          type: 'action',
          setup: () => ({
            handler: (diff: RegistryDiff) => {
              if (!state.registryState) return
              state.registryState.mutate(
                (draft: SerializedRegistryInstance[]) => {
                  // Full sync: replace the entire registry
                  if (diff.fullSync) {
                    draft.length = 0
                    for (const inst of diff.added) {
                      draft.push(inst)
                    }
                    return
                  }
                  // Remove
                  for (const id of diff.removed) {
                    const idx = draft.findIndex((inst) => inst.id === id)
                    if (idx !== -1) draft.splice(idx, 1)
                  }
                  // Add (deduplicate by id to prevent stale re-pushes)
                  for (const inst of diff.added) {
                    const existing = draft.findIndex((i) => i.id === inst.id)
                    if (existing !== -1) {
                      draft[existing] = inst
                    } else {
                      draft.push(inst)
                    }
                  }
                  // Update
                  for (const inst of diff.updated) {
                    const idx = draft.findIndex((i) => i.id === inst.id)
                    if (idx !== -1) draft[idx] = inst
                    else draft.push(inst)
                  }
                },
              )
            },
          }),
        }),
      )

      // Panel → server → client: scroll to a component
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:scroll-to-component',
          type: 'action',
          setup: () => ({
            handler: (data: { componentName: string }) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-scroll-to-component',
                args: [data],
              })
            },
          }),
        }),
      )

      // Panel → server → client: apply a live prop override
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:set-prop',
          type: 'action',
          setup: () => ({
            handler: (data: {
              id: string
              path: Array<string | number>
              payload: { kind: string; text: string }
            }) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-set-prop',
                args: [data],
              })
            },
          }),
        }),
      )

      // Panel → server → client: reset a prop to its original value
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:reset-prop',
          type: 'action',
          setup: () => ({
            handler: (data: { id: string; path: Array<string | number> }) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-reset-prop',
                args: [data],
              })
            },
          }),
        }),
      )

      // Panel → server → client: highlight coverage instances on the app page
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:highlight-coverage-instances',
          type: 'action',
          setup: () => ({
            handler: (
              data: { componentName: string; hasStory: boolean } | null,
            ) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-highlight-coverage',
                args: [data],
              })
            },
          }),
        }),
      )

      // Panel → server → client: batch highlight coverage instances (Preview button)
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:highlight-coverage-batch',
          type: 'action',
          setup: () => ({
            handler: (
              data: Array<{ componentName: string; hasStory: boolean }>,
            ) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-highlight-coverage-batch',
                args: [data],
              })
            },
          }),
        }),
      )

      // Panel → server → client: toggle highlight mode
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:set-highlight-mode',
          type: 'action',
          setup: () => ({
            handler: (data: { enabled: boolean }) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-set-highlight-mode',
                args: [data],
              })
            },
          }),
        }),
      )

      // Client/overlay → server → panel: navigate to a story
      // Stores as pending visit AND broadcasts so the panel can pick it up
      // either via client RPC handler or by polling the pending-visit endpoint
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:visit-story',
          type: 'action',
          setup: () => ({
            handler: (data: {
              relativeFilePath: string
              preferredStoryName?: string
            }) => {
              if (state.pendingVisitState) {
                state.pendingVisitState.mutate(() => data)
              }
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-visit-story',
                args: [data],
              })
            },
          }),
        }),
      )

      // Client/overlay → server → panel: select a component in the highlighter panel
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:select-component',
          type: 'action',
          setup: () => ({
            handler: (data: SerializedRegistryInstance | null) => {
              ctx.rpc.broadcast({
                method: 'component-highlighter:do-select-component',
                args: [data],
              })
            },
          }),
        }),
      )

      // Client → server: show a toast notification
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:notify',
          type: 'action',
          setup: () => ({
            handler: (data: { message: string; level?: string }) => {
              const level =
                (data.level as 'info' | 'warn' | 'error' | 'success') || 'info'
              state.notifications.notify({
                message: data.message,
                level,
                toast: true,
                autoDismissMs: 3000,
                category: 'component-highlighter',
              })
            },
          }),
        }),
      )

      // ─── Storybook process + panel bootstrap RPCs ──────────────────

      // Panel bootstrap: the auto-derived panel dock URL can't carry query
      // params, so the panel fetches its config here.
      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:get-config',
          type: 'query',
          setup: () => ({
            handler: () => ({ storybookUrl, cwd: ctx.cwd }),
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:storybook-status',
          type: 'query',
          setup: () => ({
            handler: async () => {
              try {
                const r = await fetch(storybookUrl, {
                  signal: AbortSignal.timeout(3000),
                })
                return { running: r.ok }
              } catch {
                return { running: false }
              }
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:storybook-index',
          type: 'query',
          setup: () => ({
            handler: async () => {
              try {
                const indexUrl = new URL('/index.json', storybookUrl).href
                const r = await fetch(indexUrl, {
                  signal: AbortSignal.timeout(5000),
                })
                return await r.json()
              } catch {
                return { v: 0, entries: {} }
              }
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:start-storybook',
          type: 'action',
          setup: () => ({
            handler: async () => {
              if (state.storybookSession) {
                return { started: true, alreadyRunning: true }
              }

              if (!state.devtoolsTerminals) {
                return { started: false, error: 'Terminals API not available' }
              }

              try {
                state.storybookSession = await state.devtoolsTerminals.startChildProcess(
                  {
                    command: 'npx',
                    args: [
                      'storybook',
                      'dev',
                      '-p',
                      new URL(storybookUrl).port || '6006',
                      '--no-open',
                    ],
                    cwd: ctx.cwd,
                  },
                  {
                    id: 'storybook-dev',
                    title: 'Storybook',
                    icon: 'ph:book-duotone',
                  },
                )

                // Capture stdout/stderr into the log buffer
                const cp = state.storybookSession.getChildProcess()
                if (cp?.stdout) {
                  cp.stdout.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n')
                    for (const line of lines) {
                      if (line) {
                        state.terminalLogs.push(line)
                        if (state.terminalLogs.length > MAX_LOG_LINES) {
                          state.terminalLogs.shift()
                        }
                      }
                    }
                  })
                }
                if (cp?.stderr) {
                  cp.stderr.on('data', (chunk: Buffer) => {
                    const lines = chunk.toString().split('\n')
                    for (const line of lines) {
                      if (line) {
                        state.terminalLogs.push(line)
                        if (state.terminalLogs.length > MAX_LOG_LINES) {
                          state.terminalLogs.shift()
                        }
                      }
                    }
                  })
                }
                if (cp) {
                  cp.on('exit', (code: number | null) => {
                    state.terminalLogs.push(`[process exited with code ${code}]`)
                    state.storybookSession = null
                  })
                }

                return { started: true }
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                state.terminalLogs.push(`[error] Failed to start Storybook: ${msg}`)
                return { started: false, error: msg }
              }
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:get-terminal-logs',
          type: 'query',
          setup: () => ({
            handler: (arg: { since: number }) => {
              const since = arg?.since ?? 0
              const lines = state.terminalLogs.slice(since)
              return { lines, total: state.terminalLogs.length }
            },
          }),
        }),
      )

      ctx.rpc.register(
        defineRpcFunction({
          name: 'component-highlighter:check-story',
          type: 'query',
          setup: () => ({
            handler: (arg: { componentPath: string }) => {
              const componentPath = arg?.componentPath
              if (!componentPath) {
                return { hasStory: false, storyPath: null }
              }

              const componentDir = path.dirname(componentPath)
              const componentFileName = path.basename(
                componentPath,
                path.extname(componentPath),
              )

              const possiblePaths = [
                path.join(componentDir, `${componentFileName}.stories.tsx`),
                path.join(componentDir, `${componentFileName}.stories.ts`),
                path.join(componentDir, `${componentFileName}.stories.jsx`),
                path.join(componentDir, `${componentFileName}.stories.js`),
              ]

              if (storiesDir) {
                possiblePaths.push(
                  path.join(
                    componentDir,
                    storiesDir,
                    `${componentFileName}.stories.tsx`,
                  ),
                  path.join(
                    componentDir,
                    storiesDir,
                    `${componentFileName}.stories.ts`,
                  ),
                  path.join(
                    componentDir,
                    storiesDir,
                    `${componentFileName}.stories.jsx`,
                  ),
                  path.join(
                    componentDir,
                    storiesDir,
                    `${componentFileName}.stories.js`,
                  ),
                )
              }

              let storyPath: string | null = null
              for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                  storyPath = p
                  break
                }
              }

              return { hasStory: !!storyPath, storyPath }
            },
          }),
        }),
      )
    },
  })
}
