declare module 'virtual:component-highlighter/runtime-helpers' {
  export function isTrackingActive(): boolean
  export function onTrackingActivated(cb: () => void): void
  export function activateTracking(): void
  export function scheduleSerialization(
    id: string,
    run: () => void,
    isAlive: () => boolean,
  ): void
  export function cancelScheduledSerialization(id: string): void
  export function findFirstTrackableElement(root: Node | null): Element | null
  export function attachRectObservers(
    getInstance: (
      id: string,
    ) => { element?: Element; rect?: DOMRect } | undefined,
    id: string,
    element: Element,
  ): () => void

  export type PropPath = Array<string | number>
  export type SetPropPayload = { kind: string; text: string }
  export type PropEditResult = { ok: boolean; error?: string }
  export interface LivePropEditor {
    setProp: (
      id: string,
      path: PropPath,
      payload: SetPropPayload,
    ) => PropEditResult
    resetProp: (id: string, path: PropPath) => PropEditResult
    getEditedProps: (id: string) => string[]
    forgetInstance: (id: string) => void
  }
  export function setAtPath(
    obj: Record<string, unknown>,
    path: PropPath,
    value: unknown,
  ): Record<string, unknown>
  export function getAtPath(obj: unknown, path: PropPath): unknown
  export function createLivePropEditor(options: {
    getInstance: (id: string) =>
      | {
          props: Record<string, unknown>
          serializedProps: Record<string, unknown>
        }
      | undefined
    serializeValue: (value: unknown) => unknown
    applyOverride: (id: string, path: PropPath, value: unknown) => void
  }): LivePropEditor
  export function installLivePropEditGlobals(
    editor: LivePropEditor,
    canEdit: () => boolean,
  ): void
}

declare module 'react' {
  const React: any
  export default React
  export const useEffect: any
  export const useRef: any
  export const useState: any
  export const isValidElement: any
  export const Fragment: any
  export type ReactElement = any
  export type ComponentType<T = any> = any
  export type ReactNode = any
}

declare module 'react-element-to-jsx-string/dist/esm/index.js' {
  const fn: any
  export default fn
}
