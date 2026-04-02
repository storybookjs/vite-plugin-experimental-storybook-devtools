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
import { serializeVNodeToTemplate } from './vnode-to-template'

// Injected by the virtual module loader.
declare const __COMPONENT_HIGHLIGHTER_DEBUG__: boolean

const DEBUG_MODE = __COMPONENT_HIGHLIGHTER_DEBUG__

// Expose debug flag to client modules (overlay, listeners, etc.)
if (typeof window !== 'undefined' && DEBUG_MODE) {
  window.__componentHighlighterDebug = true
}

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

function toListenerPropName(eventName: string): string {
  if (!eventName) return 'onUnknown'
  return `on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`
}

function extractDeclaredEmitNames(instance: {
  type?: { emits?: unknown }
}): Set<string> {
  const names = new Set<string>()
  const emits = instance.type?.emits

  if (Array.isArray(emits)) {
    for (const eventName of emits) {
      if (typeof eventName === 'string' && eventName) {
        names.add(eventName)
      }
    }
    return names
  }

  if (emits && typeof emits === 'object') {
    for (const key of Object.keys(emits as Record<string, unknown>)) {
      if (key) names.add(key)
    }
  }

  return names
}

function extractListenerProps(instance: {
  vnode?: { props?: Record<string, unknown> | null }
}): Record<string, unknown> {
  const listenerProps: Record<string, unknown> = {}
  const vnodeProps = instance.vnode?.props ?? {}

  for (const [key, value] of Object.entries(vnodeProps)) {
    if (!key.startsWith('on')) continue
    if (key.length <= 2) continue
    if (key === 'onVnodeBeforeMount' || key === 'onVnodeMounted') continue
    if (
      key === 'onVnodeBeforeUpdate' ||
      key === 'onVnodeUpdated' ||
      key === 'onVnodeBeforeUnmount' ||
      key === 'onVnodeUnmounted'
    ) {
      continue
    }

    listenerProps[key] = value
  }

  return listenerProps
}

function extractSlotArgs(instance: {
  slots?: Record<string, ((props?: unknown) => unknown) | undefined>
  proxy?: {
    $slots?: Record<string, ((props?: unknown) => unknown) | undefined>
  }
}): Record<string, unknown> {
  const slotArgs: Record<string, unknown> = {}
  const slots = instance.slots ?? instance.proxy?.$slots ?? {}

  for (const [slotName, slotFn] of Object.entries(slots)) {
    if (!slotName || slotName.startsWith('_')) continue
    if (typeof slotFn !== 'function') continue

    try {
      const slotResult = slotFn({})
      const { source, componentRefs } = serializeVNodeToTemplate(
        slotResult,
        serializeValue,
      )

      slotArgs[`slot:${slotName}`] = source
        ? {
            __isVueSlot: true,
            source,
            componentRefs,
          }
        : slotName === 'default'
          ? 'Default slot content'
          : `${slotName} slot content`
    } catch {
      // Ignore slot evaluation errors and still expose slot control.
      slotArgs[`slot:${slotName}`] =
        slotName === 'default'
          ? 'Default slot content'
          : `${slotName} slot content`
    }
  }

  return slotArgs
}

function getStoryProps(
  instance: {
    type?: { emits?: unknown }
    vnode?: { props?: Record<string, unknown> | null }
    slots?: Record<string, ((props?: unknown) => unknown) | undefined>
    proxy?: {
      $slots?: Record<string, ((props?: unknown) => unknown) | undefined>
    }
  },
  rawProps: Record<string, unknown>,
): Record<string, unknown> {
  const storyProps: Record<string, unknown> = { ...rawProps }

  const slotArgs = extractSlotArgs(instance)
  for (const [slotKey, slotValue] of Object.entries(slotArgs)) {
    if (!(slotKey in storyProps)) {
      storyProps[slotKey] = slotValue
    }
  }

  const declaredEmits = extractDeclaredEmitNames(instance)
  const listenerProps = extractListenerProps(instance)

  for (const [listenerName, listenerValue] of Object.entries(listenerProps)) {
    if (!(listenerName in storyProps)) {
      storyProps[listenerName] = listenerValue
    }

    if (listenerName.length > 2) {
      const eventName =
        listenerName.charAt(2).toLowerCase() + listenerName.slice(3)
      if (eventName) declaredEmits.add(eventName)
    }
  }

  for (const eventName of declaredEmits) {
    const listenerPropName = toListenerPropName(eventName)
    if (!(listenerPropName in storyProps)) {
      storyProps[listenerPropName] = () => undefined
    }
  }

  return storyProps
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
    const storyProps = getStoryProps(instance, props)

    syncInstanceTracking({
      state: registration,
      element,
      props: storyProps,
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
