/**
 * Prop classification and rendering utilities.
 *
 * Pure helpers for classifying component prop values and rendering
 * JSON-like object trees as HTML. No DOM dependencies beyond string output.
 */

/** HTML-escape a string for safe insertion into markup. */
export function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Classify a prop value for badge rendering. */
export function classifyProp(
  _key: string,
  value: unknown,
): { typeClass: string; display: string; viewable: boolean; raw: unknown } {
  if (value && typeof value === 'object' && '__isJSX' in value) {
    const jsx = value as { __isJSX: true; source: string }
    return {
      typeClass: 'jsx',
      display: '<View JSX>',
      viewable: true,
      raw: jsx.source,
    }
  }
  if (value && typeof value === 'object' && '__isVueSlot' in value) {
    const slot = value as { __isVueSlot: true; source: string }
    return {
      typeClass: 'slot',
      display: '<View slot>',
      viewable: true,
      raw: slot.source,
    }
  }
  if (value && typeof value === 'object' && '__isFunction' in value) {
    return { typeClass: 'fn', display: '<fn>', viewable: false, raw: null }
  }
  if (value && typeof value === 'object' && '__isObject' in value) {
    const o = value as { __isObject: true; name?: string }
    return {
      typeClass: 'obj',
      display: o.name || 'Object',
      viewable: false,
      raw: null,
    }
  }
  if (typeof value === 'function') {
    return { typeClass: 'fn', display: '<fn>', viewable: false, raw: null }
  }
  if (typeof value === 'string') {
    return { typeClass: 'str', display: value, viewable: false, raw: value }
  }
  if (typeof value === 'number') {
    return {
      typeClass: 'num',
      display: String(value),
      viewable: false,
      raw: value,
    }
  }
  if (typeof value === 'boolean') {
    return {
      typeClass: 'bool',
      display: String(value),
      viewable: false,
      raw: value,
    }
  }
  if (value === null || value === undefined) {
    return {
      typeClass: 'null',
      display: String(value),
      viewable: false,
      raw: null,
    }
  }
  if (typeof value === 'object') {
    return {
      typeClass: 'obj',
      display: 'View object',
      viewable: true,
      raw: value,
    }
  }
  return {
    typeClass: 'str',
    display: String(value),
    viewable: false,
    raw: value,
  }
}

/** Kinds of editable prop the inline editor supports. */
export type EditKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json' // objects, arrays, null, undefined, or any pure JSON value

/** Payload sent to the runtime to apply a live prop override. */
export interface SetPropPayload {
  kind: EditKind
  /** Raw text the user entered (interpreted by `kind`). */
  text: string
}

/** Deep scan: does a serialized value contain a non-reconstructable marker? */
function containsUnreconstructable(value: unknown, depth = 0): boolean {
  if (depth > 8) return true
  if (!value || typeof value !== 'object') return typeof value === 'function'
  const v = value as Record<string, unknown>
  if (v['__isJSX'] || v['__isFunction'] || v['__isVueSlot'] || v['__isObject'])
    return true
  if (v['__isDate']) return false
  if (Array.isArray(value)) {
    return value.some((it) => containsUnreconstructable(it, depth + 1))
  }
  return Object.values(v).some((it) => containsUnreconstructable(it, depth + 1))
}

/**
 * Decide whether a (serialized) prop value can be live-edited and how.
 * Functions / JSX / Vue slots are read-only (cannot be round-tripped).
 */
export function propEditability(value: unknown): {
  editable: boolean
  kind: EditKind
  reason?: string
} {
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (v['__isJSX'])
      return { editable: false, kind: 'json', reason: 'JSX is read-only' }
    if (v['__isVueSlot'])
      return { editable: false, kind: 'json', reason: 'Slot is read-only' }
    if (v['__isFunction'])
      return {
        editable: false,
        kind: 'json',
        reason: 'Functions are read-only',
      }
    if (v['__isObject'])
      return {
        editable: false,
        kind: 'json',
        reason: 'Non-plain object is read-only',
      }
    if (v['__isDate']) return { editable: true, kind: 'date' }
  }
  if (typeof value === 'function')
    return { editable: false, kind: 'json', reason: 'Functions are read-only' }
  if (typeof value === 'string') return { editable: true, kind: 'string' }
  if (typeof value === 'number') return { editable: true, kind: 'number' }
  if (typeof value === 'boolean') return { editable: true, kind: 'boolean' }
  if (value === null || value === undefined)
    return { editable: true, kind: 'json' }
  if (typeof value === 'object') {
    if (containsUnreconstructable(value))
      return {
        editable: false,
        kind: 'json',
        reason: 'Contains a function/JSX and cannot be edited',
      }
    return { editable: true, kind: 'json' }
  }
  return { editable: false, kind: 'json', reason: 'Unsupported value' }
}

/** Pretty default text to seed the editor input for a given value. */
export function editInitialText(value: unknown, kind: EditKind): string {
  if (kind === 'date') {
    const iso = (value as { iso?: string })?.iso
    return typeof iso === 'string' ? iso : new Date().toISOString()
  }
  if (kind === 'string') return String(value ?? '')
  if (kind === 'number') return String(value ?? 0)
  if (kind === 'boolean') return value ? 'true' : 'false'
  // json
  if (value === undefined) return 'null'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return 'null'
  }
}

/** Render JSON-like tree for the object viewer popover. */
const P = (s: string) => `<span class="obj-tree-punct">${s}</span>`

export function renderObjectTree(obj: unknown, depth = 0, maxDepth = 6): string {
  const indent = '  '.repeat(depth)
  if (depth > maxDepth) return `${indent}<span class="obj-tree-null">…</span>\n`

  if (obj === null) return `<span class="obj-tree-null">null</span>`
  if (obj === undefined) return `<span class="obj-tree-null">undefined</span>`
  if (typeof obj === 'string')
    return `${P('"')}<span class="obj-tree-str">${esc(obj)}</span>${P('"')}`
  if (typeof obj === 'number') return `<span class="obj-tree-num">${obj}</span>`
  if (typeof obj === 'boolean')
    return `<span class="obj-tree-bool">${obj}</span>`

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${P('[')}${P(']')}`
    const lines = obj.map((item, i) => {
      const val = renderObjectTree(item, depth + 1, maxDepth)
      const comma = i < obj.length - 1 ? P(',') : ''
      return `${'  '.repeat(depth + 1)}${val}${comma}`
    })
    return `${P('[')}\n${lines.join('\n')}\n${indent}${P(']')}`
  }

  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return `${P('{')}${P('}')}`
    const lines = entries.map(([k, v], i) => {
      const val = renderObjectTree(v, depth + 1, maxDepth)
      const comma = i < entries.length - 1 ? P(',') : ''
      return `${'  '.repeat(depth + 1)}${P('"')}<span class="obj-tree-key">${esc(k)}</span>${P('"')}${P(':')} ${val}${comma}`
    })
    return `${P('{')}\n${lines.join('\n')}\n${indent}${P('}')}`
  }

  return esc(String(obj))
}
