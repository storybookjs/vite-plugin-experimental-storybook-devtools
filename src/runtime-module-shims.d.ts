declare module 'virtual:component-highlighter/runtime-helpers' {
  export function findFirstTrackableElement(root: Node | null): Element | null
  export function attachRectObservers(
    getInstance: (
      id: string,
    ) => { element?: Element; rect?: DOMRect } | undefined,
    id: string,
    element: Element,
  ): () => void
  export function syncInstanceTracking(options: {
    state: {
      id: string | null
      element: Element | null
      disconnect: (() => void) | null
    }
    element: Element
    props: Record<string, unknown>
    register: (element: Element, props: Record<string, unknown>) => string
    unregister: (id: string) => void
    updateProps: (id: string, props: Record<string, unknown>) => void
    getInstance: (
      id: string,
    ) => { element?: Element; rect?: DOMRect } | undefined
  }): void
  export function cleanupInstanceTracking(
    state: {
      id: string | null
      element: Element | null
      disconnect: (() => void) | null
    },
    unregister: (id: string) => void,
  ): void
}

declare module 'react' {
  const React: any
  export default React
  export const useEffect: any
  export const useRef: any
  export const isValidElement: any
  export const Fragment: any
  export type ReactElement = any
  export type ComponentType<T = any> = any
  export type ReactNode = any
}

declare module 'vue' {
  export const provide: any
  export const onMounted: any
  export const onUpdated: any
  export const onUnmounted: any
  export const getCurrentInstance: any
}

declare module 'react-element-to-jsx-string/dist/esm/index.js' {
  const fn: any
  export default fn
}
