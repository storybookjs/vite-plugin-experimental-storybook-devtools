/// <reference path="../../runtime-module-shims.d.ts" />
import {
  provide,
  onMounted,
  onUpdated,
  onUnmounted,
  getCurrentInstance,
} from 'vue'
import {
  cleanupInstanceTracking,
  findFirstTrackableElement,
  syncInstanceTracking,
} from 'virtual:component-highlighter/runtime-helpers'

// Injected by the virtual module loader.
declare const __COMPONENT_HIGHLIGHTER_DEBUG__: boolean

const DEBUG_MODE = __COMPONENT_HIGHLIGHTER_DEBUG__

const logDebug = (...args: unknown[]) => {
  if (DEBUG_MODE) {
    console.log('[component-highlighter-vue]', ...args)
  }
}

;(
  globalThis as typeof globalThis & { logDebug?: (...args: unknown[]) => void }
).logDebug = logDebug

logDebug('Vue runtime loaded', { debug: DEBUG_MODE })

// Component registry for tracking live instances
const componentRegistry = new Map<
  string,
  {
    id: string
    meta: Record<string, unknown>
    props: Record<string, unknown>
    serializedProps: Record<string, unknown>
    element: Element
    rect?: DOMRect
  }
>()

// Generate unique instance ID
function generateInstanceId(sourceId: string) {
  return `${sourceId}:${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Serialize props, handling Vue reactive objects
 */
function serializeProps(props: Record<string, unknown>) {
  const serialized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    serialized[key] = serializeValue(value)
  }

  return serialized
}

/**
 * Serialize a single value
 */
function serializeValue(value: unknown): unknown {
  // Handle Vue reactive objects
  if (value && typeof value === 'object') {
    if (typeof (value as { toJSON?: () => unknown }).toJSON === 'function') {
      // Vue ref or reactive object
      try {
        return JSON.parse(
          JSON.stringify(
            (value as { toJSON?: () => unknown }).toJSON?.() ?? value,
          ),
        )
      } catch {
        return undefined
      }
    } else if (Array.isArray(value)) {
      // Handle arrays
      return value.map((item) => serializeValue(item))
    } else if ((value as { constructor?: unknown }).constructor === Object) {
      // Plain objects
      const serialized: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        serialized[k] = serializeValue(v)
      }
      return serialized
    }
  }

  // Handle functions - return a placeholder
  if (typeof value === 'function') {
    return {
      __isFunction: true,
      name: (value as { name?: string }).name || 'anonymous',
    }
  }

  // Primitives pass through
  return value
}

// Registry management functions
export function registerInstance(
  meta: Record<string, unknown>,
  props: Record<string, unknown>,
  element: Element,
) {
  const id = generateInstanceId(meta['sourceId'] as string)
  const serializedProps = serializeProps(props)

  const instance = {
    id,
    meta,
    props,
    serializedProps,
    element,
  }
  componentRegistry.set(id, instance)

  logDebug('registerInstance', {
    id,
    componentName: meta['componentName'],
    totalComponents: componentRegistry.size,
  })

  // Dispatch event for listeners module
  const event = new CustomEvent('component-highlighter:register', {
    detail: instance,
  })
  window.dispatchEvent(event)
  logDebug('dispatched register event for', id)

  return id
}

export function unregisterInstance(id: string) {
  componentRegistry.delete(id)
  logDebug('unregistered', { id, remaining: componentRegistry.size })

  // Dispatch event for listeners module
  const event = new CustomEvent('component-highlighter:unregister', {
    detail: id,
  })
  window.dispatchEvent(event)
}

export function updateInstanceProps(
  id: string,
  props: Record<string, unknown>,
) {
  const instance = componentRegistry.get(id)
  if (instance) {
    instance.props = props
    instance.serializedProps = serializeProps(props)
    logDebug('updateInstanceProps', { id, props })

    // Dispatch event for listeners module
    const event = new CustomEvent('component-highlighter:update-props', {
      detail: { id, props, serializedProps: instance.serializedProps },
    })
    window.dispatchEvent(event)
  }
}

/**
 * Get the component registry for import resolution
 * Returns a map of component name -> file path
 */
export function getComponentRegistry() {
  const registry = new Map<string, string>()
  for (const instance of componentRegistry.values()) {
    registry.set(
      (instance.meta['componentName'] as string) || '',
      instance.meta['filePath'] as string,
    )
  }
  return registry
}

// Expose registry getter globally for story generation
if (typeof window !== 'undefined') {
  ;(
    window as unknown as {
      __componentHighlighterGetRegistry?: () => Map<string, string>
    }
  ).__componentHighlighterGetRegistry = getComponentRegistry
}

/**
 * Track a Vue component instance with the highlighter
 */
export function withComponentHighlighter(meta: Record<string, unknown>) {
  if (typeof window === 'undefined') return

  const instance = getCurrentInstance()
  if (!instance) {
    logDebug('Could not get current Vue instance for', meta['componentName'])
    return
  }

  const registration = {
    id: null as string | null,
    element: null as Element | null,
    disconnect: null as (() => void) | null,
  }

  const resolveElementToTrack = () => {
    let element =
      instance.proxy?.$el || instance.vnode?.el || instance.subTree?.el
    if (!element) return null

    if (element.nodeType !== Node.ELEMENT_NODE) {
      logDebug('Component root is not an Element node', {
        componentName: meta['componentName'],
        nodeType: element.nodeType,
        nodeName: element.nodeName,
      })

      const children = element.parentNode?.childNodes
      if (children) {
        for (const child of children) {
          if (child.nodeType === Node.ELEMENT_NODE) {
            element = child
            break
          }
        }
      }

      if (element.nodeType !== Node.ELEMENT_NODE) {
        return null
      }
    }

    return findFirstTrackableElement(element)
  }

  const registerOrUpdate = () => {
    const element = resolveElementToTrack()
    if (!element) {
      logDebug('Could not find valid Element node for', meta['componentName'])
      return
    }

    const props = instance.proxy?.$props || {}

    syncInstanceTracking({
      state: registration,
      element,
      props,
      register: (nextElement: Element, nextProps: Record<string, unknown>) =>
        registerInstance(meta, nextProps, nextElement),
      unregister: unregisterInstance,
      updateProps: updateInstanceProps,
      getInstance: (lookupId: string) => componentRegistry.get(lookupId),
    })
  }

  // Store meta in a way that child components can access it
  provide('__componentHighlighterMeta', meta)

  onMounted(() => {
    registerOrUpdate()
  })

  onUpdated(() => {
    registerOrUpdate()
  })

  onUnmounted(() => {
    cleanupInstanceTracking(registration, unregisterInstance)
  })
}

export default {
  registerInstance,
  unregisterInstance,
  updateInstanceProps,
  getComponentRegistry,
  withComponentHighlighter,
}
