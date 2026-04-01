/**
 * Merged Storybook + Coverage panel.
 *
 * Hosted as a standalone HTML app via `ctx.views.hostStatic`.
 * Communicates with the server plugin via fetch-based middleware endpoints.
 */

// ─── Icons ──────────────────────────────────────────────────────────
const CODE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
const SB_ICON_SMALL = `<svg width="12" height="12" viewBox="-31.5 0 319 319" xmlns="http://www.w3.org/2000/svg"><path fill="#FF4785" d="M9.87,293.32L0.01,30.57C-0.31,21.9,6.34,14.54,15.01,14L238.49,0.03C247.32,-0.52,254.91,6.18,255.47,15.01C255.49,15.34,255.5,15.67,255.5,16V302.32C255.5,311.16,248.33,318.32,239.49,318.32C239.25,318.32,239.01,318.32,238.77,318.31L25.15,308.71C16.83,308.34,10.18,301.65,9.87,293.32Z"/><path fill="#FFF" d="M188.67,39.13L190.19,2.41L220.88,0L222.21,37.86C222.25,39.18,221.22,40.29,219.9,40.33C219.34,40.35,218.79,40.17,218.34,39.82L206.51,30.5L192.49,41.13C191.44,41.93,189.95,41.72,189.15,40.67C188.81,40.23,188.64,39.68,188.67,39.13ZM149.41,119.98C149.41,126.21,191.36,123.22,196.99,118.85C196.99,76.45,174.23,54.17,132.57,54.17C90.91,54.17,67.57,76.79,67.57,110.74C67.57,169.85,147.35,170.98,147.35,203.23C147.35,212.28,142.91,217.65,133.16,217.65C120.46,217.65,115.43,211.17,116.02,189.1C116.02,184.32,67.57,182.82,66.09,189.1C62.33,242.57,95.64,257.99,133.75,257.99C170.69,257.99,199.65,238.3,199.65,202.66C199.65,139.3,118.68,141,118.68,109.6C118.68,96.88,128.14,95.18,133.75,95.18C139.66,95.18,150.3,96.22,149.41,119.98Z"/></svg>`
const SB_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="m16.71.243l-.12 2.71a.18.18 0 0 0 .29.15l1.06-.8l.9.7a.18.18 0 0 0 .28-.14l-.1-2.76l1.33-.1a1.2 1.2 0 0 1 1.279 1.2v21.596a1.2 1.2 0 0 1-1.26 1.2l-16.096-.72a1.2 1.2 0 0 1-1.15-1.16l-.75-19.797a1.2 1.2 0 0 1 1.13-1.27L16.7.222zM13.64 9.3c0 .47 3.16.24 3.59-.08c0-3.2-1.72-4.89-4.859-4.89c-3.15 0-4.899 1.72-4.899 4.29c0 4.45 5.999 4.53 5.999 6.959c0 .7-.32 1.1-1.05 1.1c-.96 0-1.35-.49-1.3-2.16c0-.36-3.649-.48-3.769 0c-.27 4.03 2.23 5.2 5.099 5.2c2.79 0 4.969-1.49 4.969-4.18c0-4.77-6.099-4.64-6.099-6.999c0-.97.72-1.1 1.13-1.1c.45 0 1.25.07 1.19 1.87z"/></svg>`
const COVERAGE_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`
const TERMINAL_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>`
const CROSSHAIR_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`
const DOCS_TAB_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
const EYE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
const PLUS_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`
const BULLSEYE_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`

// ─── Types ──────────────────────────────────────────────────────────

interface CoverageEntry {
  componentName: string
  filePath: string
  relativeFilePath: string
  hasStory: boolean
  storyPath: string | null
}

interface CoverageData {
  entries: CoverageEntry[]
  totalComponents: number
  coveredComponents: number
  coveragePercent: number
}

// ─── Helpers ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function coverageColorClass(pct: number): string {
  if (pct >= 80) return 'green'
  if (pct >= 50) return 'yellow'
  if (pct >= 25) return 'orange'
  return 'red'
}

function openInEditor(filePath: string) {
  fetch(`/__open-in-editor?file=${encodeURIComponent(filePath)}`).catch(
    () => {},
  )
}

/** Get the storybookUrl from the query string (set by the server plugin) */
function getStorybookUrl(): string {
  const params = new URLSearchParams(window.location.search)
  return params.get('sbUrl') || 'http://localhost:6006'
}

// ─── Visit Story ────────────────────────────────────────────────────

interface StorybookIndexEntry {
  id: string
  title: string
  name: string
  importPath: string
  type: string
}

let storybookIndexCache: Record<string, StorybookIndexEntry> | null = null
let storybookIndexFetchedAt = 0

async function getStorybookIndex(): Promise<
  Record<string, StorybookIndexEntry>
> {
  // Cache for 30 seconds
  if (storybookIndexCache && Date.now() - storybookIndexFetchedAt < 30_000) {
    return storybookIndexCache
  }
  try {
    const res = await fetch('/__component-highlighter/storybook-index')
    const data = await res.json()
    storybookIndexCache = data.entries || {}
    storybookIndexFetchedAt = Date.now()
    return storybookIndexCache!
  } catch {
    return {}
  }
}

/**
 * Normalise a story name for loose comparison: lower-case and strip spaces.
 * Storybook derives display names from export names by inserting spaces
 * (e.g. export `TaskForm` → name `"Task Form"`).  When we want to match the
 * name we used during creation we normalise both sides so that
 * "Secondary" === "secondary", "Task Form" === "taskform", etc.
 */
function normaliseStoryName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '')
}

/**
 * Find a story ID by matching the component's relative file path against
 * Storybook index entries' importPath.
 *
 * When `preferredStoryName` is supplied the function first looks for a story
 * whose `name` matches (normalised); only if that fails does it fall back to
 * the first story found for the component file.
 */
async function findStoryId(
  relativeFilePath: string,
  preferredStoryName?: string,
): Promise<string | null> {
  const entries = await getStorybookIndex()
  if (!entries || Object.keys(entries).length === 0) return null

  // Strip leading ./ and file extension to get the component base path
  const stripExt = (p: string) =>
    p.replace(/^\.\//, '').replace(/\.(stories\.)?(tsx?|jsx?|mts|mjs)$/, '')

  const componentBase = stripExt(relativeFilePath)
  // Also extract just the filename without extension for fallback matching
  const componentName = componentBase.split('/').pop() || componentBase

  // Collect all candidate entries for this component file (preserving order)
  const candidates: StorybookIndexEntry[] = []

  for (const entry of Object.values(entries)) {
    if (entry.type !== 'story') continue
    const entryBase = stripExt(entry.importPath)
    if (entryBase === componentBase || entryBase.endsWith(componentName)) {
      candidates.push(entry)
    }
  }

  if (candidates.length === 0) return null

  // If the caller knows which story name was just created, prefer it
  if (preferredStoryName) {
    const needle = normaliseStoryName(preferredStoryName)
    const match = candidates.find((e) => normaliseStoryName(e.name) === needle)
    if (match) return match.id
  }

  // Fall back to the first candidate
  return candidates[0].id
}

/**
 * Build a Storybook URL for a specific story.
 * Returns null if no matching story is found.
 */
async function buildStoryUrl(
  relativeFilePath: string,
  preferredStoryName?: string,
): Promise<string | null> {
  const storyId = await findStoryId(relativeFilePath, preferredStoryName)
  if (!storyId) return null
  const sbUrl = getStorybookUrl()
  return `${sbUrl}/?path=/story/${encodeURIComponent(storyId)}&nav=0`
}

/**
 * Navigate to a story in the Storybook iframe.
 *
 * @param relativeFilePath - Component's relative file path.
 * @param preferredStoryName - Optional story name to prefer when multiple
 *   stories exist for the component (e.g. the name used during creation).
 *   When provided, the function will also retry index lookups with cache
 *   invalidation so that a story that was just written to disk is found even
 *   before Storybook's HMR cycle finishes.
 */
async function visitStory(
  relativeFilePath: string,
  preferredStoryName?: string,
) {
  const running = await checkStorybook()
  if (running) {
    // Fast path: Storybook is already running, index is available.
    // For newly created stories the index cache may be stale — bust it and
    // retry until the story appears (Storybook needs a moment to process HMR).
    const maxAttempts = preferredStoryName ? 20 : 1
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        // Bust the index cache so we re-fetch on the next iteration
        storybookIndexCache = null
        await new Promise((r) => setTimeout(r, 500))
      }
      const targetUrl = await buildStoryUrl(
        relativeFilePath,
        preferredStoryName,
      )
      if (targetUrl) {
        switchTab('storybook')
        navigateStorybookPane(targetUrl)
        return
      }
    }
    return
  }

  // Start Storybook, show terminal, then navigate once ready
  renderStorybookState('starting')
  try {
    await fetch('/__component-highlighter/start-storybook', { method: 'POST' })
  } catch {
    // Server may not support terminal start
  }

  showTerminalTab()
  switchTab('terminal')

  // Poll until Storybook is ready, then build the URL and navigate
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    const isRunning = await checkStorybook()
    if (isRunning) {
      clearInterval(poll)
      renderStorybookState('running')
      // Now that Storybook is up, the index is available
      const targetUrl = await buildStoryUrl(
        relativeFilePath,
        preferredStoryName,
      )
      if (targetUrl) {
        switchTab('storybook')
        navigateStorybookPane(targetUrl)
      }
    } else if (attempts > 120) {
      clearInterval(poll)
      renderStorybookState('not-running')
    }
  }, 1000)
}

/** Set the Storybook iframe to a given URL, creating it if needed. */
function navigateStorybookPane(targetUrl: string) {
  const pane = document.getElementById('pane-storybook')
  if (!pane) return

  const iframe = pane.querySelector<HTMLIFrameElement>('.sb-iframe')
  if (iframe) {
    iframe.src = targetUrl
  } else {
    pane.innerHTML = `<iframe class="sb-iframe" src="${esc(targetUrl)}"></iframe>`
  }
}

// Expose visitStory on the parent window so the context menu can call it directly.
try {
  ;(window.parent as any).__storybookDevtoolsVisitStory = (
    relativeFilePath: string,
    preferredStoryName?: string,
  ) => {
    visitStory(relativeFilePath, preferredStoryName)
  }
  // Also expose the URL builder so callers can fall back to window.open
  ;(window.parent as any).__storybookDevtoolsBuildStoryUrl = (
    relativeFilePath: string,
  ) => {
    return buildStoryUrl(relativeFilePath)
  }
} catch {
  // cross-origin
}

/** Remove all coverage highlight overlays from the parent page */
function clearAllHighlights() {
  try {
    const els = window.parent.document.querySelectorAll(
      '[data-coverage-highlight]',
    )
    els.forEach((el) => el.remove())
  } catch {
    // cross-origin or parent not available
  }
}

// ─── Tab management ─────────────────────────────────────────────────

type TabId = 'storybook' | 'coverage' | 'terminal' | 'docs'

let activeTab: TabId = 'storybook'
let coverageInterval: ReturnType<typeof setInterval> | null = null
let terminalInterval: ReturnType<typeof setInterval> | null = null
let terminalLogOffset = 0

// Terminal badge state
let terminalUnseenCount = 0
let terminalHasError = false
let highlightEnabled = false
let terminalTabVisible = false

function showTerminalTab() {
  if (terminalTabVisible) return
  terminalTabVisible = true
  const termTabBtn = document.querySelector(
    '.tab-btn[data-tab="terminal"]',
  ) as HTMLElement | null
  if (termTabBtn) termTabBtn.style.display = ''
}

const ERROR_PATTERN =
  /\b(error|ERR!|fail|fatal|exception|stack\s*trace|ENOENT|EACCES|TypeError|ReferenceError|SyntaxError|Cannot find|Unexpected token)\b/i

function updateTerminalBadge() {
  const badge = document.getElementById('terminal-badge')
  if (!badge) return

  if (activeTab === 'terminal' || terminalUnseenCount === 0) {
    badge.style.display = 'none'
    return
  }

  badge.style.display = 'inline-flex'
  badge.textContent =
    terminalUnseenCount > 99 ? '99+' : String(terminalUnseenCount)
  badge.className = `tab-badge ${terminalHasError ? 'error' : 'info'}`
}

function clearTerminalBadge() {
  terminalUnseenCount = 0
  terminalHasError = false
  updateTerminalBadge()
}

function switchTab(tab: TabId) {
  activeTab = tab
  clearAllHighlights()

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tab)
  })

  // Update tab panes
  document.querySelectorAll('.tab-pane').forEach((pane) => {
    pane.classList.toggle('active', pane.id === `pane-${tab}`)
  })

  // Start/stop coverage polling
  if (tab === 'coverage') {
    refreshCoverage()
    if (!coverageInterval) {
      coverageInterval = setInterval(refreshCoverage, 5000)
    }
  } else {
    if (coverageInterval) {
      clearInterval(coverageInterval)
      coverageInterval = null
    }
  }

  // Start/stop terminal polling
  if (tab === 'terminal') {
    clearTerminalBadge()
    pollTerminalLogs()
    if (!terminalInterval) {
      terminalInterval = setInterval(pollTerminalLogs, 1000)
    }
  } else {
    if (terminalInterval) {
      clearInterval(terminalInterval)
      terminalInterval = null
    }
  }
}

// ─── Storybook tab ──────────────────────────────────────────────────

type SbState = 'checking' | 'not-running' | 'starting' | 'running'

function renderStorybookState(state: SbState) {
  const pane = document.getElementById('pane-storybook')
  if (!pane) return

  const sbUrl = getStorybookUrl()

  switch (state) {
    case 'checking':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="spinner"></div>
          <div class="msg">Checking if Storybook is running\u2026</div>
        </div>`
      break

    case 'not-running':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="msg">Storybook is not running at <strong>${esc(sbUrl)}</strong></div>
          <button class="start-btn" id="sb-start-btn">Start Storybook</button>
        </div>`
      document
        .getElementById('sb-start-btn')
        ?.addEventListener('click', startStorybook)
      break

    case 'starting':
      pane.innerHTML = `
        <div class="sb-state">
          <div class="spinner"></div>
          <div class="msg">Starting Storybook\u2026</div>
        </div>`
      break

    case 'running':
      pane.innerHTML = `<iframe class="sb-iframe" src="${esc(sbUrl)}"></iframe>`
      break
  }
}

async function checkStorybook(): Promise<boolean> {
  try {
    const res = await fetch('/__component-highlighter/storybook-status')
    const data = await res.json()
    return data.running === true
  } catch {
    return false
  }
}

async function initStorybookTab() {
  renderStorybookState('checking')
  const running = await checkStorybook()
  renderStorybookState(running ? 'running' : 'not-running')
}

async function startStorybook() {
  renderStorybookState('starting')

  try {
    await fetch('/__component-highlighter/start-storybook', { method: 'POST' })
  } catch {
    // Server may not support terminal start; fall through to polling
  }

  // Show and switch to the terminal tab so the user can watch the logs
  showTerminalTab()
  switchTab('terminal')

  // Poll until Storybook is ready (max ~120s)
  let attempts = 0
  const poll = setInterval(async () => {
    attempts++
    const running = await checkStorybook()
    if (running) {
      clearInterval(poll)
      renderStorybookState('running')
      // Auto-switch back to the Storybook tab once it's up
      switchTab('storybook')
    } else if (attempts > 120) {
      clearInterval(poll)
      renderStorybookState('not-running')
    }
  }, 1000)
}

// ─── Story creation from coverage ───────────────────────────────────

/**
 * Build a fingerprint string for serialized props, ignoring functions and JSX.
 * Used to deduplicate component instances that represent the same variant.
 */
function propsFingerprint(props: Record<string, unknown>): string {
  const meaningful: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value && typeof value === 'object') {
      const v = value as Record<string, unknown>
      if (v.__isFunction || v.__isJSX) continue
    }
    if (typeof value === 'function') continue
    meaningful[key] = value
  }
  return JSON.stringify(meaningful, Object.keys(meaningful).sort())
}

/**
 * Collect unique instances of a component from the live registry,
 * deduplicated by their serialized props fingerprint.
 * Matches by filePath since coverage uses the filename as componentName
 * which may differ from the actual component display name in the registry.
 */
function collectUniqueInstances(filePath: string): any[] {
  try {
    const registry = (window.parent as any).__componentHighlighterRegistry as
      | Map<string, any>
      | undefined
    if (!registry) return []

    const seen = new Map<string, any>()
    for (const instance of registry.values()) {
      if (instance.meta?.filePath !== filePath) continue
      const sp = instance.serializedProps
      const fp = sp ? propsFingerprint(sp) : '{}'
      if (!seen.has(fp)) {
        seen.set(fp, instance)
      }
    }
    return Array.from(seen.values())
  } catch {
    return []
  }
}

/**
 * Collect all unique instances currently visible in the registry across ALL
 * components. Deduplicates globally by (filePath + propsFingerprint) so that
 * two mounts of the same component with identical props produce a single entry.
 */
function collectAllVisibleInstances(): any[] {
  try {
    const registry = (window.parent as any).__componentHighlighterRegistry as
      | Map<string, any>
      | undefined
    if (!registry) return []

    const seen = new Map<string, any>()
    for (const instance of registry.values()) {
      const filePath = instance.meta?.filePath
      if (!filePath) continue
      const sp = instance.serializedProps
      const fp = sp ? propsFingerprint(sp) : '{}'
      const key = `${filePath}::${fp}`
      if (!seen.has(key)) {
        seen.set(key, instance)
      }
    }
    return Array.from(seen.values())
  } catch {
    return []
  }
}

/**
 * Create stories for a component by delegating to the client overlay's
 * story creation flow (same RPC path as the context menu "Save Story").
 * Finds all live instances, deduplicates by props, and creates one story
 * per unique variant.
 */
function createStoryForComponent(filePath: string): boolean {
  const createFn = (window.parent as any).__componentHighlighterCreateStory
  if (typeof createFn !== 'function') return false

  const instances = collectUniqueInstances(filePath)
  if (instances.length === 0) return false

  for (const instance of instances) {
    createFn({
      meta: instance.meta,
      props: instance.props,
      serializedProps: instance.serializedProps,
    })
  }
  return true
}

/**
 * Check whether a component is currently rendered (has live instances in the
 * registry). A component is considered rendered if at least one instance with a
 * matching filePath exists — regardless of dimensions or CSS visibility.
 * Components that return null or are never mounted won't be in the registry at all.
 */
function isComponentVisible(filePath: string): boolean {
  try {
    const registry = (window.parent as any).__componentHighlighterRegistry as
      | Map<string, any>
      | undefined
    if (!registry) return false
    for (const instance of registry.values()) {
      if (instance.meta?.filePath === filePath) return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Coverage tab ───────────────────────────────────────────────────

let lastCoverageJson = ''
let lastVisibilityKey = ''

async function fetchCoverage(): Promise<CoverageData | null> {
  try {
    const res = await fetch('/__component-highlighter/coverage')
    return await res.json()
  } catch {
    return null
  }
}

/** Build a string key representing which file paths are currently visible. */
function computeVisibilityKey(entries: CoverageEntry[]): string {
  return entries
    .map((e) => `${e.filePath}:${isComponentVisible(e.filePath) ? '1' : '0'}`)
    .join('|')
}

async function refreshCoverage() {
  const coverage = await fetchCoverage()
  if (!coverage) return

  // Rebuild when either server-side coverage data or client-side visibility changes
  const json = JSON.stringify(coverage)
  const visKey = computeVisibilityKey(coverage.entries)
  if (json === lastCoverageJson && visKey === lastVisibilityKey) return
  lastCoverageJson = json
  lastVisibilityKey = visKey

  clearAllHighlights()
  buildCoveragePanel(coverage)
}

function buildCoveragePanel(coverage: CoverageData) {
  const pane = document.getElementById('pane-coverage')
  if (!pane) return

  const root = document.createElement('div')
  root.className = 'coverage-root'

  // Header
  const hdr = document.createElement('div')
  hdr.className = 'cov-hdr'

  const title = document.createElement('h2')
  title.textContent = 'Story Coverage (in this page)'
  hdr.appendChild(title)

  const pct = document.createElement('span')
  const cc = coverageColorClass(coverage.coveragePercent)
  pct.className = `pct ${cc}`
  pct.textContent = `${coverage.coveragePercent}%`
  hdr.appendChild(pct)

  root.appendChild(hdr)

  // Progress bar
  const pw = document.createElement('div')
  pw.className = 'progress-wrap'

  const pl = document.createElement('div')
  pl.className = 'progress-label'
  pl.textContent = `${coverage.coveredComponents} of ${coverage.totalComponents} components have story files`
  pw.appendChild(pl)

  const barRow = document.createElement('div')
  barRow.className = 'progress-row'

  const bar = document.createElement('div')
  bar.className = 'progress-bar'
  const fill = document.createElement('div')
  fill.className = `progress-fill ${cc}`
  fill.style.width = `${coverage.coveragePercent}%`
  bar.appendChild(fill)
  barRow.appendChild(bar)

  // "Create all" button — creates stories for every visible instance on screen,
  // deduplicated by (filePath + props fingerprint) so identical mounts are skipped.
  const allVisibleInstances = collectAllVisibleInstances()
  if (allVisibleInstances.length > 0) {
    const createAllBtn = document.createElement('button')
    createAllBtn.className = 'create-all-btn'
    createAllBtn.textContent = `Create all (${allVisibleInstances.length})`
    createAllBtn.title = `Create stories for ${allVisibleInstances.length} visible component instance${allVisibleInstances.length === 1 ? '' : 's'} on screen`
    createAllBtn.addEventListener('click', () => {
      createAllBtn.disabled = true
      createAllBtn.textContent = 'Creating\u2026'
      const createFn = (window.parent as any).__componentHighlighterCreateStory
      if (typeof createFn === 'function') {
        for (const instance of allVisibleInstances) {
          createFn({
            meta: instance.meta,
            props: instance.props,
            serializedProps: instance.serializedProps,
          })
        }
      }
      // Wait for the RPC story creation to complete, then refresh
      setTimeout(() => {
        lastCoverageJson = ''
        refreshCoverage()
      }, 1500)
    })
    barRow.appendChild(createAllBtn)
  }

  pw.appendChild(barRow)
  root.appendChild(pw)

  // Table
  if (coverage.entries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent =
      'No components detected yet. Navigate your app to discover components.'
    root.appendChild(empty)
    pane.innerHTML = ''
    pane.appendChild(root)
    return
  }

  const wrap = document.createElement('div')
  wrap.className = 'table-wrap'

  const table = document.createElement('table')
  const thead = document.createElement('thead')
  thead.innerHTML = `<tr><th>Component</th><th>Status</th><th>Actions</th></tr>`
  table.appendChild(thead)

  const tbody = document.createElement('tbody')

  // Track highlight overlays for cleanup
  let activeHighlights: HTMLDivElement[] = []

  const clearHighlights = () => {
    for (const h of activeHighlights) h.remove()
    activeHighlights = []
  }

  const highlightInstances = (componentName: string, hasStory: boolean) => {
    clearHighlights()
    try {
      const registry = (window.parent as any)
        .__componentHighlighterRegistry as
        | Map<string, { meta: { componentName: string }; element?: Element }>
        | undefined
      if (!registry) return
      const color = hasStory ? '#22c55e' : '#ef4444'
      for (const instance of registry.values()) {
        if (
          instance.meta.componentName === componentName &&
          instance.element?.isConnected &&
          instance.element.nodeType === Node.ELEMENT_NODE
        ) {
          const rect = instance.element.getBoundingClientRect()
          const box = window.parent.document.createElement('div')
          box.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            outline: 2px solid ${color};
            outline-offset: -1px;
            background: ${color}22;
            pointer-events: none;
            z-index: 999999;
            transition: opacity 0.2s ease;
            border-radius: 2px;
          `
          box.setAttribute('data-coverage-highlight', 'true')
          window.parent.document.body.appendChild(box)
          activeHighlights.push(box)
        }
      }
    } catch { /* cross-origin */ }
  }

  for (const entry of coverage.entries) {
    const visible = isComponentVisible(entry.filePath)
    const tr = document.createElement('tr')
    tr.className = `row ${entry.hasStory ? 'covered' : 'uncovered'}${!visible ? ' invisible' : ''}`

    // Component name + file
    const tdName = document.createElement('td')
    tdName.innerHTML = `
      <div class="comp-name">${esc(entry.componentName)}</div>
      <div class="comp-file" title="${esc(entry.relativeFilePath)}">${esc(entry.relativeFilePath)}</div>
    `
    tr.appendChild(tdName)

    // Status badge
    const tdStatus = document.createElement('td')
    if (entry.hasStory) {
      tdStatus.innerHTML = `<span class="status covered"><span class="status-dot"></span>Covered</span>`
    } else if (!visible) {
      tdStatus.innerHTML = `<span class="status not-visible"><span class="status-dot"></span>Not visible</span>`
    } else {
      tdStatus.innerHTML = `<span class="status missing"><span class="status-dot"></span>Missing</span>`
    }
    tr.appendChild(tdStatus)

    // Action buttons
    const tdActions = document.createElement('td')
    const actionsDiv = document.createElement('div')
    actionsDiv.className = 'actions'

    // Scroll to component button
    const locateBtn = document.createElement('button')
    locateBtn.className = 'act-btn locate'
    locateBtn.innerHTML = BULLSEYE_ICON
    if (!visible) {
      locateBtn.title = 'Component not visible on this page'
      locateBtn.setAttribute('disabled', '')
    } else {
      locateBtn.title = 'Scroll to component'
      locateBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        try {
          const registry = (window.parent as any)
            .__componentHighlighterRegistry as
            | Map<string, { meta: { componentName: string }; element?: Element }>
            | undefined
          if (!registry) return
          for (const instance of registry.values()) {
            if (
              instance.meta.componentName === entry.componentName &&
              instance.element?.isConnected
            ) {
              // Clear stale highlights before scrolling
              clearHighlights()
              instance.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
              // Re-highlight once scroll finishes so boxes match new viewport positions
              window.parent.addEventListener('scrollend', () => {
                highlightInstances(entry.componentName, entry.hasStory)
              }, { once: true })
              break
            }
          }
        } catch { /* cross-origin */ }
      })
    }
    actionsDiv.appendChild(locateBtn)

    // Open code button
    const codeBtn = document.createElement('button')
    codeBtn.className = 'act-btn'
    codeBtn.innerHTML = CODE_ICON
    codeBtn.title = 'Open component file'
    codeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      openInEditor(entry.filePath)
    })
    actionsDiv.appendChild(codeBtn)

    // Open story button
    const storyBtn = document.createElement('button')
    storyBtn.className = 'act-btn sb'
    storyBtn.innerHTML = SB_ICON_SMALL
    storyBtn.title = entry.hasStory ? 'Open story file' : 'No story file'
    if (!entry.hasStory || !entry.storyPath) {
      storyBtn.setAttribute('disabled', '')
    } else {
      const sp = entry.storyPath
      storyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        openInEditor(sp)
      })
    }
    actionsDiv.appendChild(storyBtn)

    // Visit story in Storybook button
    const visitBtn = document.createElement('button')
    visitBtn.className = 'act-btn visit'
    visitBtn.innerHTML = EYE_ICON
    visitBtn.title = entry.hasStory
      ? 'View story in Storybook'
      : 'No story to view'
    if (!entry.hasStory) {
      visitBtn.setAttribute('disabled', '')
    } else {
      const rp = entry.relativeFilePath
      visitBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        visitStory(rp)
      })
    }
    actionsDiv.appendChild(visitBtn)

    // Create story button (only for uncovered components)
    if (!entry.hasStory) {
      const createBtn = document.createElement('button')
      createBtn.className = 'act-btn create'
      createBtn.innerHTML = PLUS_ICON
      if (!visible) {
        createBtn.title =
          'Component not visible — navigate to a page where it renders first'
        createBtn.setAttribute('disabled', '')
      } else {
        createBtn.title = 'Create story from current props'
        createBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          createBtn.disabled = true
          createBtn.style.opacity = '0.5'
          const created = createStoryForComponent(entry.filePath)
          if (created) {
            // Wait for the RPC story creation to complete, then refresh
            setTimeout(() => {
              lastCoverageJson = ''
              refreshCoverage()
            }, 1500)
          } else {
            createBtn.disabled = false
            createBtn.style.opacity = ''
          }
        })
      }
      actionsDiv.appendChild(createBtn)
    }

    tdActions.appendChild(actionsDiv)
    tr.appendChild(tdActions)

    // Hover → highlight matching component instances on the parent page
    tr.addEventListener('mouseenter', () => {
      highlightInstances(entry.componentName, entry.hasStory)
    })

    tr.addEventListener('mouseleave', clearHighlights)

    tbody.appendChild(tr)
  }

  table.appendChild(tbody)
  wrap.appendChild(table)
  root.appendChild(wrap)

  pane.innerHTML = ''
  pane.appendChild(root)
}

// ─── Terminal tab ───────────────────────────────────────────────────

/** Strip ANSI escape codes for plain-text display */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

async function pollTerminalLogs() {
  try {
    const res = await fetch(
      `/__component-highlighter/terminal-logs?since=${terminalLogOffset}`,
    )
    const data: { lines: string[]; total: number } = await res.json()

    if (data.lines.length > 0) {
      terminalLogOffset = data.total

      // Track unseen lines and errors for the badge (when not on terminal tab)
      if (activeTab !== 'terminal') {
        terminalUnseenCount += data.lines.length
        if (!terminalHasError) {
          for (const line of data.lines) {
            if (ERROR_PATTERN.test(stripAnsi(line))) {
              terminalHasError = true
              break
            }
          }
        }
        updateTerminalBadge()
      }

      const output = document.getElementById('terminal-output')
      if (!output) return

      for (const line of data.lines) {
        const div = document.createElement('div')
        const stripped = stripAnsi(line)
        div.className = 'term-line'
        if (ERROR_PATTERN.test(stripped)) {
          div.classList.add('term-error')
        }
        div.textContent = stripped
        output.appendChild(div)
      }

      // Auto-scroll to bottom
      output.scrollTop = output.scrollHeight
    }
  } catch {
    // endpoint not ready yet
  }
}

/** Background poller — runs always so terminal badge stays updated even when on other tabs */
let bgTerminalInterval: ReturnType<typeof setInterval> | null = null

function startBackgroundTerminalPoller() {
  if (bgTerminalInterval) return
  bgTerminalInterval = setInterval(() => {
    // Only poll in background when we're NOT on the terminal tab
    // (the terminal tab has its own faster poller)
    if (activeTab !== 'terminal') {
      pollTerminalLogs()
    }
  }, 2000)
}

// ─── Bootstrap ──────────────────────────────────────────────────────

function init() {
  const app = document.getElementById('app')!

  app.style.display = 'flex'
  app.style.flexDirection = 'column'
  app.style.height = '100%'

  // Tab bar
  const tabBar = document.createElement('div')
  tabBar.className = 'tab-bar'

  const sbTab = document.createElement('button')
  sbTab.className = 'tab-btn active'
  sbTab.setAttribute('data-tab', 'storybook')
  sbTab.innerHTML = `${SB_TAB_ICON} Storybook`
  sbTab.addEventListener('click', () => switchTab('storybook'))

  const covTab = document.createElement('button')
  covTab.className = 'tab-btn'
  covTab.setAttribute('data-tab', 'coverage')
  covTab.innerHTML = `${COVERAGE_TAB_ICON} Coverage`
  covTab.addEventListener('click', () => switchTab('coverage'))

  const termTab = document.createElement('button')
  termTab.className = 'tab-btn'
  termTab.setAttribute('data-tab', 'terminal')
  termTab.style.display = 'none' // Hidden until "Start Storybook" is clicked
  termTab.innerHTML = `${TERMINAL_TAB_ICON} Terminal <span id="terminal-badge" class="tab-badge" style="display:none"></span>`
  termTab.addEventListener('click', () => switchTab('terminal'))

  // Spacer pushes highlight button to the right
  const spacer = document.createElement('div')
  spacer.style.flex = '1'

  // Highlight toggle button
  const highlightBtn = document.createElement('button')
  highlightBtn.className = 'highlight-toggle-btn'
  highlightBtn.id = 'highlight-toggle'
  highlightBtn.innerHTML = `${CROSSHAIR_ICON}`
  highlightBtn.title = 'Toggle component highlight mode'
  highlightBtn.addEventListener('click', () => {
    try {
      const parentWin = window.parent as any
      if (highlightEnabled) {
        parentWin.__componentHighlighterDisable?.()
        highlightEnabled = false
      } else {
        parentWin.__componentHighlighterEnable?.()
        highlightEnabled = true
      }
      highlightBtn.classList.toggle('active', highlightEnabled)
    } catch {
      // cross-origin or parent not available
    }
  })

  // Sync initial state from parent
  try {
    const parentWin = window.parent as any
    if (parentWin.__componentHighlighterIsActive?.()) {
      highlightEnabled = true
      highlightBtn.classList.add('active')
    }
  } catch {
    // cross-origin or parent not available
  }

  const docsTab = document.createElement('button')
  docsTab.className = 'tab-btn'
  docsTab.setAttribute('data-tab', 'docs')
  docsTab.innerHTML = `${DOCS_TAB_ICON} Docs`
  docsTab.addEventListener('click', () => switchTab('docs'))

  tabBar.appendChild(sbTab)
  tabBar.appendChild(covTab)
  tabBar.appendChild(termTab)
  tabBar.appendChild(docsTab)
  tabBar.appendChild(spacer)
  tabBar.appendChild(highlightBtn)
  app.appendChild(tabBar)

  // Tab content
  const content = document.createElement('div')
  content.className = 'tab-content'

  const sbPane = document.createElement('div')
  sbPane.className = 'tab-pane active'
  sbPane.id = 'pane-storybook'

  const covPane = document.createElement('div')
  covPane.className = 'tab-pane'
  covPane.id = 'pane-coverage'
  covPane.innerHTML =
    '<div class="coverage-root"><div class="empty">Loading coverage data\u2026</div></div>'

  const termPane = document.createElement('div')
  termPane.className = 'tab-pane'
  termPane.id = 'pane-terminal'
  termPane.innerHTML = `
    <div class="terminal-root">
      <div class="term-header">
        <span>Storybook Terminal Output</span>
        <button class="term-clear-btn" id="term-clear-btn">Clear</button>
      </div>
      <div class="term-output" id="terminal-output"></div>
    </div>`

  const docsPane = document.createElement('div')
  docsPane.className = 'tab-pane'
  docsPane.id = 'pane-docs'
  docsPane.innerHTML =
    '<iframe class="sb-iframe" src="https://storybook.js.org/docs"></iframe>'

  content.appendChild(sbPane)
  content.appendChild(covPane)
  content.appendChild(termPane)
  content.appendChild(docsPane)
  app.appendChild(content)

  // Wire up the clear button after DOM is ready
  document.getElementById('term-clear-btn')?.addEventListener('click', () => {
    const output = document.getElementById('terminal-output')
    if (output) output.innerHTML = ''
  })

  // Init storybook tab
  initStorybookTab()

  // Start background terminal poller for badge updates
  startBackgroundTerminalPoller()

  // Clean up highlights when the panel iframe is hidden or unloaded
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearAllHighlights()
  })
  window.addEventListener('pagehide', clearAllHighlights)
  window.addEventListener('beforeunload', clearAllHighlights)
}

init()
