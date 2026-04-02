/**
 * Client-side actions triggered by the panel via RPC broadcast.
 * These run in the app's browser context so they can access the DOM directly.
 */
import type { ComponentInstance } from '../frameworks/types'

// Reference set by listeners.ts during initialization
let componentRegistry: Map<string, ComponentInstance> | null = null

export function setRegistryRef(registry: Map<string, ComponentInstance>) {
  componentRegistry = registry
}

// ─── Coverage highlight overlays ─────────────────────────────────────

const COVERAGE_HIGHLIGHT_ATTR = 'data-coverage-highlight'

export function clearCoverageHighlights() {
  const els = document.querySelectorAll(`[${COVERAGE_HIGHLIGHT_ATTR}]`)
  els.forEach((el) => el.remove())
}

export function showCoverageHighlights(
  componentName: string,
  hasStory: boolean,
) {
  clearCoverageHighlights()
  if (!componentRegistry) return

  const color = hasStory ? '#22c55e' : '#ef4444'

  for (const instance of componentRegistry.values()) {
    if (
      instance.meta.componentName === componentName &&
      instance.element?.isConnected &&
      instance.element.nodeType === Node.ELEMENT_NODE
    ) {
      const rect = instance.element.getBoundingClientRect()
      const box = document.createElement('div')
      box.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.top}px;
        width: ${rect.width}px;
        height: ${rect.height}px;
        outline: 2px solid ${color};
        outline-offset: -1px;
        background: ${color}22;
        pointer-events: none;
        z-index: 999999;
        transition: opacity 0.2s ease;
        border-radius: 2px;
      `
      box.setAttribute(COVERAGE_HIGHLIGHT_ATTR, 'true')
      document.body.appendChild(box)
    }
  }
}

// ─── Scroll to component ─────────────────────────────────────────────

export function scrollToComponent(componentName: string) {
  if (!componentRegistry) return

  for (const instance of componentRegistry.values()) {
    if (
      instance.meta.componentName === componentName &&
      instance.element?.isConnected
    ) {
      clearCoverageHighlights()
      instance.element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Re-highlight after scroll so overlays match new viewport positions
      const storyInfo = (instance as any)._hasStory ?? false
      window.addEventListener(
        'scrollend',
        () => {
          showCoverageHighlights(componentName, storyInfo)
        },
        { once: true },
      )
      break
    }
  }
}
