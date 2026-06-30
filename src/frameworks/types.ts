/**
 * Framework Types
 *
 * Shared interfaces and types for multi-framework support.
 * These types define the contract that each framework implementation must fulfill.
 */

/**
 * Metadata about a component, injected at build time
 */
export interface ComponentMeta {
  /** The component's display name */
  componentName: string
  /** Absolute file path */
  filePath: string
  /** Relative file path from project root */
  relativeFilePath: string
  /** Unique hash for this component definition */
  sourceId: string
  /** Whether this is the default export */
  isDefaultExport: boolean
  /** Source line number (optional) */
  line?: number
  /** Source column number (optional) */
  column?: number
}

/**
 * A live component instance tracked at runtime
 */
export interface ComponentInstance {
  /** Unique instance ID (sourceId + random suffix) */
  id: string
  /** Static metadata from build time */
  meta: ComponentMeta
  /** Current props (live reference) */
  props: Record<string, unknown>
  /** Serialized props for story generation */
  serializedProps?: SerializedProps
  /** Cached bounding rectangle */
  rect?: DOMRect
  /** DOM element reference for positioning */
  element: HTMLElement
}

/**
 * Serialized JSX value (for story generation)
 */
export interface JSXSerializedValue {
  __isJSX: true
  /** The JSX source code string */
  source: string
  /** Component names referenced in the JSX (for imports) */
  componentRefs: string[]
}

/**
 * Serialized function value (for story generation)
 */
export interface FunctionSerializedValue {
  __isFunction: true
  /** Function name (if available) */
  name: string
}

/**
 * Serialized props object
 */
export interface SerializedProps {
  [key: string]: JSXSerializedValue | FunctionSerializedValue | unknown
}

/**
 * Options passed to the runtime module loader
 */
export interface HighlighterOptions {
  /** Custom event name for story creation */
  eventName: string
  /** Whether to enable the overlay */
  enableOverlay: boolean
  /** DevTools dock panel ID */
  devtoolsDockId: string
  /** Enable debug logging */
  debugMode?: boolean
}

/**
 * A non-fatal instrumentation issue surfaced by a transform — reported to the
 * plugin (via {@link TransformOptions.onIssue}) so it can raise a structured
 * DevTools diagnostic. Distinct from a hard failure: the file is still served,
 * the component just isn't (fully) detectable.
 */
export interface TransformIssue {
  /** `transform-failed`: the file couldn't be parsed/instrumented at all.
   *  `unsupported-pattern`: a component-shaped binding can't be tagged. */
  code: 'transform-failed' | 'unsupported-pattern'
  /** Absolute path of the offending module. */
  file: string
  /** Human-readable detail (used as the diagnostic message). */
  detail: string
  /** For `unsupported-pattern`: the binding name (or `'default'`). */
  name?: string
  /** `file:line:column` of the offending source, when known. */
  loc?: string
}

/**
 * Options passed to a framework transform per file.
 */
export interface TransformOptions {
  /**
   * React Server Components mode. When `true`, only modules that declare a
   * `"use client"` directive are instrumented; modules without it are treated
   * as server components and left untouched (they never mount a client fiber,
   * so tagging is useless and would pull the client runtime into the server
   * module graph). When `false` (default), every matching module is tagged —
   * the correct behavior for a plain SPA where there is no `"use client"`
   * directive but every component runs on the client.
   */
  rsc?: boolean
  /**
   * Reporter for non-fatal instrumentation issues (unsupported patterns, parse
   * failures). The plugin forwards these to `ctx.diagnostics`. Optional so the
   * transform stays usable standalone (e.g. in unit tests).
   */
  onIssue?: (issue: TransformIssue) => void
}

/**
 * Transform function signature
 * Takes source code, file ID, and optional per-file options; returns
 * transformed code or undefined (no transform).
 */
export type TransformFunction = (
  code: string,
  id: string,
  options?: TransformOptions,
) => string | undefined

/**
 * Framework detection function signature
 * Returns true if the file should be processed by this framework
 */
export type FrameworkDetector = (code: string, id: string) => boolean

/**
 * Framework configuration
 */
export interface FrameworkConfig {
  /** Framework identifier */
  name: string
  /** Display name for UI */
  displayName: string
  /** File extensions this framework handles */
  extensions: string[]
  /** Detect if a file belongs to this framework */
  detect: FrameworkDetector
  /** Transform function for this framework */
  transform: TransformFunction
  /** Path (without extension) to the runtime module entry */
  runtimeModuleFile: string
  /** Virtual module ID for imports */
  virtualModuleId: string
  /** Storybook framework package name */
  storybookFramework: string
  /**
   * Optional inline `<script>` body injected into the HTML <head> before any
   * module scripts. Used by React to install the DevTools global hook before
   * react-dom registers its renderer (non-intrusive fiber detection).
   */
  htmlHeadSnippet?: () => string | undefined
}
