/// <reference types="@vitejs/devtools-kit" />
import type { Plugin, ViteDevServer } from 'vite'
import { createFilter } from 'vite'
import type { FrameworkConfig, SerializedProps } from './frameworks'
import { defineRpcFunction } from '@vitejs/devtools-kit'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { NotificationService } from './notifications'
import { ConsoleNotificationService, DevToolsNotificationService } from './notifications'
import { computeCoverage, buildCoverageSpec } from './coverage-dashboard'

// RPC function type declarations
declare module '@vitejs/devtools-kit' {
  interface DevToolsRpcFunctions {
    'component-highlighter:highlight-target': (
      data: ComponentHighlightData | null,
    ) => void
    'component-highlighter:toggle-overlay': (data: { enabled: boolean }) => void
    'component-highlighter:create-story': (data: ComponentStoryData) => void
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
  // JsonRenderer handle for updating the coverage dashboard after transforms
  let coverageRenderer: { updateSpec: (spec: any) => void } | null = null
  let coverageCwd = ''

  return {
    name: 'vite-plugin-experimental-storybook-devtools',
    enforce: 'pre',
    configResolved(config) {
      isServe = config.command === 'serve'
    },
    config: (viteConfig) => {
      if (framework.name === 'react') {
        viteConfig.optimizeDeps ??= {}
        viteConfig.optimizeDeps.include ??= []
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

      // Add middleware to check if story files exist
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

        if (ctx.mode === 'dev') {
          ctx.docks.register({
            id: 'storybook-panel',
            title: 'Storybook',
            icon: 'https://avatars.githubusercontent.com/u/22632046',
            type: 'iframe',
            url: storybookUrl,
          })
        }

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
                      logDebug(`Story includes a play function with ${data.playFunction.length} lines`)
                    }

                    // Ensure the directory exists
                    const outputDir = path.dirname(outputPath)
                    if (!fs.existsSync(outputDir)) {
                      fs.mkdirSync(outputDir, { recursive: true })
                    }

                    // Write the story file
                    fs.writeFileSync(outputPath, story.content, 'utf-8')
                    logDebug(`Story "${story.storyName}" ${existingContent ? 'added to' : 'created in'}: ${outputPath}`)

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
                          storyName: story.storyName,
                          isAppend: !!existingContent,
                        },
                      })
                    }

                    // Refresh coverage dashboard to reflect new story
                    if (coverageRenderer) {
                      coverageRenderer.updateSpec(
                        buildCoverageSpec(
                          computeCoverage(transformedComponents, coverageCwd, storiesDir),
                        ),
                      )
                    }
                  } catch (error) {
                    notifications.notify({
                      message: `Failed to create story for ${data.meta.componentName}`,
                      level: 'error',
                      toast: true,
                      description: error instanceof Error ? error.message : String(error),
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

        // Register coverage dashboard dock (json-render, zero client code).
        // The spec starts empty and is refreshed after transforms populate the map.
        coverageCwd = ctx.cwd
        if (ctx.createJsonRenderer) {
          const renderer = ctx.createJsonRenderer(
            buildCoverageSpec(
              computeCoverage(transformedComponents, ctx.cwd, storiesDir),
            ),
          )
          coverageRenderer = renderer

          ctx.docks.register({
            id: 'component-highlighter-coverage',
            title: 'Story Coverage',
            icon: 'ph:chart-bar-duotone',
            type: 'json-render',
            ui: renderer,
          })
        }
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
        const isNew = !transformedComponents.has(componentName)
        transformedComponents.set(componentName, id)

        // Refresh the coverage dashboard when new components are discovered
        if (isNew && coverageRenderer) {
          coverageRenderer.updateSpec(
            buildCoverageSpec(
              computeCoverage(transformedComponents, coverageCwd, storiesDir),
            ),
          )
        }
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
