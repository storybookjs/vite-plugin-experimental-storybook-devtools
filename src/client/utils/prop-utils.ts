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
