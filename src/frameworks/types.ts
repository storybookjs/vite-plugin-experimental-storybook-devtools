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
 * Transform function signature
 * Takes source code and file ID, returns transformed code or undefined
 */
export type TransformFunction = (code: string, id: string) => string | undefined

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
}

/**
 * Provider dependency detection result
 */
export interface ProviderDependency {
  type: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  suggestedDecorator?: string
  requiredImports?: string[]
  docsUrl?: string
}
