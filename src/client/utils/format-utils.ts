/**
 * Formatting utilities for component display.
 *
 * Path formatting, breadcrumb generation, and story name suggestions.
 */

import { esc } from './prop-utils'

/** Turn a file path into breadcrumb segments. */
export function toBreadcrumbs(relPath: string | undefined): string {
  if (!relPath) return ''
  const parts = relPath.replace(/\\/g, '/').split('/')
  if (parts.length > 4) {
    const first = parts[0]!
    const last2 = parts.slice(-2)
    return [first, '...', ...last2]
      .map((p, i, arr) =>
        i < arr.length - 1
          ? `<span>${esc(p)}</span><span class="sep"> &gt; </span>`
          : `<span class="file">${esc(p)}</span>`,
      )
      .join('')
  }
  return parts
    .map((p, i) =>
      i < parts.length - 1
        ? `<span>${esc(p)}</span><span class="sep"> &gt; </span>`
        : `<span class="file">${esc(p)}</span>`,
    )
    .join('')
}

/** Suggest a story export name from the component's current props. */
export function suggestStoryName(props: Record<string, unknown>): string {
  const meaningfulProps = [
    'variant',
    'type',
    'size',
    'mode',
    'status',
    'kind',
    'color',
    'intent',
    'appearance',
  ]

  for (const propName of meaningfulProps) {
    const value = props[propName]
    if (typeof value === 'string' && value.length > 0 && value.length < 30) {
      return value.charAt(0).toUpperCase() + value.slice(1)
    }
  }

  for (const [key, value] of Object.entries(props)) {
    if (value === true && !key.startsWith('_')) {
      return key.charAt(0).toUpperCase() + key.slice(1)
    }
  }

  return 'Default'
}
