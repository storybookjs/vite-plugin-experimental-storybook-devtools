/**
 * HTML preview and LLM prompt builder utilities.
 *
 * Generates concise, react-grab-style HTML previews of DOM elements
 * and builds AI-agent-friendly prompts from component metadata.
 */

import type { ComponentInstance } from '../../frameworks/types'

const PREVIEW_TEXT_MAX_LENGTH = 100
const PREVIEW_ATTR_VALUE_MAX_LENGTH = 15
const PREVIEW_MAX_ATTRS = 3
const PREVIEW_PRIORITY_ATTRS = [
  'id',
  'class',
  'aria-label',
  'data-testid',
  'role',
  'type',
  'href',
  'src',
  'name',
  'placeholder',
]

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

/**
 * Generate a concise HTML preview of a DOM element, inspired by react-grab.
 * Truncates attributes, limits children, and condenses text content.
 */
export function getHTMLPreview(element: HTMLElement): string {
  const tag = element.tagName.toLowerCase()
  const attrs = element.attributes

  // Collect and prioritize attributes
  const attrMap = new Map<string, string>()
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    // Skip internal/framework attributes
    if (
      attr.name.startsWith('data-storybook') ||
      attr.name.startsWith('data-v-') ||
      attr.name.startsWith('__')
    )
      continue
    attrMap.set(attr.name, attr.value)
  }

  // Sort: priority attrs first, then alphabetical
  const sortedNames = [...attrMap.keys()].sort((a, b) => {
    const ai = PREVIEW_PRIORITY_ATTRS.indexOf(a)
    const bi = PREVIEW_PRIORITY_ATTRS.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.localeCompare(b)
  })

  const selectedAttrs = sortedNames.slice(0, PREVIEW_MAX_ATTRS)
  const attrStr = selectedAttrs
    .map((name) => {
      const val = attrMap.get(name)!
      return val === ''
        ? name
        : `${name}="${truncate(val, PREVIEW_ATTR_VALUE_MAX_LENGTH)}"`
    })
    .join(' ')

  const openTag = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`

  // Build concise inner content
  const children = element.childNodes
  if (children.length === 0) {
    return `${openTag}</${tag}>`
  }

  const textContent = (element.textContent || '').trim()
  const childElements = Array.from(element.children)

  // If only text content (no child elements), show truncated text
  if (childElements.length === 0 && textContent) {
    return `${openTag}\n  ${truncate(textContent, PREVIEW_TEXT_MAX_LENGTH)}\n</${tag}>`
  }

  // Show a summary of child structure
  const lines: string[] = []
  const maxChildren = 3
  const shown = childElements.slice(0, maxChildren)
  for (const child of shown) {
    const childTag = child.tagName.toLowerCase()
    const childText = (child.textContent || '').trim()
    if (childText) {
      lines.push(`  <${childTag}>${truncate(childText, 50)}</${childTag}>`)
    } else {
      lines.push(`  <${childTag} />`)
    }
  }
  if (childElements.length > maxChildren) {
    lines.push(`  <!-- ${childElements.length - maxChildren} more elements -->`)
  }

  return `${openTag}\n${lines.join('\n')}\n</${tag}>`
}

/**
 * Build an LLM-friendly prompt from a component instance.
 * Includes a concise HTML preview, source location, props, and story info.
 */
export function buildLLMPrompt(
  instance: ComponentInstance,
  hasStory: boolean,
  storyPath: string | null,
): string {
  const { componentName, relativeFilePath, filePath, line, column } =
    instance.meta
  const relativePath = relativeFilePath || filePath
  const displayProps = instance.serializedProps || instance.props

  // Strip non-serializable props (functions, JSX, slots)
  const meaningfulProps: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(displayProps)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      if (v.__isFunction || v.__isJSX || v.__isVueSlot) continue
    }
    if (typeof value === 'function') continue
    meaningfulProps[key] = value
  }

  // Concise HTML preview of the rendered element
  const htmlPreview = getHTMLPreview(instance.element)

  // Source location with optional line:col
  const loc = line
    ? `${relativePath}:${line}${column ? ':' + column : ''}`
    : relativePath

  // Props as compact JSON (single-line if small, indented if large)
  const hasProps = Object.keys(meaningfulProps).length > 0
  const propsJson = hasProps ? JSON.stringify(meaningfulProps, null, 2) : null
  const propsBlock = propsJson
    ? propsJson.length <= 80
      ? propsJson
      : '\n' + propsJson
    : null

  const storyLine =
    hasStory && storyPath
      ? `Story file: \`${storyPath}\``
      : `No Storybook story file yet.`

  const sections: string[] = [
    '```html',
    htmlPreview,
    '```',
    `in ${componentName} at ${loc}`,
  ]

  if (propsBlock) {
    sections.push('', 'Props: ```json', propsBlock, '```')
  }

  sections.push('', storyLine)

  return sections.join('\n')
}
