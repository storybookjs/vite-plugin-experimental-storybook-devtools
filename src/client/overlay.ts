import type { ComponentInstance, SerializedProps } from '../frameworks/types'
import type { Emitter } from 'nanoevents'
import { createNanoEvents } from 'nanoevents'
import { getDevToolsClientContext } from '@vitejs/devtools-kit/client'
import { debug, warn, error as logError } from './logger'
import {
  UI_MARKER,
  getPlayFunctionCode,
  isCurrentlyRecording,
  startRecording,
  stopRecording,
} from './interaction-recorder'
import { createContextMenu, type ContextMenuHandle } from './context-menu'

/**
 * Wraps an overlay operation in a try-catch so that errors in the
 * highlight/menu rendering never bubble up and break the host app.
 * If something fails, the overlay is disabled and a warning is logged.
 */
function safeOverlayCall<T>(fn: () => T, fallback?: T): T | undefined {
  try {
    return fn()
  } catch (err) {
    logError('Overlay error — disabling to avoid breaking the host app:', err)
    try { disableOverlaySafe() } catch { /* best effort cleanup */ }
    return fallback
  }
}

function disableOverlaySafe() {
  isOverlayEnabled = false
  isClickThroughActive = false
  if (highlightContainer) {
    highlightContainer.remove()
    highlightContainer = null
  }
  highlightElements.clear()
  if (contextMenuHandle) {
    contextMenuHandle.destroy()
    contextMenuHandle = null
  }
  document.body.style.cursor = ''
}

// Event emitter for overlay actions
export interface OverlayEvents {
  'log-info': (data: {
    meta: ComponentInstance['meta']
    props: Record<string, unknown>
    serializedProps?: SerializedProps
    componentRegistry?: Record<string, string>
    storyName?: string
    /** Generated play function code lines (e.g. ['play: async ({ canvasElement }) => {', ...]) */
    playFunction?: string[]
    /** Import statements required by the play function */
    playImports?: string[]
  }) => void
}

export const overlayEvents: Emitter<OverlayEvents> =
  createNanoEvents<OverlayEvents>()

// Storybook logo SVG
const STORYBOOK_ICON_SVG = `<svg width="16" height="16" viewBox="-31.5 0 319 319" xmlns="http://www.w3.org/2000/svg">
  <path fill="#FF4785" d="M9.87,293.32L0.01,30.57C-0.31,21.9,6.34,14.54,15.01,14L238.49,0.03C247.32,-0.52,254.91,6.18,255.47,15.01C255.49,15.34,255.5,15.67,255.5,16V302.32C255.5,311.16,248.33,318.32,239.49,318.32C239.25,318.32,239.01,318.32,238.77,318.31L25.15,308.71C16.83,308.34,10.18,301.65,9.87,293.32Z"/>
  <path fill="#FFF" d="M188.67,39.13L190.19,2.41L220.88,0L222.21,37.86C222.25,39.18,221.22,40.29,219.9,40.33C219.34,40.35,218.79,40.17,218.34,39.82L206.51,30.5L192.49,41.13C191.44,41.93,189.95,41.72,189.15,40.67C188.81,40.23,188.64,39.68,188.67,39.13ZM149.41,119.98C149.41,126.21,191.36,123.22,196.99,118.85C196.99,76.45,174.23,54.17,132.57,54.17C90.91,54.17,67.57,76.79,67.57,110.74C67.57,169.85,147.35,170.98,147.35,203.23C147.35,212.28,142.91,217.65,133.16,217.65C120.46,217.65,115.43,211.17,116.02,189.1C116.02,184.32,67.57,182.82,66.09,189.1C62.33,242.57,95.64,257.99,133.75,257.99C170.69,257.99,199.65,238.3,199.65,202.66C199.65,139.3,118.68,141,118.68,109.6C118.68,96.88,128.14,95.18,133.75,95.18C139.66,95.18,150.3,96.22,149.41,119.98Z"/>
</svg>`

const OVERLAY_Z_INDEX = {
  container: 2147483000,
  menu: 2147483647,
} as const

// Colors for highlights - simplified color scheme
const COLORS = {
  // Blue for non-hovered elements when Option is held
  other: { stroke: '#006DEB', bg: 'rgba(0, 109, 235, 0.05)' },
  // Pink for hovered element (solid stroke)
  hovered: { stroke: '#FF4785', bg: 'rgba(255, 71, 133, 0.05)' },
  // Same type means same component instance as the one you're hovering
  sameType: { stroke: '#FF4785', bg: 'rgba(255, 71, 133, 0.05)', dashed: true },
  // Pink for selected element (higher opacity)
  selected: { stroke: '#FF4785', bg: 'rgba(255, 71, 133, 0.2)' },
}

// Global state for overlay management
let highlightContainer: HTMLDivElement | null = null
let highlightElements: Map<string, HTMLDivElement> = new Map()
let contextMenuHandle: ContextMenuHandle | null = null
let isOverlayEnabled = false
let isClickThroughActive = false
let currentHoveredId: string | null = null
let selectedComponentId: string | null = null
// (click-outside and escape handlers are now managed by the context-menu module)

// Cache for story file existence checks
const storyFileCache: Map<
  string,
  { hasStory: boolean; storyPath: string | null }
> = new Map()

// Import component registry from listeners
let componentRegistry: Map<string, ComponentInstance>

// Function to set component registry reference
export function setComponentRegistry(registry: Map<string, ComponentInstance>) {
  componentRegistry = registry
}

// escapeHtml moved into context-menu module (Shadow DOM)

// Check if a component has a story file
async function checkStoryFile(
  componentPath: string,
): Promise<{ hasStory: boolean; storyPath: string | null }> {
  // Check cache first
  if (storyFileCache.has(componentPath)) {
    return storyFileCache.get(componentPath)!
  }

  try {
    const response = await fetch(
      `/__component-highlighter/check-story?componentPath=${encodeURIComponent(componentPath)}`,
    )
    if (response.ok) {
      const result = await response.json()
      storyFileCache.set(componentPath, result)
      return result
    }
  } catch (e) {
    warn('Failed to check story file:', e)
  }

  const defaultResult = { hasStory: false, storyPath: null }
  storyFileCache.set(componentPath, defaultResult)
  return defaultResult
}

// Open-in-editor availability: undefined = unchecked, true/false = result
let openInEditorAvailable: boolean | undefined

async function isOpenInEditorAvailable(): Promise<boolean> {
  if (openInEditorAvailable !== undefined) return openInEditorAvailable

  try {
    // A HEAD request to the endpoint is enough to check availability
    const res = await fetch('/__open-in-editor?file=__probe__', { method: 'HEAD' })
    // The endpoint exists if the server doesn't return 404
    openInEditorAvailable = res.status !== 404
  } catch {
    openInEditorAvailable = false
  }
  return openInEditorAvailable
}

// Open a file in the editor
async function openInEditor(filePath: string) {
  if (!(await isOpenInEditorAvailable())) {
    warn(
      'Cannot open file in editor — the /__open-in-editor endpoint is not available.',
      'Ensure your Vite config includes a plugin that supports it (e.g. vite-plugin-open-in-editor).',
    )
    return
  }

  try {
    await fetch(`/__open-in-editor?file=${encodeURIComponent(filePath)}`)
    debug('Opened file:', filePath)
  } catch (e) {
    logError('Failed to open file:', e)
  }
}

// DOM-based highlight overlay management
function createHighlightContainer() {
  if (highlightContainer) return

  highlightContainer = document.createElement('div')
  highlightContainer.id = 'component-highlighter-container'
  highlightContainer.setAttribute(UI_MARKER, 'true')
  highlightContainer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: ${OVERLAY_Z_INDEX.container};
  `
  document.body.appendChild(highlightContainer)
}

function removeHighlightContainer() {
  if (highlightContainer) {
    highlightContainer.remove()
    highlightContainer = null
  }
  highlightElements.clear()
}

/**
 * Calculate DOM depth of an element (for z-index ordering)
 * Deeper elements should have higher z-index so child highlights appear on top
 */
function getDOMDepth(element: HTMLElement): number {
  let depth = 0
  let current: HTMLElement | null = element
  while (current && current !== document.body) {
    depth++
    current = current.parentElement
  }
  return depth
}

/**
 * Estimate effective stacking order for an element.
 *
 * DOM depth alone fails for portals/modals because they can be shallow in the DOM
 * but visually above everything else due to a high z-index on an ancestor.
 *
 * We use the highest numeric z-index found on the element/ancestor chain as the
 * primary sort key, and DOM depth as a tiebreaker.
 */
function getEffectiveStackOrder(element: HTMLElement): number {
  let highestAncestorZIndex = 0
  let current: HTMLElement | null = element

  while (current && current !== document.body) {
    const computed = window.getComputedStyle(current)
    const parsed = Number.parseInt(computed.zIndex, 10)
    if (!Number.isNaN(parsed)) {
      highestAncestorZIndex = Math.max(highestAncestorZIndex, parsed)
    }
    current = current.parentElement
  }

  const depth = getDOMDepth(element)
  return highestAncestorZIndex * 10000 + depth
}

function createHighlightElement(instance: ComponentInstance): HTMLDivElement {
  const el = document.createElement('div')
  el.dataset['highlightId'] = instance.id
  el.style.cssText = `
    position: fixed;
    box-sizing: border-box;
    pointer-events: ${isClickThroughActive ? 'none' : 'auto'};
    cursor: pointer;
  `
  return el
}

function updateHighlightElement(
  el: HTMLDivElement,
  instance: ComponentInstance,
  type: 'hovered' | 'sameType' | 'other' | 'selected',
  hasStory: boolean,
) {
  if (!instance.rect) return

  const rect = instance.rect
  const colorConfig = COLORS[type]

  // Set z-index based on effective stacking order.
  // High z-index elements (e.g. modals/portals) must stay above regular content,
  // while depth still makes children win over parents within the same stack level.
  const stackOrder =
    instance.element?.isConnected &&
    instance.element?.nodeType === Node.ELEMENT_NODE
      ? getEffectiveStackOrder(instance.element as HTMLElement)
      : 0
  el.style.zIndex = String(stackOrder)

  el.style.left = `${rect.left}px`
  el.style.top = `${rect.top}px`
  el.style.width = `${rect.width}px`
  el.style.height = `${rect.height}px`
  el.style.backgroundColor = colorConfig.bg

  // Use outline for all strokes to ensure consistent icon positioning
  // Dashed for same type instances, solid for others
  el.style.border = 'none'
  if ('dashed' in colorConfig && colorConfig.dashed) {
    el.style.outline = `1px dashed ${colorConfig.stroke}`
  } else {
    el.style.outline = `1px solid ${colorConfig.stroke}`
  }
  el.style.outlineOffset = '-1px'

  // Add or remove Storybook icon
  let iconEl = el.querySelector('.storybook-icon') as HTMLDivElement | null

  if (hasStory) {
    if (!iconEl) {
      iconEl = document.createElement('div')
      iconEl.className = 'storybook-icon'
      iconEl.style.cssText = `
        position: absolute;
        top: -8px;
        right: -8px;
        width: 16px;
        height: 16px;
        pointer-events: none;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
      `
      iconEl.innerHTML = STORYBOOK_ICON_SVG
      el.appendChild(iconEl)
    }
  } else if (iconEl) {
    iconEl.remove()
  }
}

// Track pending story file fetches to avoid duplicate requests
const pendingStoryChecks = new Set<string>()

function drawAllHighlights() {
  safeOverlayCall(() => drawAllHighlightsImpl())
}

function drawAllHighlightsImpl() {
  if (!highlightContainer) return

  const instances = Array.from(componentRegistry.values())

  // Find the component name to highlight (either hovered or selected)
  let highlightComponentName: string | null = null
  if (selectedComponentId) {
    const selectedInstance = instances.find(
      (inst) => inst.id === selectedComponentId,
    )
    if (selectedInstance) {
      highlightComponentName = selectedInstance.meta.componentName
    }
  } else if (currentHoveredId && isOverlayEnabled) {
    const hoveredInstance = instances.find(
      (inst) => inst.id === currentHoveredId,
    )
    if (hoveredInstance) {
      highlightComponentName = hoveredInstance.meta.componentName
    }
  }

  // Track which elements we've used
  const usedIds = new Set<string>()

  // Prefetch story info for components not yet cached (async, non-blocking)
  for (const instance of instances) {
    const filePath = instance.meta.filePath
    if (!storyFileCache.has(filePath) && !pendingStoryChecks.has(filePath)) {
      pendingStoryChecks.add(filePath)
      // Fire off the check but don't wait - it will update the cache
      checkStoryFile(filePath).then(() => {
        pendingStoryChecks.delete(filePath)
        // Trigger a re-render once we have the info (only if still showing highlights)
        if (highlightContainer) {
          drawAllHighlights()
        }
      })
    }
  }

  for (const instance of instances) {
    if (!instance.rect) continue

    // Use cached story info (synchronous) - defaults to false if not cached yet
    const storyInfo = storyFileCache.get(instance.meta.filePath)
    const hasStory = storyInfo?.hasStory ?? false

    let shouldShow = false
    let type: 'hovered' | 'sameType' | 'other' | 'selected' = 'other'

    if (selectedComponentId === instance.id) {
      type = 'selected'
      shouldShow = true
    } else if (currentHoveredId === instance.id && isOverlayEnabled) {
      type = 'hovered'
      shouldShow = true
    } else if (
      highlightComponentName &&
      instance.meta.componentName === highlightComponentName &&
      instance.id !== selectedComponentId &&
      instance.id !== currentHoveredId
    ) {
      // Same type instances when hovering (without Option held)
      type = 'sameType'
      shouldShow = true
    }

    if (shouldShow) {
      usedIds.add(instance.id)

      let el = highlightElements.get(instance.id)
      if (!el) {
        el = createHighlightElement(instance)
        el.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          handleHighlightClick(instance, e)
        })
        highlightElements.set(instance.id, el)
        highlightContainer!.appendChild(el)
      }

      updateHighlightElement(el, instance, type, hasStory)
    }
  }

  // Remove unused highlight elements
  for (const [id, el] of highlightElements.entries()) {
    if (!usedIds.has(id)) {
      el.remove()
      highlightElements.delete(id)
    }
  }

  // Update pointer-events based on click-through state
  const pointerEvents = isClickThroughActive ? 'none' : 'auto'
  for (const el of highlightElements.values()) {
    el.style.pointerEvents = pointerEvents
  }

}

function handleHighlightClick(instance: ComponentInstance, e: MouseEvent) {
  debug('highlight clicked:', instance.meta.componentName)
  selectComponent(instance, e.clientX, e.clientY)
}

function clearAllHighlights() {
  for (const el of highlightElements.values()) {
    el.remove()
  }
  highlightElements.clear()
}

let wasOverlayEnabledBeforeRecording = false

function suspendHighlightingForRecording() {
  wasOverlayEnabledBeforeRecording = isOverlayEnabled

  debug('Suspending highlight UI for interaction recording', {
    isOverlayEnabled,
  })

  selectedComponentId = null
  hideHoverMenu()
  hideContextMenu()
  disableOverlay()
}

function resumeHighlightingAfterRecording() {
  debug('Resuming highlight UI after interaction recording', {
    wasOverlayEnabledBeforeRecording,
  })

  if (wasOverlayEnabledBeforeRecording) {
    enableOverlay()
  }

  drawAllHighlights()

  wasOverlayEnabledBeforeRecording = false
}

function emitCreateStory(
  data: {
    meta: ComponentInstance['meta']
    props: Record<string, unknown>
    serializedProps?: SerializedProps
    storyName: string
  },
  includePlayFunction: boolean,
) {
  const getRegistry = (
    window as unknown as {
      __componentHighlighterGetRegistry?: () => Map<string, string>
    }
  ).__componentHighlighterGetRegistry

  let componentRegistryObj: Record<string, string> = {}
  if (getRegistry) {
    const registry = getRegistry()
    componentRegistryObj = Object.fromEntries(registry)
  }

  const playCode = includePlayFunction ? getPlayFunctionCode() : null

  const componentInfoBase = {
    meta: data.meta,
    props: data.props,
    componentRegistry: componentRegistryObj,
    storyName: data.storyName,
    ...(playCode
      ? { playFunction: playCode.playLines, playImports: playCode.imports }
      : {}),
  }

  const componentInfo: Parameters<typeof overlayEvents.emit<'log-info'>>[1] = {
    ...componentInfoBase,
    ...(data.serializedProps ? { serializedProps: data.serializedProps } : {}),
  }

  debug('Emitting story creation payload', {
    component: data.meta.componentName,
    storyName: data.storyName,
    includePlayFunction,
    interactionCount: playCode?.playLines.length ?? 0,
  })

  overlayEvents.emit('log-info', componentInfo)

  // Test/integration hook: mirror create-story requests on window events
  // so E2E can assert payloads without relying on external DevTools RPC.
  const createStoryEvent = new CustomEvent(
    'component-highlighter:create-story-request',
    {
      detail: {
        ...componentInfo,
        includePlayFunction,
      },
    },
  )
  window.dispatchEvent(createStoryEvent)
}

// Context menu management — delegates to the Shadow DOM context-menu module
async function showContextMenu(
  instance: ComponentInstance,
  x: number,
  y: number,
) {
  hideContextMenu()

  const meta = instance.meta
  const props = instance.props
  const serializedProps = instance.serializedProps

  // Check if story file exists
  const storyInfo = await checkStoryFile(meta.filePath)

  contextMenuHandle = createContextMenu(instance, x, y, storyInfo, {
    openInEditor,
    isOpenInEditorAvailable,
    onSaveStory(storyName: string) {
      debug('Save Story clicked (without interactions)', {
        component: meta.componentName,
      })

      // Stop recording if active to avoid stale recording state
      if (isCurrentlyRecording()) {
        debug('Active recording detected during Save Story, stopping recording first')
        stopRecording()
        resumeHighlightingAfterRecording()
      }

      const payload: Parameters<typeof emitCreateStory>[0] = {
        meta,
        props,
        storyName,
      }
      if (serializedProps) {
        payload.serializedProps = serializedProps
      }
      emitCreateStory(payload, false)
    },
    onSaveStoryWithInteractions(storyName: string) {
      if (isCurrentlyRecording()) {
        debug('Save Story with Interactions ignored because recording is already active')
        return
      }

      debug('Save Story with Interactions clicked, starting recording session', {
        component: meta.componentName,
        storyName,
      })

      suspendHighlightingForRecording()

      startRecording((interactions) => {
        debug('Recording callback received, creating story with recorded interactions', {
          component: meta.componentName,
          storyName,
          interactions: interactions.length,
        })

        const payload: Parameters<typeof emitCreateStory>[0] = {
          meta,
          props,
          storyName,
        }
        if (serializedProps) {
          payload.serializedProps = serializedProps
        }

        emitCreateStory(payload, true)

        resumeHighlightingAfterRecording()
      })
    },
    onClose() {
      // Capture and null the handle BEFORE calling destroy so that if destroy
      // somehow re-enters onClose the guard below is already set.
      const h = contextMenuHandle
      contextMenuHandle = null
      selectedComponentId = null
      // Always destroy the DOM element and remove document-level listeners.
      // destroy() is idempotent so calling it even when click-outside/Escape
      // already called it is safe.  Without this, a menu closed via
      // callbacks.onClose() (e.g. the View Story button) would leave a zombie
      // element in the DOM whose onClickOutside handler could later fire and
      // null contextMenuHandle at the wrong time.
      h?.destroy()
      drawAllHighlights()
    },
    async visitStory(relativeFilePath: string) {
      // Switch to the panel dock and tell it to visit the story via RPC
      // (works whether panel is inline or popped out into a separate window)
      const ctx = getDevToolsClientContext() as any
      if (ctx?.docks?.switchEntry) {
        await ctx.docks.switchEntry('storybook-devtools-panel')
      }

      try {
        const rpcCtx = getDevToolsClientContext()
        if (rpcCtx?.rpc?.call) {
          await (rpcCtx.rpc.call as any)('component-highlighter:visit-story', {
            relativeFilePath,
          })
          return
        }
      } catch {
        // RPC not available
      }

      // Last resort: fetch the index ourselves and open in new tab
      try {
        const res = await fetch('/__component-highlighter/storybook-index')
        const data = await res.json()
        const entries = data.entries || {}
        const stripExt = (p: string) =>
          p.replace(/^\.\//, '').replace(/\.(stories\.)?(tsx?|jsx?|mts|mjs)$/, '')
        const componentBase = stripExt(relativeFilePath)
        const componentName = componentBase.split('/').pop() || componentBase
        for (const entry of Object.values(entries) as any[]) {
          if (entry.type !== 'story') continue
          const entryBase = stripExt(entry.importPath)
          if (entryBase === componentBase || entryBase.endsWith(componentName)) {
            window.open(`http://localhost:6006/?path=/story/${encodeURIComponent(entry.id)}&nav=0`, '_blank')
            return
          }
        }
      } catch {
        // Storybook not available
      }
    },
  })
}

function hideContextMenu() {
  if (contextMenuHandle) {
    contextMenuHandle.destroy()
    contextMenuHandle = null
  }
}

export { hideContextMenu }

// Hover menu management
let hoverMenuElement: HTMLDivElement | null = null

export function showHoverMenu(
  instance: ComponentInstance,
  x: number,
  y: number,
) {
  hideHoverMenu()

  const meta = instance.meta

  // Check story status from cache (don't await, use cached value)
  const storyInfo = storyFileCache.get(meta.filePath)
  const hasStory = storyInfo?.hasStory ?? false

  hoverMenuElement = document.createElement('div')
  hoverMenuElement.setAttribute(UI_MARKER, 'true')
  hoverMenuElement.style.cssText = `
    position: fixed;
    left: ${x + 10}px;
    top: ${y + 10}px;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: monospace;
    pointer-events: none;
    z-index: ${OVERLAY_Z_INDEX.menu};
    max-width: 300px;
    word-break: break-all;
    display: flex;
    align-items: center;
    gap: 6px;
  `

  const iconHtml = hasStory
    ? `<span style="display: flex; align-items: center;">${STORYBOOK_ICON_SVG.replace('width="16" height="16"', 'width="14" height="14"')}</span>`
    : ''

  hoverMenuElement.innerHTML = `${iconHtml}<span style="color: white">&lt;${meta.componentName}&gt;</span>`
  document.body.appendChild(hoverMenuElement)
}

export function hideHoverMenu() {
  if (hoverMenuElement) {
    hoverMenuElement.remove()
    hoverMenuElement = null
  }
}

// Public API
export function enableOverlay() {
  isOverlayEnabled = true
  createHighlightContainer()
  // Set cursor to crosshair when overlay is enabled
  document.body.style.cursor = 'crosshair'
}

export function disableOverlay() {
  isOverlayEnabled = false
  // Reset cursor when overlay is disabled
  document.body.style.cursor = ''
  clearAllHighlights()
  currentHoveredId = null
  hideHoverMenu()
  removeHighlightContainer()
}

export function isClickThroughEnabled(): boolean {
  return isClickThroughActive
}

export function setClickThrough(enabled: boolean) {
  isClickThroughActive = enabled
  const pointerEvents = enabled ? 'none' : 'auto'
  for (const el of highlightElements.values()) {
    el.style.pointerEvents = pointerEvents
  }
  // Restore default cursor so users can interact normally
  if (enabled) {
    document.body.style.cursor = ''
  } else if (isOverlayEnabled) {
    document.body.style.cursor = 'crosshair'
  }
}

export function updateHover(instanceId: string | null) {
  currentHoveredId = instanceId
  if (isOverlayEnabled) {
    drawAllHighlights()
  }
}

export function selectComponent(
  instance: ComponentInstance,
  x: number,
  y: number,
) {
  safeOverlayCall(() => {
    selectedComponentId = instance.id
    drawAllHighlights()
    showContextMenu(instance, x, y)
  })
}

export function clearSelection() {
  selectedComponentId = null
  hideContextMenu()
  drawAllHighlights()

  // Don't disable overlay - keep it enabled while dock is active
}

export function updateInstanceRects() {
  // Update rects for all instances and redraw
  for (const instance of componentRegistry.values()) {
    if (
      instance.element &&
      instance.element.isConnected &&
      instance.element.nodeType === Node.ELEMENT_NODE
    ) {
      instance.rect = instance.element.getBoundingClientRect()
    }
  }
  drawAllHighlights()
}

export function hasSelection(): boolean {
  return selectedComponentId !== null
}

/**
 * Test/automation hook: select a component by its registry ID.
 * Opens the context menu as if the user clicked the component's highlight.
 */
export function selectComponentById(id: string) {
  if (!componentRegistry) return false
  const instance = componentRegistry.get(id)
  if (!instance) return false
  if (instance.element?.isConnected) {
    instance.rect = instance.element.getBoundingClientRect()
  }
  const rect = instance.rect
  if (!rect) return false
  selectComponent(instance, rect.left + rect.width / 2, rect.top + rect.height / 2)
  return true
}

// Invalidate story cache for a specific path (called after story creation)
export function invalidateStoryCache(componentPath: string) {
  storyFileCache.delete(componentPath)
}

/**
 * Update the "Go to Story" button in the context menu after story creation
 */
function updateOpenStoriesButton(storyPath: string) {
  if (!contextMenuHandle) return
  contextMenuHandle.enableGoToStory(storyPath)
  contextMenuHandle.enableViewStory()
}

/**
 * Show feedback for story creation (success or error).
 * Always performs cache invalidation and highlight refresh so that the
 * Storybook icon appears even when the context menu was closed (e.g.
 * during the "Create with Interactions" recording flow).
 */
export function showStoryCreationFeedback(
  status: 'success' | 'error',
  filePath?: string,
  componentPath?: string,
): void {
  if (contextMenuHandle) {
    // Menu is still open (normal "Create" flow) — show inline feedback
    contextMenuHandle.showSaveFeedback(status)
  } else {
    debug('No context menu open for feedback (menu closed during recording)')
  }

  if (status === 'success') {
    debug('Story creation success feedback', filePath)

    // Always invalidate cache so the Storybook icon appears on the highlight
    if (componentPath) {
      invalidateStoryCache(componentPath)
      checkStoryFile(componentPath).then((storyInfo) => {
        if (storyInfo.hasStory && storyInfo.storyPath) {
          updateOpenStoriesButton(storyInfo.storyPath)
        }
      })
    }

    if (filePath) {
      updateOpenStoriesButton(filePath)
    }

    drawAllHighlights()
  } else {
    debug('Story creation error feedback')
  }
}
