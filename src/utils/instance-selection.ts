/**
 * Picking which live component instance a generated story is built from,
 * when several instances of the same component are rendered at once (e.g.
 * one Button per card in a list). Pure functions — callers fetch the live
 * registry snapshot themselves. Shared by the panel (coverage-tab create,
 * "Generate all") and the `create-story` RPC handler (toast wording).
 */

export interface SelectableInstance {
  serializedProps?: Record<string, unknown>
  /** Top-level prop keys the user has live-edited (differ from original). */
  editedProps?: string[]
}

/**
 * Build a fingerprint string for serialized props, ignoring functions and JSX.
 * Used to deduplicate component instances that represent the same variant.
 */
export function propsFingerprint(props: Record<string, unknown>): string {
  const meaningful: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      if (v['__isFunction'] || v['__isJSX']) continue
    }
    if (typeof value === 'function') continue
    meaningful[key] = value
  }
  return JSON.stringify(meaningful, Object.keys(meaningful).sort())
}

/**
 * Group instances by a caller-supplied key (typically filePath + props
 * fingerprint) and pick one representative per group. When two instances
 * share a key, prefer the one carrying live edits — a fingerprint collision
 * must never silently discard an edited sibling's props in favor of an
 * unedited one.
 */
export function pickRepresentativeByKey<T extends SelectableInstance>(
  instances: readonly T[],
  keyFn: (instance: T) => string,
): T[] {
  const seen = new Map<string, T>()
  for (const instance of instances) {
    const key = keyFn(instance)
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, instance)
      continue
    }
    const existingEdited = (existing.editedProps?.length ?? 0) > 0
    const candidateEdited = (instance.editedProps?.length ?? 0) > 0
    if (candidateEdited && !existingEdited) {
      seen.set(key, instance)
    }
  }
  return Array.from(seen.values())
}

/** 1-based ordinal suffix: 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th", ... */
export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
