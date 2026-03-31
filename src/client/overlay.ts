import type { ComponentInstance, SerializedProps } from '../frameworks/types'
import type { Emitter } from 'nanoevents'
import { createNanoEvents } from 'nanoevents'
import { debug, warn, error as logError } from './logger'
import {
  UI_MARKER,
  getPlayFunctionCode,
  isCurrentlyRecording,
  startRecording,
  stopRecording,
} from './interaction-recorder'

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
  isHighlightAllActive = false
  if (highlightContainer) {
    highlightContainer.remove()
    highlightContainer = null
  }
  highlightElements.clear()
  if (contextMenuElement) {
    contextMenuElement.remove()
    contextMenuElement = null
  }
  if (debugOverlayElement) {
    debugOverlayElement.remove()
    debugOverlayElement = null
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
let contextMenuElement: HTMLDivElement | null = null
let debugOverlayElement: HTMLDivElement | null = null
let isOverlayEnabled = false
let isHighlightAllActive = false
let currentHoveredId: string | null = null
let selectedComponentId: string | null = null
let currentCloseHandler: ((e: MouseEvent) => void) | null = null
let currentEscapeHandler: ((e: KeyboardEvent) => void) | null = null

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

// Helper to escape HTML for safe display
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Suggest a story name based on props
function suggestStoryName(props: Record<string, unknown>): string {
  // Common prop names that make good story names
  const meaningfulProps = [
    'variant',
    'type',
    'size',
    'mode',
    'status',
    'kind',
    'color',
    'intent',
    'appearance',
  ]

  for (const propName of meaningfulProps) {
    const value = props[propName]
    if (typeof value === 'string' && value.length > 0 && value.length < 30) {
      // Capitalize first letter
      return value.charAt(0).toUpperCase() + value.slice(1)
    }
  }

  // Check for boolean props that are true
  for (const [key, value] of Object.entries(props)) {
    if (value === true && !key.startsWith('_')) {
      return key.charAt(0).toUpperCase() + key.slice(1)
    }
  }

  return 'Default'
}

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
    pointer-events: ${isHighlightAllActive ? 'none' : 'auto'};
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
    } else if (isHighlightAllActive) {
      // When highlighting all with Option held
      // Components with stories: pink, components without stories: blue
      if (hasStory) {
        type = 'hovered' // Pink stroke and background
      } else {
        type = 'other' // Blue stroke and background
      }
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

  // Update pointer-events for all highlight elements based on highlight-all state
  const pointerEvents = isHighlightAllActive ? 'none' : 'auto'
  for (const el of highlightElements.values()) {
    el.style.pointerEvents = pointerEvents
  }

  // Update debug overlay if visible
  if (debugOverlayElement) {
    updateDebugOverlay()
  }
}

// Create stories for all components that don't have stories
function createStoriesForComponentsWithoutStories() {
  if (!componentRegistry) return

  // Get the component registry for import resolution
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

  // Track components that already have stories
  const componentsWithStories = new Set<string>()

  // Find components that have stories
  for (const instance of componentRegistry.values()) {
    if (
      !instance.element.isConnected ||
      instance.element.nodeType !== Node.ELEMENT_NODE
    )
      continue
    const storyInfo = storyFileCache.get(instance.meta.filePath)
    if (storyInfo?.hasStory) {
      componentsWithStories.add(instance.meta.sourceId)
    }
  }

  // Find components without stories and create stories for them
  const componentsProcessed = new Set<string>()
  const filePathsToInvalidate: string[] = []
  let storiesCreated = 0

  for (const instance of componentRegistry.values()) {
    if (
      !instance.element.isConnected ||
      instance.element.nodeType !== Node.ELEMENT_NODE
    )
      continue

    // Skip if we've already processed this component type
    if (componentsProcessed.has(instance.meta.sourceId)) continue

    // Skip if this component already has stories
    if (componentsWithStories.has(instance.meta.sourceId)) continue

    // Mark as processed
    componentsProcessed.add(instance.meta.sourceId)
    filePathsToInvalidate.push(instance.meta.filePath)

    // Get suggested story name
    const suggestedName = suggestStoryName(instance.props)

    const componentInfo = {
      meta: instance.meta,
      props: instance.props,
      serializedProps: instance.serializedProps,
      componentRegistry: componentRegistryObj,
      storyName: suggestedName,
    }

    // Emit event to create story
    debug(
      'Creating story for component:',
      instance.meta.componentName,
      componentInfo,
    )
    overlayEvents.emit(
      'log-info',
      componentInfo as Parameters<typeof overlayEvents.emit<'log-info'>>[1],
    )

    storiesCreated++
  }

  if (storiesCreated > 0) {
    debug(
      `Created stories for ${storiesCreated} components without stories`,
    )

    // After story creation, wait a bit for processing and then update the UI
    setTimeout(() => {
      // Invalidate cache for all components that had stories created
      for (const filePath of filePathsToInvalidate) {
        storyFileCache.delete(filePath)
      }

      // Re-render highlights and debug overlay to show updated story status
      drawAllHighlights()
    }, 1000) // Wait 1 second for story creation to complete
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
let wasHighlightAllActiveBeforeRecording = false

function suspendHighlightingForRecording() {
  wasOverlayEnabledBeforeRecording = isOverlayEnabled
  wasHighlightAllActiveBeforeRecording = isHighlightAllActive

  debug('Suspending highlight UI for interaction recording', {
    isOverlayEnabled,
    isHighlightAllActive,
  })

  selectedComponentId = null
  hideHoverMenu()
  hideContextMenu()
  disableOverlay()
}

function resumeHighlightingAfterRecording() {
  debug('Resuming highlight UI after interaction recording', {
    wasOverlayEnabledBeforeRecording,
    wasHighlightAllActiveBeforeRecording,
  })

  if (
    wasOverlayEnabledBeforeRecording ||
    wasHighlightAllActiveBeforeRecording
  ) {
    enableOverlay()
  }

  if (wasHighlightAllActiveBeforeRecording) {
    setHighlightAll(true)
  } else {
    drawAllHighlights()
  }

  wasOverlayEnabledBeforeRecording = false
  wasHighlightAllActiveBeforeRecording = false
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

// Context menu management
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

  contextMenuElement = document.createElement('div')
  contextMenuElement.setAttribute(UI_MARKER, 'true')
  contextMenuElement.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    z-index: ${OVERLAY_Z_INDEX.menu};
    min-width: 320px;
    max-width: 420px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    cursor: default;
  `

  // Use serialized props for display if available, otherwise fall back to raw props
  const displayProps = serializedProps || props
  const propsHtml = Object.entries(displayProps)
    .map(([key, value]) => {
      // Check if this is a serialized JSX value
      if (
        value &&
        typeof value === 'object' &&
        '__isJSX' in value &&
        (value as { __isJSX: boolean }).__isJSX
      ) {
        const jsxValue = value as unknown as { __isJSX: true; source: string }
        return `<div style="font-family: monospace; background: #1e3a5f; color: #93c5fd; padding: 2px 6px; border-radius: 3px; margin: 2px; display: inline-block; font-size: 12px;" title="${escapeHtml(jsxValue.source)}">${key}=&lt;JSX&gt;</div>`
      }
      // Check if this is a serialized Vue slot value
      if (
        value &&
        typeof value === 'object' &&
        '__isVueSlot' in value &&
        (value as { __isVueSlot: boolean }).__isVueSlot
      ) {
        const vueSlotValue = value as unknown as {
          __isVueSlot: true
          source: string
        }
        // Extract slot name from key (format is "slot:default" -> "default")
        const slotName = key.startsWith('slot:') ? key.slice(5) : key
        return `<div style="font-family: monospace; background: #064e3b; color: #6ee7b7; padding: 2px 6px; border-radius: 3px; margin: 2px; display: inline-block; font-size: 12px;" title="${escapeHtml(vueSlotValue.source)}">${slotName}=&lt;slot&gt;</div>`
      }
      // Check if this is a function placeholder
      if (value && typeof value === 'object' && '__isFunction' in value) {
        return `<div style="font-family: monospace; background: #4a3728; color: #fbbf24; padding: 2px 6px; border-radius: 3px; margin: 2px; display: inline-block; font-size: 12px;">${key}=&lt;fn&gt;</div>`
      }
      return `<div style="font-family: monospace; background: #222222; color: white; padding: 2px 6px; border-radius: 3px; margin: 2px; display: inline-block; font-size: 12px;">${key}=${JSON.stringify(
        value,
      )}</div>`
    })
    .join('')

  const suggestedName = suggestStoryName(props)
  const relativePath = meta.relativeFilePath || meta.filePath

  // Build the open buttons - both styled the same (gray)
  const openButtonsHtml = `
    <div style="display: flex; gap: 8px; margin-bottom: 12px;">
      <button id="open-component-btn" style="flex: 1; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 4px;">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
          <polyline points="13 2 13 9 20 9"></polyline>
        </svg>
        Open Component
      </button>
      <button id="open-stories-btn" style="flex: 1; background: #f3f4f6; color: ${storyInfo.hasStory ? '#374151' : '#9ca3af'}; border: 1px solid #d1d5db; padding: 6px 10px; border-radius: 4px; cursor: ${storyInfo.hasStory ? 'pointer' : 'not-allowed'}; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 4px;" ${storyInfo.hasStory ? '' : 'disabled'}>
        ${STORYBOOK_ICON_SVG.replace('width="16" height="16"', 'width="12" height="12"')}
        ${storyInfo.hasStory ? 'Open Stories' : 'No Stories'}
      </button>
    </div>
  `

  const recording = isCurrentlyRecording()
  const recordingStatusHtml = recording
    ? '<div style="color: #dc2626; font-size: 11px; margin-bottom: 8px;">Recording in progress. Stop the recording to save the story with interactions.</div>'
    : ''

  contextMenuElement.innerHTML = `
    <div style="padding: 12px;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px; min-width: 0;">
          ${storyInfo.hasStory ? STORYBOOK_ICON_SVG : ''}
          <span style="font-weight: bold; color: #2563eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${meta.componentName}</span>
        </div>
        <button id="close-context-menu-btn" aria-label="Close" style="background: transparent; border: none; color: #6b7280; cursor: pointer; font-size: 18px; line-height: 1; padding: 0 2px;">×</button>
      </div>
      <div style="color: #6b7280; font-size: 11px; margin-bottom: 10px; word-break: break-all;">${relativePath}</div>
      ${openButtonsHtml}
      ${recordingStatusHtml}
      <div style="margin-bottom: 8px;">
        <div style="font-weight: bold; margin-bottom: 4px; font-size: 12px; color: #374151;">Props:</div>
        <div style="max-height: 120px; overflow-y: auto;">${propsHtml || '<span style="color: #9ca3af;">none</span>'}</div>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 10px;">
        <div style="margin-bottom: 8px;">
          <label style="font-weight: bold; display: block; margin-bottom: 4px; font-size: 12px; color: #374151;">Story Name:</label>
          <input
            id="story-name-input"
            type="text"
            value="${suggestedName}"
            style="width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; box-sizing: border-box;"
            placeholder="Enter story name..."
          />
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="save-story-btn" style="background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%; font-weight: 500;">
            Save Story
          </button>
          <button id="save-story-with-interactions-btn" style="background: #7c3aed; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: ${recording ? 'not-allowed' : 'pointer'}; opacity: ${recording ? '0.65' : '1'}; font-size: 12px; width: 100%; font-weight: 500;" ${recording ? 'disabled' : ''}>
            Save Story with Interactions
          </button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(contextMenuElement)

  // Adjust position to stay within viewport bounds
  const rect = contextMenuElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let finalLeft = x
  let finalTop = y

  // If tooltip would go off the right edge, position it to the left of the cursor
  if (rect.right > viewportWidth) {
    finalLeft = x - rect.width - 10
  }

  // If tooltip would go off the bottom edge, position it above the cursor
  if (rect.bottom > viewportHeight) {
    finalTop = y - rect.height - 10
  }

  // Ensure tooltip doesn't go off the left edge
  if (finalLeft < 0) {
    finalLeft = 10
  }

  // Ensure tooltip doesn't go off the top edge
  if (finalTop < 0) {
    finalTop = 10
  }

  contextMenuElement.style.left = `${finalLeft}px`
  contextMenuElement.style.top = `${finalTop}px`

  // Add click handlers for the open buttons
  const openComponentBtn = contextMenuElement.querySelector(
    '#open-component-btn',
  ) as HTMLButtonElement
  const openStoriesBtn = contextMenuElement.querySelector(
    '#open-stories-btn',
  ) as HTMLButtonElement
  const closeContextMenuBtn = contextMenuElement.querySelector(
    '#close-context-menu-btn',
  ) as HTMLButtonElement

  openComponentBtn.addEventListener('click', () => {
    openInEditor(meta.filePath)
  })

  // Hide the button if the editor endpoint isn't available
  isOpenInEditorAvailable().then((available) => {
    if (!available && openComponentBtn) {
      openComponentBtn.style.display = 'none'
    }
  })

  if (storyInfo.hasStory && storyInfo.storyPath) {
    openStoriesBtn.addEventListener('click', () => {
      openInEditor(storyInfo.storyPath!)
    })
  }

  closeContextMenuBtn.addEventListener('click', () => {
    selectedComponentId = null
    hideContextMenu()
    drawAllHighlights()
  })

  // Add click handlers for save buttons
  const saveStoryBtn = contextMenuElement.querySelector(
    '#save-story-btn',
  ) as HTMLButtonElement
  const saveStoryWithInteractionsBtn = contextMenuElement.querySelector(
    '#save-story-with-interactions-btn',
  ) as HTMLButtonElement
  const storyNameInput = contextMenuElement.querySelector(
    '#story-name-input',
  ) as HTMLInputElement

  // Select input text on focus for easy editing
  storyNameInput.addEventListener('focus', () => {
    storyNameInput.select()
  })

  // Allow Enter key to submit
  storyNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveStoryBtn.click()
    }
  })

  saveStoryBtn.addEventListener('click', () => {
    debug('Save Story clicked (without interactions)', {
      component: meta.componentName,
    })

    // Stop recording if active to avoid stale recording state
    if (isCurrentlyRecording()) {
      debug('Active recording detected during Save Story, stopping recording first')
      stopRecording()
      resumeHighlightingAfterRecording()
    }

    const storyName = storyNameInput.value.trim() || suggestedName
    const createStoryPayload: Parameters<typeof emitCreateStory>[0] = {
      meta,
      props,
      storyName,
    }
    if (serializedProps) {
      createStoryPayload.serializedProps = serializedProps
    }
    emitCreateStory(createStoryPayload, false)

    saveStoryBtn.textContent = 'Saving...'
    saveStoryBtn.disabled = true
  })

  saveStoryWithInteractionsBtn.addEventListener('click', () => {
    if (isCurrentlyRecording()) {
      debug('Save Story with Interactions ignored because recording is already active')
      return
    }

    const storyName = storyNameInput.value.trim() || suggestedName

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

      const createStoryPayload2: Parameters<typeof emitCreateStory>[0] = {
        meta,
        props,
        storyName,
      }
      if (serializedProps) {
        createStoryPayload2.serializedProps = serializedProps
      }
      emitCreateStory(createStoryPayload2, true)

      resumeHighlightingAfterRecording()
    })
  })

  // Close on click outside
  currentCloseHandler = (e: MouseEvent) => {
    if (!contextMenuElement!.contains(e.target as Node)) {
      selectedComponentId = null
      hideContextMenu()
      drawAllHighlights()
    }
  }
  setTimeout(() => document.addEventListener('click', currentCloseHandler!), 10)

  // Close on Escape key
  currentEscapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      selectedComponentId = null
      hideContextMenu()
      drawAllHighlights()
    }
  }
  document.addEventListener('keydown', currentEscapeHandler)
}

function hideContextMenu() {
  if (contextMenuElement) {
    contextMenuElement.remove()
    contextMenuElement = null
  }
  if (currentCloseHandler) {
    document.removeEventListener('click', currentCloseHandler)
    currentCloseHandler = null
  }
  if (currentEscapeHandler) {
    document.removeEventListener('keydown', currentEscapeHandler)
    currentEscapeHandler = null
  }
}

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
  isHighlightAllActive = false
  // Reset cursor when overlay is disabled
  document.body.style.cursor = ''
  clearAllHighlights()
  currentHoveredId = null
  hideHoverMenu()
  removeHighlightContainer()
  hideDebugOverlay()
}

// Debug overlay functions
function createDebugOverlay(): HTMLDivElement {
  if (debugOverlayElement) return debugOverlayElement

  debugOverlayElement = document.createElement('div')
  debugOverlayElement.id = 'component-highlighter-debug'
  debugOverlayElement.setAttribute(UI_MARKER, 'true')
  debugOverlayElement.style.cssText = `
    position: fixed;
    bottom: 12px;
    right: 12px;
    opacity: 0.9;
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    z-index: 2147483647;
    pointer-events: none;
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    min-width: 180px;
  `
  document.body.appendChild(debugOverlayElement)
  return debugOverlayElement
}

function updateDebugOverlay() {
  if (!debugOverlayElement) return

  // Count unique components by sourceId (same component definition)
  const uniqueSourceIds = new Set<string>()
  const componentsWithStories = new Set<string>()
  let totalComponents = 0

  if (componentRegistry) {
    for (const instance of componentRegistry.values()) {
      if (
        !instance.element.isConnected ||
        instance.element.nodeType !== Node.ELEMENT_NODE
      )
        continue
      totalComponents++
      uniqueSourceIds.add(instance.meta.sourceId)

      // Check if this component has a story
      const storyInfo = storyFileCache.get(instance.meta.filePath)
      if (storyInfo?.hasStory) {
        componentsWithStories.add(instance.meta.sourceId)
      }
    }
  }

  const uniqueCount = uniqueSourceIds.size
  const withStoriesCount = componentsWithStories.size
  const coverage =
    uniqueCount > 0 ? Math.round((withStoriesCount / uniqueCount) * 100) : 0

  // Color coding for coverage
  let coverageColor = '#ef4444' // red
  if (coverage >= 80) {
    coverageColor = '#22c55e' // green
  } else if (coverage >= 50) {
    coverageColor = '#eab308' // yellow
  } else if (coverage >= 25) {
    coverageColor = '#f97316' // orange
  }

  debugOverlayElement.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: #ec4899; display: flex; align-items: center; gap: 6px;">
      <div id="storybook-logo" style="cursor: pointer; padding: 2px; border-radius: 3px; transition: background-color 0.2s; pointer-events: auto;" title="Improve coverage">
        ${STORYBOOK_ICON_SVG}
      </div>
      Component Stats
    </div>
    <div style="display: grid; gap: 4px;">
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #9ca3af;">Total components:</span>
        <span style="font-weight: 500; color: white;">${totalComponents}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #9ca3af;">Unique components:</span>
        <span style="font-weight: 500; color: white;">${uniqueCount}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #9ca3af;">With stories:</span>
        <span style="font-weight: 500; color: white;">${withStoriesCount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.1);">
        <span style="color: #9ca3af;">Coverage:</span>
        <span style="font-weight: 600; color: ${coverageColor};">${coverage}%</span>
      </div>
    </div>
  `

  // Add click handler for the storybook logo
  const storybookLogo = debugOverlayElement.querySelector(
    '#storybook-logo',
  ) as HTMLDivElement
  if (storybookLogo) {
    storybookLogo.addEventListener('click', () =>
      createStoriesForComponentsWithoutStories(),
    )
    storybookLogo.addEventListener('mouseenter', () => {
      storybookLogo.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
    })
    storybookLogo.addEventListener('mouseleave', () => {
      storybookLogo.style.backgroundColor = 'transparent'
    })
  }
}

function showDebugOverlay() {
  debug('showDebugOverlay called')
  createDebugOverlay()
  updateDebugOverlay()
  debug('Debug overlay created:', !!debugOverlayElement)
}

function hideDebugOverlay() {
  if (debugOverlayElement) {
    debugOverlayElement.remove()
    debugOverlayElement = null
  }
}

export function setHighlightAll(enabled: boolean) {
  isHighlightAllActive = enabled
  if (enabled) {
    createHighlightContainer()
    showDebugOverlay()
    // Set cursor to crosshair when overlay is enabled
    document.body.style.cursor = 'crosshair'
  } else {
    hideDebugOverlay()
  }
  drawAllHighlights()
}

export function toggleHighlightAll() {
  isHighlightAllActive = !isHighlightAllActive
  if (isHighlightAllActive) {
    isOverlayEnabled = true
    createHighlightContainer()
    showDebugOverlay()
    // Set cursor to crosshair when overlay is enabled
    document.body.style.cursor = 'crosshair'
  } else {
    isOverlayEnabled = false
    // Reset cursor when overlay is disabled
    document.body.style.cursor = ''
    hideDebugOverlay()
    clearAllHighlights()
    currentHoveredId = null
    hideHoverMenu()
    removeHighlightContainer()
  }
  drawAllHighlights()
  return isHighlightAllActive
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

export function isHighlightAllEnabled(): boolean {
  return isHighlightAllActive
}

// Invalidate story cache for a specific path (called after story creation)
export function invalidateStoryCache(componentPath: string) {
  storyFileCache.delete(componentPath)
}

/**
 * Update the "Open Stories" button in the context menu after story creation
 */
function updateOpenStoriesButton(storyPath: string) {
  if (!contextMenuElement) return

  const openStoriesBtn = contextMenuElement.querySelector(
    '#open-stories-btn',
  ) as HTMLButtonElement | null
  if (!openStoriesBtn) return

  // Update button state
  openStoriesBtn.textContent = '' // Clear first
  openStoriesBtn.innerHTML = `
    ${STORYBOOK_ICON_SVG.replace('width="16" height="16"', 'width="12" height="12"')}
    Open Stories
  `
  openStoriesBtn.style.color = '#374151'
  openStoriesBtn.style.cursor = 'pointer'
  openStoriesBtn.disabled = false

  // Add click handler (remove any existing first by cloning)
  const newBtn = openStoriesBtn.cloneNode(true) as HTMLButtonElement
  newBtn.innerHTML = openStoriesBtn.innerHTML
  openStoriesBtn.parentNode?.replaceChild(newBtn, openStoriesBtn)

  newBtn.addEventListener('click', () => {
    openInEditor(storyPath)
  })

  // Add Storybook icon to header if not present
  const header = contextMenuElement.querySelector('div > div:first-child')
  if (header && !header.querySelector('svg')) {
    const iconSpan = document.createElement('span')
    iconSpan.innerHTML = STORYBOOK_ICON_SVG
    iconSpan.style.display = 'flex'
    header.insertBefore(iconSpan, header.firstChild)
  }
}

/**
 * Show feedback for story creation (success or error)
 */
export function showStoryCreationFeedback(
  status: 'success' | 'error',
  filePath?: string,
  componentPath?: string,
): void {
  const saveStoryBtn = contextMenuElement?.querySelector(
    '#save-story-btn',
  ) as HTMLButtonElement | null

  if (!saveStoryBtn) {
    debug('No save-story button found for feedback (menu may be closed)')
    return
  }

  if (status === 'success') {
    saveStoryBtn.textContent = '✓ Saved!'
    saveStoryBtn.style.background = '#16a34a'
    debug('Story creation success feedback shown', filePath)

    // Invalidate cache so the icon appears
    if (componentPath) {
      invalidateStoryCache(componentPath)
      // Re-check and update cache with new story path
      checkStoryFile(componentPath).then((storyInfo) => {
        if (storyInfo.hasStory && storyInfo.storyPath) {
          updateOpenStoriesButton(storyInfo.storyPath)
        }
      })
    }

    // Also update if we have the filePath directly
    if (filePath) {
      updateOpenStoriesButton(filePath)
    }

    // Redraw highlights to show story icons
    drawAllHighlights()
  } else {
    saveStoryBtn.textContent = '✗ Failed'
    saveStoryBtn.style.background = '#dc2626'
    debug('Story creation error feedback shown')
  }

  // Reset button after a delay
  setTimeout(() => {
    if (saveStoryBtn && contextMenuElement?.contains(saveStoryBtn)) {
      saveStoryBtn.textContent = 'Save Story'
      saveStoryBtn.style.background = '#2563eb'
      saveStoryBtn.disabled = false
    }
  }, 2000)
}
