/**
 * React-major-mismatch detection, shared by the Vite and Rsbuild adapters.
 *
 * The plugin's bundled `react-element-to-jsx-string` resolves *its own*
 * React (this plugin's copy) rather than the app's. When the majors differ
 * (e.g. the app is on React 18 but the plugin's copy is 19), the library's
 * internal `React.isValidElement` rejects the app's elements and prop
 * serialization silently degrades to a "Failed to serialize" placeholder.
 * Deduping forces a single React instance and fixes it.
 */
import { createRequire } from 'module'
import * as path from 'path'
import { fileURLToPath } from 'url'

export interface ResolveReactDedupeOptions {
  /** The consuming app's root directory, used to resolve its React version. */
  appRoot: string
  /** The user's `dedupeReact` option value. */
  dedupeReact: boolean | 'auto'
  /** Debug logger, mirrors the plugin's `debugMode` logging. */
  logDebug: (...args: unknown[]) => void
}

export interface ResolveReactDedupeResult {
  shouldDedupe: boolean
}

function majorOf(fromDir: string): number | null {
  try {
    const req = createRequire(path.join(fromDir, 'noop.js'))
    const pkg = req('react/package.json') as { version?: string }
    const m = /^(\d+)\./.exec(pkg.version || '')
    return m ? Number(m[1]) : null
  } catch {
    return null
  }
}

/**
 * Decides whether `react`/`react-dom` should be added to the bundler's
 * dedupe list.
 *
 * - `dedupeReact: 'auto'` (default) applies the dedupe only when the app's
 *   React major differs from this plugin's bundled copy — or when either
 *   version is undetectable, the safe-path default.
 * - `true` always applies.
 * - `false` never applies, but logs a warning when the mismatch condition
 *   is detected anyway (it never fails silently).
 */
export function resolveReactDedupe(
  options: ResolveReactDedupeOptions,
): ResolveReactDedupeResult {
  const { appRoot, dedupeReact, logDebug } = options

  const appReactMajor = majorOf(appRoot)
  const pluginReactMajor = majorOf(
    path.dirname(fileURLToPath(import.meta.url)),
  )
  // Mismatch (or an undetectable app version → assume the safe path).
  const mismatch =
    appReactMajor === null ||
    pluginReactMajor === null ||
    appReactMajor !== pluginReactMajor

  const shouldDedupe =
    dedupeReact === true || (dedupeReact === 'auto' && mismatch)

  logDebug(
    `dedupeReact=${String(dedupeReact)} appReactMajor=${appReactMajor} ` +
      `pluginReactMajor=${pluginReactMajor} mismatch=${mismatch} ` +
      `→ ${shouldDedupe ? 'APPLY react/react-dom dedupe' : 'NO config mutation'}`,
  )

  if (dedupeReact === false && mismatch) {
    // Never fail silently: the user explicitly opted out but we detect
    // the exact condition that degrades prop serialization.
    console.warn(
      '[component-highlighter] Detected a React version mismatch ' +
        `(app: ${appReactMajor ?? 'unknown'}, plugin serializer: ` +
        `${pluginReactMajor ?? 'unknown'}) while \`dedupeReact: false\`. ` +
        'Prop serialization may degrade to "Failed to serialize". ' +
        'Add react/react-dom to resolve.dedupe, or set ' +
        "`dedupeReact: 'auto'`. See the README (React version support).",
    )
  }

  return { shouldDedupe }
}
