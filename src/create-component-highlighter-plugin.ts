/// <reference types="@vitejs/devtools-kit" />
import type { Plugin, ViteDevServer } from 'vite'
import { createFilter } from 'vite'
import type { FrameworkConfig, SerializedProps } from './frameworks'
import { defineRpcFunction, defineCommand } from '@vitejs/devtools-kit'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { NotificationService } from './notifications'
import {
  ConsoleNotificationService,
  DevToolsNotificationService,
} from './notifications'
import { computeCoverage } from './coverage-dashboard'

import type { SerializedRegistryInstance, RegistryDiff } from './shared-types'
export type { SerializedRegistryInstance, RegistryDiff }

// RPC function type declarations
declare module '@vitejs/devtools-kit' {
  interface DevToolsRpcFunctions {
    'component-highlighter:highlight-target': (
      data: ComponentHighlightData | null,
    ) => void
    'component-highlighter:toggle-overlay': (data: { enabled: boolean }) => void
    'component-highlighter:create-story': (data: ComponentStoryData) => void
    'component-highlighter:push-registry-diff': (diff: RegistryDiff) => void
    'component-highlighter:scroll-to-component': (data: { componentName: string }) => void
    'component-highlighter:highlight-coverage-instances': (data: { componentName: string; hasStory: boolean } | null) => void
    'component-highlighter:set-highlight-mode': (data: { enabled: boolean }) => void
    'component-highlighter:visit-story': (data: { relativeFilePath: string; preferredStoryName?: string }) => void
    'component-highlighter:notify': (data: { message: string; level?: string }) => void
  }

  interface DevToolsRpcClientFunctions {
    'component-highlighter:do-scroll-to-component': (data: { componentName: string }) => void
    'component-highlighter:do-highlight-coverage': (data: { componentName: string; hasStory: boolean } | null) => void
    'component-highlighter:do-set-highlight-mode': (data: { enabled: boolean; toggle?: boolean }) => void
    'component-highlighter:do-visit-story': (data: { relativeFilePath: string; preferredStoryName?: string }) => void
    'component-highlighter:do-open-url': (data: { url: string }) => void
    'component-highlighter:do-open-panel-tab': (data: { tab: string }) => void
    'component-highlighter:do-switch-tab': (data: { tab: string }) => void
  }

  interface DevToolsRpcSharedStates {
    'component-highlighter:registry': SerializedRegistryInstance[]
    'component-highlighter:pending-visit': { relativeFilePath: string; preferredStoryName?: string } | null
    'component-highlighter:pending-tab': string | null
    'component-highlighter:highlight-active': boolean
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
  props: Record<string, unknown>
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
}

/**
 * Create the component highlighter plugin for a specific framework
 */
export function createComponentHighlighterPlugin(
  framework: FrameworkConfig,
  options: ComponentHighlighterOptions = {},
): Plugin {
  const logDebug = (...args: unknown[]) => {
    if (options.debugMode) {
      console.log('[component-highlighter]', ...args)
    }
  }

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
    eventName: _eventName = 'component-highlighter:create-story',
    enableOverlay: _enableOverlay = true,
    devtoolsDockId = 'component-highlighter',
    storybookUrl = 'http://localhost:6006',
    force = false,
    debugMode = false,
    writeStoryFiles = true,
    storiesDir,
  } = options

  const filter = createFilter(include, exclude)
  let isServe = false
  let server: ViteDevServer | undefined
  let notifications: NotificationService = new ConsoleNotificationService()
  // Track transformed components for coverage dashboard: componentName → filePath
  const transformedComponents = new Map<string, string>()
  let coverageCwd = ''
  // Shared state handles (initialized in devtools.setup)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let registryState: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingVisitState: any = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pendingTabState: any = null


  // Terminal-based Storybook launcher state
  let devtoolsTerminals: any = null // ctx.terminals reference from devtools.setup
  let storybookSession: any = null
  const terminalLogs: string[] = []
  const MAX_LOG_LINES = 2000

  return {
    name: 'vite-plugin-experimental-storybook-devtools',
    enforce: 'pre',
    configResolved(config) {
      isServe = config.command === 'serve'
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
      // @testing-library/dom depends on aria-query (CJS) which breaks when
      // loaded as raw ESM. Pre-bundle it so Vite handles the CJS→ESM conversion.
      viteConfig.optimizeDeps.include ??= []
      viteConfig.optimizeDeps.include.push('@testing-library/dom')
      if (framework.name === 'react') {
        viteConfig.optimizeDeps.include.push(
          'react-element-to-jsx-string/dist/esm/index.js',
        )
      }
    },
    configureServer(srv) {
      server = srv

      if (fs.existsSync(runtimeHelperSourcePath)) {
        srv.watcher.add(runtimeHelperSourcePath)
      }
      if (fs.existsSync(runtimeModuleSourcePath)) {
        srv.watcher.add(runtimeModuleSourcePath)
      }

      // ── Middleware: coverage data ──────────────────────────────────
      srv.middlewares.use('/__component-highlighter/coverage', (_req, res) => {
        const coverage = computeCoverage(
          transformedComponents,
          coverageCwd || process.cwd(),
          storiesDir,
        )
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(coverage))
      })

      // ── Middleware: Storybook status check ────────────────────────
      srv.middlewares.use(
        '/__component-highlighter/storybook-status',
        async (_req, res) => {
          try {
            const r = await fetch(storybookUrl, {
              signal: AbortSignal.timeout(3000),
            })
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ running: r.ok }))
          } catch {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ running: false }))
          }
        },
      )

      // ── Middleware: proxy Storybook index.json ────────────────────
      srv.middlewares.use(
        '/__component-highlighter/storybook-index',
        async (_req, res) => {
          try {
            const indexUrl = new URL('/index.json', storybookUrl).href
            const r = await fetch(indexUrl, {
              signal: AbortSignal.timeout(5000),
            })
            const data = await r.text()
            res.setHeader('Content-Type', 'application/json')
            res.end(data)
          } catch {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ v: 0, entries: {} }))
          }
        },
      )

      // ── Middleware: start Storybook via terminals API ─────────────
      srv.middlewares.use(
        '/__component-highlighter/start-storybook',
        async (_req, res) => {
          res.setHeader('Content-Type', 'application/json')

          if (storybookSession) {
            res.end(JSON.stringify({ started: true, alreadyRunning: true }))
            return
          }

          if (!devtoolsTerminals) {
            res.end(
              JSON.stringify({
                started: false,
                error: 'Terminals API not available',
              }),
            )
            return
          }

          try {
            storybookSession = await devtoolsTerminals.startChildProcess(
              {
                command: 'npx',
                args: [
                  'storybook',
                  'dev',
                  '-p',
                  new URL(storybookUrl).port || '6006',
                  '--no-open',
                ],
                cwd: coverageCwd || process.cwd(),
              },
              {
                id: 'storybook-dev',
                title: 'Storybook',
                icon: 'ph:book-duotone',
              },
            )

            // Capture stdout/stderr into the log buffer
            const cp = storybookSession.getChildProcess()
            if (cp?.stdout) {
              cp.stdout.on('data', (chunk: Buffer) => {
                const lines = chunk.toString().split('\n')
                for (const line of lines) {
                  if (line) {
                    terminalLogs.push(line)
                    if (terminalLogs.length > MAX_LOG_LINES) {
                      terminalLogs.shift()
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
                    terminalLogs.push(line)
                    if (terminalLogs.length > MAX_LOG_LINES) {
                      terminalLogs.shift()
                    }
                  }
                }
              })
            }
            if (cp) {
              cp.on('exit', (code: number | null) => {
                terminalLogs.push(`[process exited with code ${code}]`)
                storybookSession = null
              })
            }

            res.end(JSON.stringify({ started: true }))
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            terminalLogs.push(`[error] Failed to start Storybook: ${msg}`)
            res.end(JSON.stringify({ started: false, error: msg }))
          }
        },
      )

      // ── Middleware: terminal log output ────────────────────────────
      srv.middlewares.use(
        '/__component-highlighter/terminal-logs',
        (req, res) => {
          const url = new URL(req.url || '', 'http://localhost')
          const since = parseInt(url.searchParams.get('since') || '0', 10)
          const lines = terminalLogs.slice(since)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ lines, total: terminalLogs.length }))
        },
      )

      // ── Middleware: check if story files exist ─────────────────────
      srv.middlewares.use(
        '/__component-highlighter/check-story',
        (req, res) => {
          const url = new URL(req.url || '', 'http://localhost')
          const componentPath = url.searchParams.get('componentPath')

          if (!componentPath) {
            res.statusCode = 400
            res.end(
              JSON.stringify({ error: 'Missing componentPath parameter' }),
            )
            return
          }

          // Check for story file
          const componentDir = path.dirname(componentPath)
          const componentFileName = path.basename(
            componentPath,
            path.extname(componentPath),
          )

          // Check both with and without storiesDir
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

          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              hasStory: !!storyPath,
              storyPath,
            }),
          )
        },
      )

    },
    devtools: {
      setup(ctx) {
        // Upgrade to DevTools notifications when the Logs API is available
        if (ctx.logs) {
          notifications = new DevToolsNotificationService(ctx.logs)
        }

        // Store terminals reference for use by middleware
        devtoolsTerminals = ctx.terminals

        // Register dock entry for component highlighter UI
        ctx.docks.register({
          id: devtoolsDockId,
          title: 'Component Highlighter',
          icon: 'ph:crosshair',
          type: 'action',
          action: {
            importFrom:
              'vite-plugin-experimental-storybook-devtools/client/vite-devtools',
            importName: 'default',
          },
        })

        // Merged Storybook + Coverage panel (iframe dock served via hostStatic)
        if (ctx.mode === 'dev') {
          const panelDist = path.join(packageRoot, 'dist', 'panel')
          ctx.views.hostStatic('/.storybook-devtools/', panelDist)

          ctx.docks.register({
            id: 'storybook-devtools-panel',
            title: 'Storybook',
            icon: 'https://avatars.githubusercontent.com/u/22632046',
            type: 'iframe',
            url:
              '/.storybook-devtools/?sbUrl=' + encodeURIComponent(storybookUrl),
          })
        }

        // ─── Shared state initialization ─────────────────────────────────

        ctx.rpc.sharedState.get('component-highlighter:registry', {
          initialValue: [] as SerializedRegistryInstance[],
        }).then((s) => { registryState = s })

        ctx.rpc.sharedState.get('component-highlighter:pending-visit', {
          initialValue: null as { relativeFilePath: string; preferredStoryName?: string } | null,
        }).then((s) => { pendingVisitState = s })

        ctx.rpc.sharedState.get('component-highlighter:pending-tab', {
          initialValue: null as string | null,
        }).then((s) => { pendingTabState = s })

        ctx.rpc.sharedState.get('component-highlighter:highlight-active', {
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

                    // Determine the output path
                    const componentDir = path.dirname(data.meta.filePath)
                    const componentFileName = path.basename(
                      data.meta.filePath,
                      path.extname(data.meta.filePath),
                    )
                    const storyExtension =
                      framework.name === 'vue' ? 'ts' : 'tsx'
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
                      logDebug(
                        `Appending to existing story file: ${outputPath}`,
                      )
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
                      throw new Error(
                        `Unsupported framework: ${framework.name}`,
                      )
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
                    notifications.notify({
                      message: `Story "${story.storyName}" ${verb} ${path.basename(outputPath)}`,
                      level: 'success',
                      toast: true,
                      autoDismissMs: 4000,
                      filePosition: { file: outputPath, line: 1 },
                      category: 'story-creation',
                    })

                    // Notify the client about the created file
                    if (server) {
                      server.ws.send({
                        type: 'custom',
                        event: 'component-highlighter:story-created',
                        data: {
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
                      })
                    }

                    // Coverage dashboard auto-refreshes via client-side RPC polling
                  } catch (error) {
                    notifications.notify({
                      message: `Failed to create story for ${data.meta.componentName}`,
                      level: 'error',
                      toast: true,
                      description:
                        error instanceof Error ? error.message : String(error),
                      category: 'story-creation',
                    })

                    // Still try to notify the client so the button resets
                    if (server) {
                      server.ws.send({
                        type: 'custom',
                        event: 'component-highlighter:story-created',
                        data: {
                          filePath: '',
                          componentName: data.meta.componentName,
                          componentPath: data.meta.filePath,
                          storyName: data.storyName ?? 'Unknown',
                          isAppend: false,
                        },
                      })
                    }
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
                  transformedComponents,
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
                if (!registryState) return
                registryState.mutate((draft: SerializedRegistryInstance[]) => {
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
                })
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

        // Panel → server → client: highlight coverage instances on the app page
        ctx.rpc.register(
          defineRpcFunction({
            name: 'component-highlighter:highlight-coverage-instances',
            type: 'action',
            setup: () => ({
              handler: (data: { componentName: string; hasStory: boolean } | null) => {
                ctx.rpc.broadcast({
                  method: 'component-highlighter:do-highlight-coverage',
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
              handler: (data: { relativeFilePath: string; preferredStoryName?: string }) => {
                if (pendingVisitState) {
                  pendingVisitState.mutate(() => data)
                }
                ctx.rpc.broadcast({
                  method: 'component-highlighter:do-visit-story',
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
                const level = (data.level as 'info' | 'warn' | 'error' | 'success') || 'info'
                notifications.notify({
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

        // ─── Helper: open a specific tab in the panel ──────────────────

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        function openPanelTab(devtoolsCtx: any, tab: string) {
          // Store in shared state so the panel picks it up on load or via subscription
          if (pendingTabState) {
            pendingTabState.mutate(() => tab)
          }
          // Tell the client to switch the dock to the panel (if not already open)
          devtoolsCtx.rpc.broadcast({
            method: 'component-highlighter:do-open-panel-tab',
            args: [{ tab }],
          })
          // Tell the panel directly to switch tabs (if already open)
          devtoolsCtx.rpc.broadcast({
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
            description: 'Generate story files for all visible components without stories',
            icon: 'ph:file-plus-duotone',
            category: 'Storybook',
            handler: async () => {
              // Use the registry snapshot + coverage data to find uncovered visible components
              const coverage = computeCoverage(
                transformedComponents,
                ctx.cwd,
                storiesDir,
              )
              const uncovered = coverage.entries.filter((e) => !e.hasStory)
              if (uncovered.length === 0) {
                notifications.notify({
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
                const allInstances = registryState?.value() ?? []
                const instances = (allInstances as SerializedRegistryInstance[])
                  .filter((inst) => inst.meta.filePath === entry.filePath && inst.isConnected)
                if (instances.length === 0) continue

                // Deduplicate by props fingerprint
                const seen = new Set<string>()
                for (const inst of instances) {
                  const fp = inst.serializedProps ? JSON.stringify(inst.serializedProps) : '{}'
                  if (seen.has(fp)) continue
                  seen.add(fp)

                  // Invoke the create-story handler directly
                  await (ctx.rpc.invokeLocal as any)('component-highlighter:create-story', {
                    meta: inst.meta,
                    props: inst.props,
                    serializedProps: inst.serializedProps,
                    skipNavigation: true,
                  })
                  storiesCreated++
                }
              }

              notifications.notify({
                message: storiesCreated > 0
                  ? `Created stories for ${storiesCreated} component${storiesCreated === 1 ? '' : 's'}`
                  : 'No visible uncovered components found — navigate to a page with components first',
                level: storiesCreated > 0 ? 'success' : 'info',
                toast: true,
                autoDismissMs: 4000,
                category: 'story-creation',
              })

              // Open the coverage tab so the user can see the updated results
              openPanelTab(ctx, 'coverage')
            },
          }),
        )

        ctx.commands.register(
          defineCommand({
            id: 'storybook:see-coverage',
            title: 'See Component Coverage',
            description: 'Open the coverage dashboard showing story status for all components',
            icon: 'ph:chart-bar-duotone',
            category: 'Storybook',
            handler: () => {
              openPanelTab(ctx, 'coverage')
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

        // Store cwd for coverage computation
        coverageCwd = ctx.cwd
      },
    },
    resolveId(id) {
      if (id === runtimeHelperVirtualId) {
        return resolvedRuntimeHelperVirtualId
      }
      if (id === resolvedRuntimeHelperVirtualId) {
        return resolvedRuntimeHelperVirtualId
      }
      if (id === framework.virtualModuleId) {
        return '\0' + id
      }
      return null
    },
    async load(id) {
      if (id === resolvedRuntimeHelperVirtualId) {
        const shouldUseSource =
          isServe && fs.existsSync(runtimeHelperSourcePath)

        if (shouldUseSource && server) {
          const transformed = await server.transformRequest(
            runtimeHelperSourcePath,
          )
          if (transformed?.code) {
            return transformed.code
          }
        }

        if (shouldUseSource) {
          return fs.readFileSync(runtimeHelperSourcePath, 'utf-8')
        }

        if (!fs.existsSync(runtimeHelperFilePath)) {
          throw new Error(
            '[component-highlighter] runtime helpers not built. Run `pnpm build` first.',
          )
        }
        return fs.readFileSync(runtimeHelperFilePath, 'utf-8')
      }
      if (id === '\0' + framework.virtualModuleId) {
        const shouldUseSource =
          isServe && fs.existsSync(runtimeModuleSourcePath)

        const injectDebugMode = (code: string) =>
          code.replace(
            /__COMPONENT_HIGHLIGHTER_DEBUG__/g,
            debugMode ? 'true' : 'false',
          )

        const normalizeRuntimeImports = (code: string) =>
          code.replace(
            /\/\@id\/__x00__virtual:component-highlighter\/runtime-helpers/g,
            'virtual:component-highlighter/runtime-helpers',
          )

        if (shouldUseSource && server) {
          const transformed = await server.transformRequest(
            runtimeModuleSourcePath,
          )
          if (transformed?.code) {
            return injectDebugMode(normalizeRuntimeImports(transformed.code))
          }
        }

        if (shouldUseSource) {
          return injectDebugMode(
            normalizeRuntimeImports(
              fs.readFileSync(runtimeModuleSourcePath, 'utf-8'),
            ),
          )
        }

        if (!fs.existsSync(runtimeModuleFilePath)) {
          throw new Error(
            '[component-highlighter] runtime module not built. Run `pnpm build` first.',
          )
        }

        return injectDebugMode(
          normalizeRuntimeImports(
            fs.readFileSync(runtimeModuleFilePath, 'utf-8'),
          ),
        )
      }
      return null
    },
    transform(code, id) {
      // Only transform in dev/serve mode unless force is enabled
      if (!isServe && !force) {
        return
      }

      // Skip non-matching files
      if (!filter(id)) {
        return
      }

      // Check if this framework handles this file
      if (!framework.detect(code, id)) {
        return
      }

      logDebug(`Transforming ${id}`)

      const result = framework.transform(code, id)

      // Track transformed components for coverage
      if (result) {
        const componentName = path.basename(id, path.extname(id))
        transformedComponents.set(componentName, id)

        // Coverage dashboard auto-refreshes via client-side RPC polling
      }

      return result
    },
    handleHotUpdate(ctx) {
      if (ctx.file === runtimeHelperSourcePath) {
        const mod = ctx.server.moduleGraph.getModuleById(
          resolvedRuntimeHelperVirtualId,
        )
        return mod ? [mod] : []
      }
      if (ctx.file === runtimeModuleSourcePath) {
        const mod = ctx.server.moduleGraph.getModuleById(
          '\0' + framework.virtualModuleId,
        )
        return mod ? [mod] : []
      }
      return
    },
  }
}
