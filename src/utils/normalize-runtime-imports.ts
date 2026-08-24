const RUNTIME_HELPER_VIRTUAL_ID = 'virtual:component-highlighter/runtime-helpers'

/**
 * Vite's import-analysis rewrites the runtime-helpers import inside the
 * transformed runtime module to its URL form `<base>/@id/__x00__<id>` and,
 * after an HMR invalidation, appends a `?t=<timestamp>` query. Normalize both
 * back to the bare virtual id so the plugin's resolveId matches when the
 * browser re-imports the runtime module.
 *
 * `base` is NOT always `/`: Nuxt serves app modules under `/_nuxt/`, so the
 * rewritten URL is `/_nuxt/@id/__x00__virtual:...`. A base-unaware replace
 * would strip only the `/@id/...` substring and leave a mangled
 * `/_nuxtvirtual:...` specifier behind.
 */
export function normalizeRuntimeImports(code: string, base: string): string {
  const basePrefix = base.replace(/\/$/, '')
  const escapedPrefix = basePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `${escapedPrefix}/@id/__x00__${RUNTIME_HELPER_VIRTUAL_ID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\?t=\\d+)?`,
    'g',
  )
  return code.replace(pattern, RUNTIME_HELPER_VIRTUAL_ID)
}
