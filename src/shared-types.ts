/**
 * Shared types used by both server-side plugin and client-side code.
 * Kept in a separate file to avoid importing server modules from client code.
 */
import type { SerializedProps } from './frameworks/types'

/** Serialized component instance (no DOM refs, safe for RPC transfer) */
export interface SerializedRegistryInstance {
  id: string
  meta: {
    componentName: string
    filePath: string
    relativeFilePath?: string
    sourceId: string
    isDefaultExport?: boolean
  }
  props: Record<string, unknown>
  serializedProps?: SerializedProps
  isConnected: boolean
}

/** Incremental diff for syncing registry changes from client to server */
export interface RegistryDiff {
  added: SerializedRegistryInstance[]
  removed: string[]
  updated: SerializedRegistryInstance[]
}
