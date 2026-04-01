/**
 * Context menu (tooltip) for the component highlighter overlay.
 *
 * Rendered inside a Shadow DOM so the host app's styles can never leak in
 * and our styles can never leak out.
 */
import type { ComponentInstance, SerializedProps } from '../frameworks/types'
import { debug } from './logger'
import { UI_MARKER, isCurrentlyRecording } from './interaction-recorder'

// ─── Storybook logo SVG (pink) ──────────────────────────────────────────────
const SB_ICON = `<svg width="16" height="16" viewBox="-31.5 0 319 319" xmlns="http://www.w3.org/2000/svg">
  <path fill="#FF4785" d="M9.87,293.32L0.01,30.57C-0.31,21.9,6.34,14.54,15.01,14L238.49,0.03C247.32,-0.52,254.91,6.18,255.47,15.01C255.49,15.34,255.5,15.67,255.5,16V302.32C255.5,311.16,248.33,318.32,239.49,318.32C239.25,318.32,239.01,318.32,238.77,318.31L25.15,308.71C16.83,308.34,10.18,301.65,9.87,293.32Z"/>
  <path fill="#FFF" d="M188.67,39.13L190.19,2.41L220.88,0L222.21,37.86C222.25,39.18,221.22,40.29,219.9,40.33C219.34,40.35,218.79,40.17,218.34,39.82L206.51,30.5L192.49,41.13C191.44,41.93,189.95,41.72,189.15,40.67C188.81,40.23,188.64,39.68,188.67,39.13ZM149.41,119.98C149.41,126.21,191.36,123.22,196.99,118.85C196.99,76.45,174.23,54.17,132.57,54.17C90.91,54.17,67.57,76.79,67.57,110.74C67.57,169.85,147.35,170.98,147.35,203.23C147.35,212.28,142.91,217.65,133.16,217.65C120.46,217.65,115.43,211.17,116.02,189.1C116.02,184.32,67.57,182.82,66.09,189.1C62.33,242.57,95.64,257.99,133.75,257.99C170.69,257.99,199.65,238.3,199.65,202.66C199.65,139.3,118.68,141,118.68,109.6C118.68,96.88,128.14,95.18,133.75,95.18C139.66,95.18,150.3,96.22,149.41,119.98Z"/>
</svg>`

const CODE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`
const EYE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
const COPY_PROMPT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`

// ─── Stylesheet (injected into the shadow root) ────────────────────────────
const STYLES = /* css */ `
  :host {
    all: initial;
    display: block;
    pointer-events: none;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .panel {
    position: fixed;
    pointer-events: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    color: #e2e8f0;
    line-height: 1.4;
    background: rgba(15, 17, 22, 0.58);
    backdrop-filter: blur(32px) saturate(180%);
    -webkit-backdrop-filter: blur(32px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    width: 400px;
    max-width: 400px;
    box-shadow:
      0 24px 48px rgba(0, 0, 0, 0.45),
      0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  }

  .panel-body {
    padding: 16px 18px;
  }

  /* ── Breadcrumb ────────────────────────── */
  .breadcrumb-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 6px;
    min-width: 0;
  }
  .breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 2px;
    font-size: 12px;
    color: #8892a4;
    overflow: hidden;
    white-space: nowrap;
    font-family: inherit;
    min-width: 0;
    flex: 1;
  }
  .breadcrumb span {
    flex-shrink: 0;
  }
  .breadcrumb .sep {
    color: #5a6478;
    font-size: 10px;
    margin: 0 1px;
  }
  .breadcrumb .file {
    color: #a0aec0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .breadcrumb-copy {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: 4px;
    width: 18px;
    height: 18px;
    padding: 0;
    background: none;
    border: none;
    color: #5a6478;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
    pointer-events: none;
    border-radius: 3px;
  }
  .breadcrumb:hover .breadcrumb-copy {
    opacity: 1;
    pointer-events: auto;
  }
  .breadcrumb-copy:hover {
    color: #e2e8f0;
    background: rgba(255,255,255,0.08);
  }
  .breadcrumb-copy.copied {
    color: #a5d6a7;
  }

  /* ── Header row ────────────────────────── */
  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 16px;
  }
  .component-name {
    font-size: 24px;
    font-weight: 700;
    color: #f1f5f9;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
    padding-top: 4px;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .action-btn-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: #e2e8f0;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  }
  .icon-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
  }
  .icon-btn[disabled] {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .icon-btn[disabled]:hover {
    background: rgba(255, 255, 255, 0.06);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  }
  .icon-btn.sb-btn {
    color: #FF4785;
  }
  .icon-btn.sb-btn:hover:not([disabled]) {
    background: rgba(255, 71, 133, 0.1);
  }
  .icon-btn.view-btn {
    color: #3b82f6;
  }
  .icon-btn.view-btn:hover:not([disabled]) {
    background: rgba(59, 130, 246, 0.1);
  }
  .icon-btn.copy-prompt-btn {
    color: #a78bfa;
  }
  .icon-btn.copy-prompt-btn:hover:not([disabled]) {
    background: rgba(167, 139, 250, 0.1);
  }
  .icon-btn.copy-prompt-btn.copied {
    color: #a5d6a7;
  }
  .action-label {
    font-size: 9px;
    color: #cbd5e1;
    text-align: center;
    line-height: 1.1;
    white-space: nowrap;
  }
  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: #64748b;
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
    flex-shrink: 0;
  }
  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #e2e8f0;
  }

  /* ── Properties section ────────────────── */
  .props-section {
    margin-bottom: 4px;
  }
  .props-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .props-title {
    font-weight: 600;
    font-size: 14px;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .props-count {
    font-weight: 400;
    color: #64748b;
    font-size: 12px;
  }
  .collapse-btn {
    background: none;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: #94a3b8;
    cursor: pointer;
    padding: 3px 10px;
    font-size: 11px;
    transition: all 0.15s ease;
    font-family: inherit;
  }
  .collapse-btn:hover {
    background: rgba(255,255,255,0.06);
    color: #e2e8f0;
  }

  /* ── Props grid (scrollable 2-column table) ─── */
  .props-table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px;
    max-height: 200px;
    overflow-y: auto;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
  }
  .props-table::-webkit-scrollbar {
    width: 4px;
  }
  .props-table::-webkit-scrollbar-track {
    background: transparent;
  }
  .props-table::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15);
    border-radius: 2px;
  }
  .prop-key {
    padding: 6px 12px;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 13px;
    color: #94a3b8;
    white-space: nowrap;
    background: rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
  }
  .prop-val {
    padding: 5px 8px;
    background: rgba(0, 0, 0, 0.08);
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    position: relative;
  }
  .prop-copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-left: auto;
    width: 22px;
    height: 22px;
    padding: 0;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: #64748b;
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
    pointer-events: none;
  }
  .prop-val:hover .prop-copy-btn {
    opacity: 1;
    pointer-events: auto;
  }
  .prop-copy-btn:hover {
    background: rgba(255,255,255,0.14);
    color: #e2e8f0;
  }
  .prop-copy-btn.copied {
    color: #a5d6a7;
    border-color: rgba(165, 214, 167, 0.3);
  }

  /* ── Value badge (the colored chip) ──── */
  .badge {
    display: inline-block;
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    vertical-align: middle;
  }
  .badge.str {
    background: rgba(26, 58, 42, 0.7);
    color: #a5d6a7;
  }
  .badge.num {
    background: rgba(26, 42, 58, 0.7);
    color: #90caf9;
  }
  .badge.bool {
    background: rgba(42, 26, 58, 0.7);
    color: #ce93d8;
  }
  .badge.fn {
    background: rgba(58, 42, 26, 0.7);
    color: #fbbf24;
  }
  .badge.jsx {
    background: rgba(30, 58, 95, 0.7);
    color: #93c5fd;
  }
  .badge.slot {
    background: rgba(6, 78, 59, 0.7);
    color: #6ee7b7;
  }
  .badge.obj {
    background: rgba(139, 92, 246, 0.15);
    color: #c4b5fd;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .badge.obj:hover {
    background: rgba(139, 92, 246, 0.25);
  }
  .badge.null {
    background: rgba(255, 255, 255, 0.04);
    color: #78909c;
    font-style: italic;
  }

  /* ── Object viewer popover ─────────────── */
  .obj-popover {
    position: fixed;
    min-width: 260px;
    max-width: 360px;
    background: rgba(15, 17, 22, 0.8);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    z-index: 100;
    box-shadow: 0 16px 40px rgba(0,0,0,0.55);
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
    font-size: 12px;
    line-height: 1.6;
    overflow: hidden;
    pointer-events: auto;
  }
  .obj-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .obj-popover-header .obj-title {
    font-weight: 600;
    color: #e2e8f0;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    color: #94a3b8;
    cursor: pointer;
    padding: 3px 8px;
    font-size: 11px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: all 0.15s ease;
  }
  .copy-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #e2e8f0;
  }
  .copy-btn.copied {
    color: #a5d6a7;
    border-color: rgba(165, 214, 167, 0.3);
  }
  .obj-popover-body {
    max-height: 260px;
    overflow-y: auto;
    padding: 10px 14px 12px;
  }
  .obj-popover-body::-webkit-scrollbar {
    width: 4px;
  }
  .obj-popover-body::-webkit-scrollbar-thumb {
    background: rgba(255,255,255,0.15);
    border-radius: 2px;
  }
  .obj-tree-key { color: #93c5fd; }
  .obj-tree-str { color: #a5d6a7; }
  .obj-tree-num { color: #90caf9; }
  .obj-tree-bool { color: #ce93d8; }
  .obj-tree-null { color: #78909c; font-style: italic; }
  .obj-tree-punct { color: #94a3b8; }
  .obj-tree-toggle {
    cursor: pointer;
    user-select: none;
  }
  .obj-tree-toggle:hover {
    color: #bfdbfe;
  }

  /* ── Divider ───────────────────────────── */
  .divider {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 14px 0;
  }

  /* ── Recording warning ─────────────────── */
  .recording-warning {
    color: #f87171;
    font-size: 11px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .recording-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #ef4444;
    flex-shrink: 0;
    animation: blink 1s step-start infinite;
  }
  @keyframes blink {
    50% { opacity: 0.2; }
  }

  /* ── Create Story section ──────────────── */
  .create-story-title {
    font-weight: 600;
    font-size: 14px;
    color: #cbd5e1;
    margin-bottom: 12px;
  }
  .story-input-wrapper {
    position: relative;
    margin-bottom: 14px;
  }
  .story-input {
    width: 100%;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #e2e8f0;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .story-input:focus {
    border-color: rgba(168, 85, 247, 0.5);
    box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.15);
  }
  .story-input::placeholder {
    color: #475569;
  }
  .story-label {
    position: absolute;
    top: -9px;
    left: 10px;
    background: rgba(15, 17, 22, 0.85);
    padding: 1px 6px;
    font-size: 11px;
    color: #a78bfa;
    letter-spacing: 0.02em;
    line-height: 1.3;
    pointer-events: none;
    z-index: 1;
    border-radius: 2px;
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }
  .btn {
    flex: 1;
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: inherit;
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-save {
    background: linear-gradient(135deg, #FF4785, #e73370);
    color: white;
  }
  .btn-save:hover:not(:disabled) {
    background: linear-gradient(135deg, #ff5a94, #FF4785);
    box-shadow: 0 4px 12px rgba(255, 71, 133, 0.3);
  }
  .btn-save.success {
    background: linear-gradient(135deg, #22c55e, #16a34a);
  }
  .btn-save.error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }
  .btn-interactions {
    background: linear-gradient(135deg, #a855f7, #7c3aed);
    color: white;
  }
  .btn-interactions:hover:not(:disabled) {
    background: linear-gradient(135deg, #b87afc, #a855f7);
    box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3);
  }

  /* ── Empty state ───────────────────────── */
  .empty-props {
    color: #475569;
    font-size: 12px;
    padding: 4px 0;
    font-style: italic;
  }
`

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Turn a file path into breadcrumb segments. */
function toBreadcrumbs(relPath: string): string {
  const parts = relPath.replace(/\\/g, '/').split('/')
  if (parts.length > 4) {
    const first = parts[0]
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

/** Classify a prop value for badge rendering. */
function classifyProp(
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

function renderObjectTree(obj: unknown, depth = 0, maxDepth = 6): string {
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

// ─── LLM prompt builder ─────────────────────────────────────────────────────

function buildLLMPrompt(
  instance: ComponentInstance,
  hasStory: boolean,
  storyPath: string | null,
): string {
  const { componentName, filePath, relativeFilePath } = instance.meta
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

  const hasProps = Object.keys(meaningfulProps).length > 0
  const propsBlock = hasProps
    ? '```json\n' + JSON.stringify(meaningfulProps, null, 2) + '\n```'
    : '*(none)*'

  const storyLine =
    hasStory && storyPath
      ? `It has an existing Storybook story at \`${storyPath}\`.`
      : `It doesn't have a Storybook story yet.`

  return [
    `I'm working on the \`${componentName}\` component located at \`${relativePath}\`.`,
    '',
    `**Current props:**`,
    propsBlock,
    '',
    storyLine,
  ].join('\n')
}

// ─── Suggest a story name from props ────────────────────────────────────────

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

// ─── Public interface ───────────────────────────────────────────────────────

export interface ContextMenuCallbacks {
  openInEditor: (filePath: string) => void
  isOpenInEditorAvailable: () => Promise<boolean>
  onSaveStory: (storyName: string) => void
  onSaveStoryWithInteractions: (storyName: string) => void
  onClose: () => void
  visitStory?: (relativeFilePath: string) => void | Promise<void>
}

export interface ContextMenuHandle {
  host: HTMLDivElement
  showSaveFeedback: (status: 'success' | 'error') => void
  enableGoToStory: (storyPath: string) => void
  enableViewStory: () => void
  destroy: () => void
}

/**
 * Create and show a context menu anchored at (x, y).
 * Rendering is fully encapsulated in a Shadow DOM.
 */
export function createContextMenu(
  instance: ComponentInstance,
  x: number,
  y: number,
  storyInfo: { hasStory: boolean; storyPath: string | null },
  callbacks: ContextMenuCallbacks,
): ContextMenuHandle {
  const meta = instance.meta
  const props = instance.props
  const serializedProps = instance.serializedProps
  const displayProps = serializedProps || props
  const propEntries = Object.entries(displayProps)
  const suggestedName = suggestStoryName(props)
  const relativePath = meta.relativeFilePath || meta.filePath
  const recording = isCurrentlyRecording()

  // ── Host element ──────────────────────────────────────────────────────
  const host = document.createElement('div')
  host.setAttribute(UI_MARKER, 'true')
  host.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    z-index: 2147483647;
    pointer-events: none;
    width: 0;
    height: 0;
    overflow: visible;
  `

  const shadow = host.attachShadow({ mode: 'open' })

  const styleEl = document.createElement('style')
  styleEl.textContent = STYLES
  shadow.appendChild(styleEl)

  // ── Build DOM ─────────────────────────────────────────────────────────
  const panel = document.createElement('div')
  panel.className = 'panel'

  const body = document.createElement('div')
  body.className = 'panel-body'

  // Breadcrumb row: path on the left, close (×) button on the right
  const breadcrumbRow = document.createElement('div')
  breadcrumbRow.className = 'breadcrumb-row'

  const breadcrumb = document.createElement('div')
  breadcrumb.className = 'breadcrumb'
  breadcrumb.innerHTML = toBreadcrumbs(relativePath)

  const breadcrumbCopyBtn = document.createElement('button')
  breadcrumbCopyBtn.className = 'breadcrumb-copy'
  breadcrumbCopyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`
  breadcrumbCopyBtn.title = 'Copy component path'
  breadcrumbCopyBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(meta.filePath).then(() => {
      breadcrumbCopyBtn.classList.add('copied')
      breadcrumbCopyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
      setTimeout(() => {
        if (breadcrumbCopyBtn.isConnected) {
          breadcrumbCopyBtn.classList.remove('copied')
          breadcrumbCopyBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`
        }
      }, 1500)
    })
  })
  breadcrumb.appendChild(breadcrumbCopyBtn)

  // Close (×) button — top-right, same row as the breadcrumb
  const closeBtn = document.createElement('button')
  closeBtn.className = 'close-btn'
  closeBtn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  closeBtn.title = 'Close'
  closeBtn.addEventListener('click', () => callbacks.onClose())

  breadcrumbRow.appendChild(breadcrumb)
  breadcrumbRow.appendChild(closeBtn)
  body.appendChild(breadcrumbRow)

  // Header row: component name + action buttons
  const header = document.createElement('div')
  header.className = 'header'

  const nameSpan = document.createElement('span')
  nameSpan.className = 'component-name'
  nameSpan.textContent = meta.componentName
  header.appendChild(nameSpan)

  const actions = document.createElement('div')
  actions.className = 'header-actions'

  // 1. Open Code button
  const openCodeWrap = document.createElement('div')
  openCodeWrap.className = 'action-btn-wrap'
  const openCodeBtn = document.createElement('button')
  openCodeBtn.className = 'icon-btn'
  openCodeBtn.id = 'open-component-btn'
  openCodeBtn.innerHTML = CODE_ICON
  openCodeBtn.title = 'Open component file in editor'
  openCodeBtn.addEventListener('click', () =>
    callbacks.openInEditor(meta.filePath),
  )
  callbacks.isOpenInEditorAvailable().then((avail) => {
    if (!avail) openCodeWrap.style.display = 'none'
  })
  const openCodeLabel = document.createElement('span')
  openCodeLabel.className = 'action-label'
  openCodeLabel.textContent = 'Open Code'
  openCodeWrap.appendChild(openCodeBtn)
  openCodeWrap.appendChild(openCodeLabel)
  actions.appendChild(openCodeWrap)

  // 2. Copy Prompt button — copies LLM-friendly context about this component
  const copyPromptWrap = document.createElement('div')
  copyPromptWrap.className = 'action-btn-wrap'
  const copyPromptBtn = document.createElement('button')
  copyPromptBtn.className = 'icon-btn copy-prompt-btn'
  copyPromptBtn.innerHTML = COPY_PROMPT_ICON
  copyPromptBtn.title = 'Copy component context as a prompt for an LLM'
  const copyPromptLabel = document.createElement('span')
  copyPromptLabel.className = 'action-label'
  copyPromptLabel.textContent = 'Copy Prompt'
  copyPromptBtn.addEventListener('click', () => {
    const prompt = buildLLMPrompt(
      instance,
      storyInfo.hasStory,
      storyInfo.storyPath,
    )
    navigator.clipboard.writeText(prompt).then(() => {
      copyPromptBtn.classList.add('copied')
      copyPromptBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      copyPromptLabel.textContent = 'Copied!'
      setTimeout(() => {
        if (copyPromptBtn.isConnected) {
          copyPromptBtn.classList.remove('copied')
          copyPromptBtn.innerHTML = COPY_PROMPT_ICON
          copyPromptLabel.textContent = 'Copy Prompt'
        }
      }, 1500)
    })
  })
  copyPromptWrap.appendChild(copyPromptBtn)
  copyPromptWrap.appendChild(copyPromptLabel)
  actions.appendChild(copyPromptWrap)

  // 3. Open Story button (pink Storybook icon)
  const storyBtnWrap = document.createElement('div')
  storyBtnWrap.className = 'action-btn-wrap'
  let goToStoryBtn = document.createElement('button')
  goToStoryBtn.className = 'icon-btn sb-btn'
  goToStoryBtn.innerHTML = SB_ICON
  goToStoryBtn.title = storyInfo.hasStory
    ? 'Open story file in editor'
    : 'No story file yet'
  let storyBtnLabel = document.createElement('span')
  storyBtnLabel.className = 'action-label'
  storyBtnLabel.textContent = storyInfo.hasStory ? 'Open Story' : 'No Story'
  if (!storyInfo.hasStory) {
    goToStoryBtn.setAttribute('disabled', '')
  } else {
    goToStoryBtn.addEventListener('click', () =>
      callbacks.openInEditor(storyInfo.storyPath!),
    )
  }
  storyBtnWrap.appendChild(goToStoryBtn)
  storyBtnWrap.appendChild(storyBtnLabel)
  actions.appendChild(storyBtnWrap)

  // 4. View Story in Storybook panel button
  let viewStoryWrap: HTMLDivElement | undefined
  let viewStoryBtn: HTMLButtonElement | undefined
  let viewStoryLabel: HTMLSpanElement | undefined
  if (callbacks.visitStory) {
    viewStoryWrap = document.createElement('div')
    viewStoryWrap.className = 'action-btn-wrap'
    viewStoryBtn = document.createElement('button')
    viewStoryBtn.className = 'icon-btn view-btn'
    viewStoryBtn.innerHTML = EYE_ICON
    viewStoryBtn.title = storyInfo.hasStory
      ? 'View story in Storybook panel'
      : 'No story to view'
    viewStoryLabel = document.createElement('span')
    viewStoryLabel.className = 'action-label'
    viewStoryLabel.textContent = storyInfo.hasStory ? 'View Story' : 'No Story'
    if (!storyInfo.hasStory) {
      viewStoryBtn.setAttribute('disabled', '')
    } else {
      const relPath = meta.relativeFilePath || meta.filePath
      const visitCb = callbacks.visitStory
      viewStoryBtn.addEventListener('click', () => {
        visitCb(relPath)
        callbacks.onClose()
      })
    }
    viewStoryWrap.appendChild(viewStoryBtn)
    viewStoryWrap.appendChild(viewStoryLabel)
    actions.appendChild(viewStoryWrap)
  }

  header.appendChild(actions)
  body.appendChild(header)

  // Divider between header and props
  const headerDivider = document.createElement('hr')
  headerDivider.className = 'divider'
  body.appendChild(headerDivider)

  // ── Properties section ────────────────────────────────────────────────
  let propsCollapsed = false
  const propsSection = document.createElement('div')
  propsSection.className = 'props-section'

  // Header with title + collapse button
  const propsHeaderRow = document.createElement('div')
  propsHeaderRow.className = 'props-header'

  const propsTitle = document.createElement('div')
  propsTitle.className = 'props-title'
  propsTitle.innerHTML = `Properties${propEntries.length > 0 ? ` <span class="props-count">(${propEntries.length})</span>` : ''}`
  propsHeaderRow.appendChild(propsTitle)

  const collapseBtn = document.createElement('button')
  collapseBtn.className = 'collapse-btn'
  collapseBtn.textContent = 'Collapse'
  collapseBtn.title = 'Toggle props visibility'
  if (propEntries.length > 0) {
    propsHeaderRow.appendChild(collapseBtn)
  }

  propsSection.appendChild(propsHeaderRow)

  // Props as a 2-column scrollable grid (key | value badge)
  const propsTable = document.createElement('div')
  propsTable.className = 'props-table'

  // Track active popover for dismissal
  let activePopover: HTMLDivElement | null = null
  const dismissPopover = () => {
    if (activePopover) {
      activePopover.remove()
      activePopover = null
    }
  }

  if (propEntries.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-props'
    empty.style.cssText =
      'grid-column: 1/-1; padding: 12px; text-align: center;'
    empty.textContent = 'No props'
    propsTable.appendChild(empty)
  }

  /** Open an object/JSX popover near the badge with a copy button */
  function openViewerPopover(
    badge: HTMLElement,
    displayKey: string,
    raw: unknown,
  ) {
    dismissPopover()

    const popover = document.createElement('div')
    popover.className = 'obj-popover'

    // Header with title + copy button
    const headerEl = document.createElement('div')
    headerEl.className = 'obj-popover-header'

    const title = document.createElement('span')
    title.className = 'obj-title'
    title.textContent = displayKey
    headerEl.appendChild(title)

    const copyBtn = document.createElement('button')
    copyBtn.className = 'copy-btn'
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`
    copyBtn.addEventListener('click', () => {
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('copied')
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`
        setTimeout(() => {
          if (popover.isConnected) {
            copyBtn.classList.remove('copied')
            copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy`
          }
        }, 1500)
      })
    })
    headerEl.appendChild(copyBtn)
    popover.appendChild(headerEl)

    // Scrollable body
    const bodyEl = document.createElement('div')
    bodyEl.className = 'obj-popover-body'

    const content = document.createElement('pre')
    content.style.cssText = 'margin:0;white-space:pre-wrap;'
    if (typeof raw === 'string') {
      content.innerHTML = `<span class="obj-tree-str">${esc(raw)}</span>`
    } else {
      content.innerHTML = renderObjectTree(raw)
    }
    bodyEl.appendChild(content)
    popover.appendChild(bodyEl)

    shadow.appendChild(popover)
    activePopover = popover

    // Position near the badge
    requestAnimationFrame(() => {
      const badgeRect = badge.getBoundingClientRect()
      const popRect = popover.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let left = badgeRect.right + 6
      let top = badgeRect.top

      if (left + popRect.width > vw - 10)
        left = badgeRect.left - popRect.width - 6
      if (top + popRect.height > vh - 10) top = vh - popRect.height - 10
      if (left < 10) left = 10
      if (top < 10) top = 10

      popover.style.left = `${left}px`
      popover.style.top = `${top}px`
    })

    // Close on click outside
    const closeHandler = (ev: MouseEvent) => {
      const path = ev.composedPath()
      if (!path.includes(popover) && ev.target !== badge) {
        popover.remove()
        if (activePopover === popover) activePopover = null
        shadow.removeEventListener('click', closeHandler)
        document.removeEventListener('click', closeHandler)
      }
    }
    setTimeout(() => {
      shadow.addEventListener('click', closeHandler)
      document.addEventListener('click', closeHandler)
    }, 0)
  }

  const COPY_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`
  const CHECK_ICON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`

  for (const [key, value] of propEntries) {
    const displayKey = key.startsWith('slot:') ? key.slice(5) : key
    const info = classifyProp(key, value)

    // Key cell
    const keyCell = document.createElement('div')
    keyCell.className = 'prop-key'
    keyCell.textContent = displayKey

    // Value cell
    const valCell = document.createElement('div')
    valCell.className = 'prop-val'

    const badge = document.createElement('span')
    badge.className = `badge ${info.typeClass}`
    badge.textContent = info.display

    // Show full value as native tooltip on hover when truncated
    if (info.display.length > 18) {
      badge.title = info.display
    }

    if (info.viewable && info.raw != null) {
      badge.style.cursor = 'pointer'
      badge.addEventListener('click', (e) => {
        e.stopPropagation()
        openViewerPopover(badge, displayKey, info.raw!)
      })
    }

    valCell.appendChild(badge)

    // Per-prop copy button (visible on hover)
    if (info.raw != null) {
      const propCopyBtn = document.createElement('button')
      propCopyBtn.className = 'prop-copy-btn'
      propCopyBtn.innerHTML = COPY_ICON_SVG
      propCopyBtn.title = 'Copy value'
      propCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const text =
          typeof info.raw === 'string'
            ? info.raw
            : JSON.stringify(info.raw, null, 2)
        navigator.clipboard.writeText(text).then(() => {
          propCopyBtn.classList.add('copied')
          propCopyBtn.innerHTML = CHECK_ICON_SVG
          setTimeout(() => {
            if (propCopyBtn.isConnected) {
              propCopyBtn.classList.remove('copied')
              propCopyBtn.innerHTML = COPY_ICON_SVG
            }
          }, 1200)
        })
      })
      valCell.appendChild(propCopyBtn)
    }

    propsTable.appendChild(keyCell)
    propsTable.appendChild(valCell)
  }

  propsSection.appendChild(propsTable)

  collapseBtn.addEventListener('click', () => {
    propsCollapsed = !propsCollapsed
    propsTable.style.display = propsCollapsed ? 'none' : ''
    collapseBtn.textContent = propsCollapsed ? 'Expand' : 'Collapse'
  })

  body.appendChild(propsSection)

  // Divider
  const divider = document.createElement('hr')
  divider.className = 'divider'
  body.appendChild(divider)

  // Recording warning
  if (recording) {
    const warnEl = document.createElement('div')
    warnEl.className = 'recording-warning'
    warnEl.innerHTML = `<span class="recording-dot"></span> Recording in progress — stop recording first.`
    body.appendChild(warnEl)
  }

  // ── Create New Story ──────────────────────────────────────────────────
  const storyTitle = document.createElement('div')
  storyTitle.className = 'create-story-title'
  storyTitle.textContent = 'Create New Story'
  body.appendChild(storyTitle)

  const inputWrap = document.createElement('div')
  inputWrap.className = 'story-input-wrapper'

  const storyInput = document.createElement('input')
  storyInput.className = 'story-input'
  storyInput.id = 'story-name-input'
  storyInput.type = 'text'
  storyInput.value = suggestedName
  storyInput.placeholder = 'Enter story name…'
  storyInput.addEventListener('focus', () => storyInput.select())
  inputWrap.appendChild(storyInput)

  body.appendChild(inputWrap)

  // Buttons
  const btnRow = document.createElement('div')
  btnRow.className = 'btn-row'

  const saveBtn = document.createElement('button')
  saveBtn.className = 'btn btn-save'
  saveBtn.id = 'save-story-btn'
  saveBtn.textContent = 'Create'
  saveBtn.title = 'Save a story with the current props'

  const interactionsBtn = document.createElement('button')
  interactionsBtn.className = 'btn btn-interactions'
  interactionsBtn.id = 'save-story-with-interactions-btn'
  interactionsBtn.textContent = 'Create with Interactions'
  interactionsBtn.title =
    'Record interactions then save as a story with a play function'
  if (recording) {
    interactionsBtn.disabled = true
  }

  saveBtn.addEventListener('click', () => {
    const name = storyInput.value.trim() || suggestedName
    saveBtn.textContent = 'Creating…'
    saveBtn.disabled = true
    callbacks.onSaveStory(name)
  })

  interactionsBtn.addEventListener('click', () => {
    if (isCurrentlyRecording()) return
    const name = storyInput.value.trim() || suggestedName
    callbacks.onSaveStoryWithInteractions(name)
  })

  storyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveBtn.click()
    }
  })

  btnRow.appendChild(saveBtn)
  btnRow.appendChild(interactionsBtn)
  body.appendChild(btnRow)

  panel.appendChild(body)
  shadow.appendChild(panel)

  // ── Append to document & position ─────────────────────────────────────
  // Place the panel at the click point initially, then adjust in the next frame
  panel.style.left = `${x}px`
  panel.style.top = `${y}px`

  document.body.appendChild(host)

  requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = x
    let top = y

    // If overflows right, shift left
    if (left + rect.width > vw - 10) left = Math.max(10, x - rect.width - 10)
    // If overflows bottom, shift up
    if (top + rect.height > vh - 10) top = Math.max(10, vh - rect.height - 10)
    // Final bounds
    if (left < 10) left = 10
    if (top < 10) top = 10

    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  })

  // ── External event handlers ───────────────────────────────────────────
  const onClickOutside = (e: MouseEvent) => {
    // Check if click is inside the panel (composedPath crosses shadow boundary)
    const path = e.composedPath()
    if (!path.includes(panel) && !path.includes(host)) {
      dismissPopover()
      handle.destroy()
      callbacks.onClose()
    }
  }
  const onEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dismissPopover()
      handle.destroy()
      callbacks.onClose()
    }
  }
  setTimeout(() => document.addEventListener('click', onClickOutside), 10)
  document.addEventListener('keydown', onEscape)

  // ── Handle ────────────────────────────────────────────────────────────
  const handle: ContextMenuHandle = {
    host,
    showSaveFeedback(status) {
      if (status === 'success') {
        saveBtn.textContent = '✓ Saved!'
        saveBtn.classList.add('success')
      } else {
        saveBtn.textContent = '✗ Failed'
        saveBtn.classList.add('error')
      }
      setTimeout(() => {
        if (host.isConnected) {
          saveBtn.textContent = 'Create'
          saveBtn.classList.remove('success', 'error')
          saveBtn.disabled = false
        }
      }, 2000)
    },
    enableGoToStory(storyPath) {
      const newBtn = document.createElement('button')
      newBtn.className = 'icon-btn sb-btn'
      newBtn.innerHTML = SB_ICON
      newBtn.addEventListener('click', () => callbacks.openInEditor(storyPath))
      storyBtnWrap.replaceChild(newBtn, goToStoryBtn)
      goToStoryBtn = newBtn
      storyBtnLabel.textContent = 'Open Story'
    },
    enableViewStory() {
      if (!viewStoryBtn || !viewStoryLabel || !callbacks.visitStory) return
      const relPath = meta.relativeFilePath || meta.filePath
      const visitCb = callbacks.visitStory
      const newBtn = document.createElement('button')
      newBtn.className = 'icon-btn view-btn'
      newBtn.innerHTML = EYE_ICON
      newBtn.addEventListener('click', () => {
        visitCb(relPath)
        callbacks.onClose()
      })
      viewStoryWrap!.replaceChild(newBtn, viewStoryBtn)
      viewStoryBtn = newBtn
      viewStoryLabel.textContent = 'View Story'
    },
    destroy() {
      dismissPopover()
      document.removeEventListener('click', onClickOutside)
      document.removeEventListener('keydown', onEscape)
      host.remove()
    },
  }

  return handle
}
