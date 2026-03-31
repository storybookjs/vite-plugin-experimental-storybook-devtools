import type { ComponentInstance } from '../frameworks/types'
import {
  enableOverlay,
  disableOverlay,
  setHighlightAll,
  updateHover,
  updateInstanceRects,
  setComponentRegistry,
  showHoverMenu,
  hideHoverMenu,
  hasSelection,
  clearSelection,
  isHighlightAllEnabled,
} from './overlay'
import { isCurrentlyRecording } from './interaction-recorder'
import { warn } from './logger'

// Type declarations for globals
declare global {
  interface Window {
    __componentHighlighterRegistry?: Map<string, ComponentInstance>
    __componentHighlighterToggle?: () => boolean
    __componentHighlighterDraw?: () => void
    __componentHighlighterInitialized?: boolean
    __componentHighlighterEnable?: () => void
  }
}

// Component registry - maintained locally and synced via events
const componentRegistry = new Map<string, ComponentInstance>()

// Track if the dock is active (highlight mode)
let isDockActive = false

// Track Option key state
let isOptionHeld = false

/**
 * Enable highlight mode (called when dock is activated)
 */
export function enableHighlightMode() {
  isDockActive = true
  enableOverlay()
}

/**
 * Disable highlight mode (called when dock is deactivated)
 */
export function disableHighlightMode() {
  isDockActive = false
  isOptionHeld = false
  clearSelection()
  disableOverlay()
  hideHoverMenu()
}

// Debounce function for performance
function debounce(func: Function, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return (...args: unknown[]) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(null, args), wait)
  }
}

// Find component at pointer position
function findComponentAtPoint(x: number, y: number): ComponentInstance | null {
  // Temporarily hide the highlight container so elementFromPoint hits the
  // actual app elements. Individual highlight children have pointer-events: auto
  // (for click handling), so they'd intercept the hit test otherwise.
  const highlightContainer = document.getElementById(
    'component-highlighter-container',
  )

  if (highlightContainer) {
    highlightContainer.style.display = 'none'
  }

  const elementAtPoint = document.elementFromPoint(x, y)

  if (highlightContainer) {
    highlightContainer.style.display = ''
  }

  if (!elementAtPoint) return null

  // Walk up the DOM tree from the deepest element to find component instances
  let currentElement: Element | null = elementAtPoint

  while (currentElement) {
    // Check if this element has a component instance
    for (const instance of componentRegistry.values()) {
      if (instance.element === currentElement && instance.element.isConnected) {
        return instance
      }
    }

    // Move up to parent
    currentElement = currentElement.parentElement
  }

  return null
}

// Mouse move handler with debouncing
const handleMouseMove = debounce((event: MouseEvent) => {
  // Only respond when dock is active (highlight mode is on)
  if (!isDockActive) return

  // Never render highlight UI while interactions are being recorded
  if (isCurrentlyRecording()) {
    updateHover(null)
    hideHoverMenu()
    return
  }

  // Update instance rects for all components (for overlay positioning)
  updateInstanceRects()

  // Find component under cursor for hover highlight
  const instance = findComponentAtPoint(event.clientX, event.clientY)
  updateHover(instance?.id || null)

  if (instance) {
    // Update rect for this instance (needed for proper highlight positioning)
    instance.rect = instance.element.getBoundingClientRect()
    showHoverMenu(instance, event.clientX, event.clientY)
  } else {
    hideHoverMenu()
  }
}, 16) // ~60fps

// Keyboard handlers
function handleKeyDown(event: KeyboardEvent) {
  if (isCurrentlyRecording()) return

  // Option/Alt key handling
  if (event.key === 'Alt' && isDockActive && !isOptionHeld) {
    isOptionHeld = true
    setHighlightAll(true)
  }

  // Shift+H to toggle sticky highlight-all mode (skip when typing in an input)
  const tag = (document.activeElement?.tagName ?? '').toLowerCase()
  const isEditable =
    tag === 'input' || tag === 'textarea' || tag === 'select' ||
    (document.activeElement as HTMLElement)?.isContentEditable === true
  if (event.key === 'H' && event.shiftKey && isDockActive && !isEditable) {
    event.preventDefault()
    const currentState = isHighlightAllEnabled()
    setHighlightAll(!currentState)
  }

  // Escape to close selection
  if (event.key === 'Escape' && isDockActive && hasSelection()) {
    clearSelection()
  }
}

function handleKeyUp(event: KeyboardEvent) {
  if (isCurrentlyRecording()) return

  // Option/Alt key release
  if (event.key === 'Alt' && isOptionHeld) {
    isOptionHeld = false
    // Only disable highlight-all if it wasn't toggled sticky with Shift+H
    setHighlightAll(false)
  }
}

/**
 * Initialize the component highlighter listeners
 * This is called once when the module is loaded
 */
function initialize() {
  // Prevent duplicate initialization if module is loaded multiple times
  if (typeof window === 'undefined') return
  if (window.__componentHighlighterInitialized) {
    warn(
      'Already initialized, skipping duplicate initialization',
    )
    return
  }

  // Mark as initialized
  window.__componentHighlighterInitialized = true

  // Set the registry reference for overlay module
  setComponentRegistry(componentRegistry)

  // Event listeners for registry synchronization
  window.addEventListener('component-highlighter:register', ((
    event: CustomEvent,
  ) => {
    const instance = event.detail
    componentRegistry.set(instance.id, instance)
  }) as EventListener)

  window.addEventListener('component-highlighter:unregister', ((
    event: CustomEvent,
  ) => {
    const id = event.detail
    componentRegistry.delete(id)
  }) as EventListener)

  window.addEventListener('component-highlighter:update-props', ((
    event: CustomEvent,
  ) => {
    const { id, props, serializedProps } = event.detail
    const instance = componentRegistry.get(id)
    if (instance) {
      instance.props = props
      if (serializedProps) {
        instance.serializedProps = serializedProps
      }
    }
  }) as EventListener)

  // Initialize DOM event listeners
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('keydown', handleKeyDown)
  document.addEventListener('keyup', handleKeyUp)

  // Update component positions on scroll
  window.addEventListener(
    'scroll',
    () => {
      if (isDockActive) {
        updateInstanceRects()
      }
    },
    { passive: true },
  )

  // Export for debugging
  window.__componentHighlighterRegistry = componentRegistry
  window.__componentHighlighterToggle = () => {
    const currentState = isHighlightAllEnabled()
    setHighlightAll(!currentState)
    return !currentState
  }
  window.__componentHighlighterDraw = () => {
    enableOverlay()
    updateInstanceRects()
  }

  // Test/automation hook: bypass DevTools dock activation when needed.
  ;(window as unknown as { __componentHighlighterEnable?: () => void }).__componentHighlighterEnable =
    () => {
      enableHighlightMode()
    }
}

// Run initialization
initialize()
