/**
 * Context menu (tooltip) for the component highlighter overlay.
 *
 * Rendered inside a Shadow DOM so the host app's styles can never leak in
 * and our styles can never leak out.
 */
import type { ComponentInstance } from '../frameworks/types'
import { UI_MARKER, isCurrentlyRecording } from './interaction-recorder'
import { esc, classifyProp, renderObjectTree } from './utils/prop-utils'
import { buildLLMPrompt } from './utils/html-preview'
import { toBreadcrumbs, suggestStoryName } from './utils/format-utils'

// ─── Storybook logo SVG (pink) ──────────────────────────────────────────────
const CODE_ICON = `<svg width="14" height="14" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.53613 4.31055C7.63877 4.05443 7.92931 3.92987 8.18555 4.03223C8.44167 4.13483 8.56617 4.4254 8.46387 4.68164L6.46387 9.68164C6.36117 9.93761 6.07062 10.0623 5.81445 9.95996C5.55837 9.85739 5.43397 9.56674 5.53613 9.31055L7.53613 4.31055Z" fill="currentColor"/><path d="M3.64648 5.14258C3.84175 4.94762 4.15834 4.94747 4.35352 5.14258C4.5486 5.33775 4.54846 5.65435 4.35352 5.84961L3.20703 6.99609L4.35352 8.14258C4.5486 8.33775 4.54846 8.65435 4.35352 8.84961C4.15826 9.04458 3.84166 9.0447 3.64648 8.84961L2.14648 7.34961C2.04896 7.25205 2.00006 7.12393 2 6.99609C2.00001 6.93207 2.01266 6.86784 2.03711 6.80762C2.04931 6.77763 2.06475 6.74834 2.08301 6.7207L2.14648 6.64258L3.64648 5.14258Z" fill="currentColor"/><path d="M9.64648 5.14258C9.84174 4.94763 10.1583 4.9475 10.3535 5.14258L11.8535 6.64258L11.918 6.7207C11.9363 6.7484 11.9517 6.77755 11.9639 6.80762C11.9883 6.86782 12 6.93209 12 6.99609C11.9999 7.12383 11.9509 7.25208 11.8535 7.34961L10.3535 8.84961C10.1583 9.04455 9.84166 9.0447 9.64648 8.84961C9.45144 8.65443 9.45155 8.33782 9.64648 8.14258L10.793 6.99609L9.64648 5.84961C9.45142 5.65445 9.45158 5.33784 9.64648 5.14258Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M13.5 0C13.7761 0 14 0.223858 14 0.5V11.5L13.9902 11.6006C13.9503 11.7961 13.7961 11.9503 13.6006 11.9902L13.5 12H0.5L0.399414 11.9902C0.203918 11.9503 0.0496648 11.7961 0.00976562 11.6006L0 11.5V0.5C1.28852e-07 0.223858 0.223858 1.20798e-08 0.5 0H13.5ZM1 11H13V3H1V11ZM1.5 1C1.22386 1 1 1.22386 1 1.5C1 1.77614 1.22386 2 1.5 2C1.77614 2 2 1.77614 2 1.5C2 1.22386 1.77614 1 1.5 1ZM3.5 1C3.22386 1 3 1.22386 3 1.5C3 1.77614 3.22386 2 3.5 2C3.77614 2 4 1.77614 4 1.5C4 1.22386 3.77614 1 3.5 1ZM5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2C5.77614 2 6 1.77614 6 1.5C6 1.22386 5.77614 1 5.5 1Z" fill="currentColor"/></svg>`
const EYE_ICON = `<svg width="14" height="14" viewBox="0 0 11.2368 13.9999" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.659982 0.615712C0.278813 0.639535 -0.013819 0.962974 0.000504064 1.34462L0.434194 12.9005C0.447931 13.2665 0.740084 13.5608 1.106 13.5773L10.5014 13.9992C10.5119 13.9997 10.5224 13.9999 10.533 13.9999C10.9217 13.9999 11.2368 13.6848 11.2368 13.2961V0.703904C11.2368 0.689258 11.2364 0.674615 11.2355 0.659997C11.2112 0.272012 10.877 -0.0228544 10.4891 0.00139464L9.71642 0.0497456L9.77284 1.6653C9.77487 1.72325 9.72953 1.77187 9.67157 1.7739C9.64676 1.77476 9.62244 1.76681 9.60293 1.75144L9.08239 1.34138L8.46609 1.80888C8.41989 1.84393 8.35402 1.83489 8.31898 1.78869C8.30422 1.76924 8.29671 1.74526 8.29772 1.72087L8.36369 0.134291L0.659982 0.615712ZM8.66356 5.36294C8.41593 5.5553 6.57131 5.68655 6.57131 5.4127C6.6103 4.36774 6.14247 4.32193 5.88256 4.32193C5.63565 4.32193 5.2198 4.39657 5.2198 4.95637C5.2198 5.52683 5.82752 5.84888 6.54082 6.22689C7.55413 6.76387 8.78051 7.41377 8.78051 9.04913C8.78051 10.6166 7.50697 11.4824 5.88256 11.4824C4.20616 11.4824 2.74118 10.8042 2.90663 8.45275C2.97161 8.17663 5.10284 8.24225 5.10284 8.45275C5.07685 9.42307 5.29777 9.70845 5.85657 9.70845C6.28541 9.70845 6.48034 9.47209 6.48034 9.07401C6.48034 8.47157 5.84715 8.11607 5.11874 7.7071C4.13246 7.15336 2.97161 6.50161 2.97161 5.00613C2.97161 3.51333 3.99824 2.51813 5.83058 2.51813C7.66292 2.51813 8.66356 3.49808 8.66356 5.36294Z" fill="currentColor"/></svg>`
const COPY_PROMPT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
const CHEVRON_PATH = `M0.853553 0.146447C0.658291 -0.0488155 0.341709 -0.0488155 0.146447 0.146447C-0.0488155 0.341709 -0.0488155 0.658291 0.146447 0.853553L3.64645 4.35355C3.84171 4.54882 4.15829 4.54882 4.35355 4.35355L7.85355 0.853554C8.04882 0.658292 8.04882 0.341709 7.85355 0.146447C7.65829 -0.0488153 7.34171 -0.0488153 7.14645 0.146447L4 3.29289L0.853553 0.146447Z`
const CHEVRON_DOWN_ICON = `<svg width="14" height="14" viewBox="-3 -4.75 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${CHEVRON_PATH}" fill="currentColor"/></svg>`
const CHEVRON_LEFT_ICON = `<svg width="14" height="14" viewBox="-3 -4.75 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(90deg)"><path d="${CHEVRON_PATH}" fill="currentColor"/></svg>`
const CLOSE_ICON = `<svg width="14" height="14" viewBox="-2 -2 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.14645 0.146447C9.34171 -0.0488153 9.65821 -0.0488153 9.85348 0.146447C10.0487 0.341712 10.0487 0.658228 9.85348 0.853478L5.70699 4.99996L9.85348 9.14645C10.0487 9.34171 10.0487 9.65823 9.85348 9.85348C9.65823 10.0487 9.34171 10.0487 9.14645 9.85348L4.99996 5.70699L0.853478 9.85348C0.658228 10.0487 0.341712 10.0487 0.146447 9.85348C-0.0488153 9.65821 -0.0488153 9.34171 0.146447 9.14645L4.29293 4.99996L0.146447 0.853478C-0.0488155 0.658216 -0.0488155 0.341709 0.146447 0.146447C0.341709 -0.0488155 0.658216 -0.0488155 0.853478 0.146447L4.99996 4.29293L9.14645 0.146447Z" fill="currentColor"/></svg>`

// ─── Stylesheet (injected into the shadow root) ────────────────────────────
const STYLES = /* css */ `
  :host {
    all: initial;
    display: block;
    pointer-events: none;

    /* ── Storybook design tokens ── */
    --sb-color-brand: #FF4785;
    --sb-color-secondary: #006DEB;
    --sb-fgcolor-default: #2E3338;
    --sb-fgcolor-muted: #5C6570;
    --sb-fgcolor-accent: #006DEB;
    --sb-fgcolor-inverse: #FFFFFF;
    --sb-fgcolor-positive: #427C27;
    --sb-fgcolor-warning: #7A4100;
    --sb-fgcolor-negative: #C23400;
    --sb-bgcolor-app: #F6F9FC;
    --sb-bgcolor-default: #FFFFFF;
    --sb-bgcolor-muted: #F6F9FC;
    --sb-bgcolor-hover: #DBECFF;
    --sb-bgcolor-positive: #F1FFEB;
    --sb-bgcolor-warning: #FFF7EB;
    --sb-bgcolor-negative: #FFF0EB;
    --sb-bordercolor-default: hsl(212 50% 30% / 0.15);
    --sb-bordercolor-muted: hsl(0 0% 0% / 0.1);
    --sb-bordercolor-positive: #BFE7AC;
    --sb-font-sans: "Nunito Sans", -apple-system, ".SFNSText-Regular", "San Francisco", BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
    --sb-font-mono: ui-monospace, Menlo, Monaco, "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Droid Sans Mono", "Courier New", monospace;
    --sb-font-size-s1: 12px;
    --sb-font-size-s2: 14px;
    --sb-font-size-m1: 20px;
    --sb-border-radius: 4px;

    /* ── Syntax highlight tokens ── */
    --sb-syntax-string: rgb(196, 26, 22);
    --sb-syntax-number: rgb(28, 0, 207);
    --sb-syntax-boolean: rgb(28, 0, 207);
    --sb-syntax-function: rgb(13, 34, 170);
    --sb-syntax-key: rgb(136, 19, 145);
    --sb-syntax-null: rgb(128, 128, 128);
  }

  @media (prefers-color-scheme: dark) {
    :host {
      --sb-color-secondary: #479DFF;
      --sb-fgcolor-default: #C9CCCF;
      --sb-fgcolor-muted: #95999D;
      --sb-fgcolor-accent: #479DFF;
      --sb-fgcolor-inverse: #1B1C1D;
      --sb-fgcolor-positive: #86CE64;
      --sb-fgcolor-warning: #FFAD33;
      --sb-fgcolor-negative: #FF6933;
      --sb-bgcolor-app: #1B1C1D;
      --sb-bgcolor-default: #222325;
      --sb-bgcolor-muted: #1B1C1D;
      --sb-bgcolor-hover: #233952;
      --sb-bgcolor-positive: transparent;
      --sb-bgcolor-warning: transparent;
      --sb-bgcolor-negative: transparent;
      --sb-bordercolor-default: hsl(0 0% 100% / 0.1);
      --sb-bordercolor-muted: hsl(0 0% 100% / 0.5);
      --sb-bordercolor-positive: hsl(101 52% 64% / 0.15);
      --sb-syntax-string: rgb(233, 63, 59);
      --sb-syntax-number: hsl(252, 100%, 75%);
      --sb-syntax-boolean: hsl(252, 100%, 75%);
      --sb-syntax-function: rgb(85, 106, 242);
      --sb-syntax-key: rgb(227, 110, 236);
      --sb-syntax-null: rgb(127, 127, 127);
    }
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .panel {
    position: fixed;
    pointer-events: auto;
    font-family: var(--sb-font-sans);
    font-size: var(--sb-font-size-s1);
    color: var(--sb-fgcolor-default);
    line-height: 1.4;
    background: var(--sb-bgcolor-default);
    border-radius: 8px;
    width: 400px;
    max-width: 400px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
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
    font-size: var(--sb-font-size-s1);
    color: var(--sb-fgcolor-muted);
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
    color: var(--sb-fgcolor-muted);
    font-size: 10px;
    margin: 0 1px;
  }
  .breadcrumb .file {
    color: var(--sb-fgcolor-muted);
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
    color: var(--sb-fgcolor-muted);
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0;
    pointer-events: none;
    border-radius: var(--sb-border-radius);
  }
  .breadcrumb:hover .breadcrumb-copy {
    opacity: 1;
    pointer-events: auto;
  }
  .breadcrumb-copy:hover {
    color: var(--sb-fgcolor-default);
    background: var(--sb-bgcolor-hover);
  }
  .breadcrumb-copy.copied {
    color: var(--sb-fgcolor-positive);
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
    font-size: var(--sb-font-size-s2);
    font-weight: 700;
    color: var(--sb-fgcolor-default);
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

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--sb-border-radius);
    color: var(--sb-fgcolor-muted);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    font-family: inherit;
  }
  .icon-btn:hover {
    background: var(--sb-bgcolor-hover);
    color: var(--sb-fgcolor-default);
  }


  .icon-btn.copy-prompt-btn.copied {
    color: var(--sb-fgcolor-positive);
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
    font-weight: 700;
    font-size: var(--sb-font-size-s2);
    color: var(--sb-fgcolor-default);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .props-count {
    font-weight: 400;
    color: var(--sb-fgcolor-muted);
    font-size: var(--sb-font-size-s2);
  }

  /* ── Props grid (scrollable 2-column table) ─── */
  .props-table {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1px;
    max-height: 200px;
    overflow-y: auto;
    border-radius: var(--sb-border-radius);
    background: var(--sb-bgcolor-app);
    border: 1px solid var(--sb-bordercolor-default);
  }
  .props-table::-webkit-scrollbar {
    width: 4px;
  }
  .props-table::-webkit-scrollbar-track {
    background: transparent;
  }
  .props-table::-webkit-scrollbar-thumb {
    background: var(--sb-bordercolor-muted);
    border-radius: 2px;
  }
  .prop-key {
    padding: 6px 12px;
    font-family: var(--sb-font-mono);
    font-size: var(--sb-font-size-s1);
    color: var(--sb-fgcolor-muted);
    white-space: nowrap;
    background: var(--sb-bgcolor-app);
    display: flex;
    align-items: center;
  }
  .prop-val {
    padding: 5px 8px;
    background: var(--sb-bgcolor-default);
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
    background: transparent;
    border: none;
    border-radius: var(--sb-border-radius);
    color: var(--sb-fgcolor-muted);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    opacity: 0;
    pointer-events: none;
  }
  .prop-val:hover .prop-copy-btn {
    opacity: 1;
    pointer-events: auto;
  }
  .prop-copy-btn:hover {
    background: var(--sb-bgcolor-hover);
    color: var(--sb-fgcolor-default);
  }
  .prop-copy-btn.copied {
    color: var(--sb-fgcolor-positive);
  }

  /* ── Value badge (the colored chip) ──── */
  .badge {
    display: inline-block;
    font-family: var(--sb-font-mono);
    font-size: var(--sb-font-size-s1);
    padding: 2px 8px;
    border-radius: var(--sb-border-radius);
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    vertical-align: middle;
  }
  .badge.str {
    color: var(--sb-syntax-string);
    background: color-mix(in srgb, var(--sb-syntax-string) 12%, var(--sb-bgcolor-muted));
  }
  .badge.num {
    color: var(--sb-syntax-number);
    background: color-mix(in srgb, var(--sb-syntax-number) 12%, var(--sb-bgcolor-muted));
  }
  .badge.bool {
    color: var(--sb-syntax-boolean);
    background: color-mix(in srgb, var(--sb-syntax-boolean) 12%, var(--sb-bgcolor-muted));
  }
  .badge.fn {
    color: var(--sb-syntax-function);
    background: color-mix(in srgb, var(--sb-syntax-function) 12%, var(--sb-bgcolor-muted));
  }
  .badge.jsx {
    color: var(--sb-syntax-function);
    background: color-mix(in srgb, var(--sb-syntax-function) 12%, var(--sb-bgcolor-muted));
  }
  .badge.slot {
    color: var(--sb-fgcolor-positive);
    background: var(--sb-bgcolor-positive);
  }
  .badge.obj {
    color: var(--sb-syntax-key);
    background: color-mix(in srgb, var(--sb-syntax-key) 12%, var(--sb-bgcolor-muted));
    cursor: pointer;
    transition: background 0.15s ease;
  }
  .badge.obj:hover {
    background: color-mix(in srgb, var(--sb-syntax-key) 20%, var(--sb-bgcolor-muted));
  }
  .badge.null {
    color: var(--sb-syntax-null);
    background: var(--sb-bgcolor-muted);
    font-style: italic;
  }

  /* ── Object viewer popover ─────────────── */
  .obj-popover {
    position: fixed;
    min-width: 260px;
    max-width: 360px;
    background: var(--sb-bgcolor-default);
    border: 1px solid var(--sb-bordercolor-default);
    border-radius: var(--sb-border-radius);
    z-index: 100;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    font-family: var(--sb-font-mono);
    font-size: var(--sb-font-size-s1);
    line-height: 1.6;
    overflow: hidden;
    pointer-events: auto;
  }
  .obj-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid var(--sb-bordercolor-default);
  }
  .obj-popover-header .obj-title {
    font-weight: 700;
    color: var(--sb-fgcolor-default);
    font-size: var(--sb-font-size-s2);
    font-family: var(--sb-font-sans);
  }
  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--sb-bgcolor-muted);
    border: 1px solid var(--sb-bordercolor-default);
    border-radius: var(--sb-border-radius);
    color: var(--sb-fgcolor-muted);
    cursor: pointer;
    padding: 3px 8px;
    font-size: var(--sb-font-size-s1);
    font-family: var(--sb-font-sans);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .copy-btn:hover {
    background: var(--sb-bgcolor-hover);
    color: var(--sb-fgcolor-default);
  }
  .copy-btn.copied {
    color: var(--sb-fgcolor-positive);
    border-color: var(--sb-bordercolor-positive);
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
    background: var(--sb-bordercolor-muted);
    border-radius: 2px;
  }
  .obj-tree-key { color: var(--sb-syntax-key); }
  .obj-tree-str { color: var(--sb-syntax-string); }
  .obj-tree-num { color: var(--sb-syntax-number); }
  .obj-tree-bool { color: var(--sb-syntax-boolean); }
  .obj-tree-null { color: var(--sb-syntax-null); font-style: italic; }
  .obj-tree-punct { color: var(--sb-fgcolor-muted); }
  .obj-tree-toggle {
    cursor: pointer;
    user-select: none;
  }
  .obj-tree-toggle:hover {
    color: var(--sb-fgcolor-default);
  }


  /* ── Recording warning ─────────────────── */
  .recording-warning {
    color: var(--sb-fgcolor-negative);
    font-size: var(--sb-font-size-s1);
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .recording-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sb-fgcolor-negative);
    flex-shrink: 0;
    animation: blink 1s step-start infinite;
  }
  @keyframes blink {
    50% { opacity: 0.2; }
  }

  /* ── Create Story section ──────────────── */
  .create-story-title {
    font-weight: 700;
    font-size: var(--sb-font-size-s2);
    color: var(--sb-fgcolor-default);
    margin-bottom: 12px;
  }
  .story-input-wrapper {
    position: relative;
    margin-bottom: 14px;
  }
  .story-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--sb-bgcolor-muted);
    border: 1px solid var(--sb-bordercolor-default);
    border-radius: var(--sb-border-radius);
    color: var(--sb-fgcolor-default);
    font-size: var(--sb-font-size-s2);
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }
  .story-input:focus {
    border-color: var(--sb-color-brand);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--sb-color-brand) 20%, transparent);
  }
  .story-input::placeholder {
    color: var(--sb-fgcolor-muted);
  }
  .story-label {
    position: absolute;
    top: -9px;
    left: 10px;
    background: var(--sb-bgcolor-default);
    padding: 1px 6px;
    font-size: var(--sb-font-size-s1);
    color: var(--sb-color-secondary);
    letter-spacing: 0.02em;
    line-height: 1.3;
    pointer-events: none;
    z-index: 1;
    border-radius: var(--sb-border-radius);
  }

  .btn-row {
    display: flex;
    gap: 8px;
  }
  .btn {
    flex: 1;
    padding: 10px 14px;
    border: none;
    border-radius: var(--sb-border-radius);
    font-size: var(--sb-font-size-s1);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
    font-family: inherit;
  }
  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .btn-save {
    background: var(--sb-color-secondary);
    color: var(--sb-fgcolor-inverse);
  }
  .btn-save:hover:not(:disabled) {
    background: color-mix(in srgb, white 12%, var(--sb-color-secondary));
  }
  .btn-save:focus-visible {
    outline: 2px solid var(--sb-color-secondary);
    outline-offset: 2px;
  }
  .btn-save.success {
    background: var(--sb-fgcolor-positive);
  }
  .btn-save.error {
    background: var(--sb-fgcolor-negative);
  }
  .btn-interactions {
    background: transparent;
    border: 1px solid var(--sb-color-secondary);
    color: var(--sb-color-secondary);
  }
  .btn-interactions:hover:not(:disabled) {
    background: var(--sb-bgcolor-hover);
  }
  .btn-interactions:focus-visible {
    outline: 2px solid var(--sb-color-secondary);
    outline-offset: 2px;
  }

  /* ── Empty state ───────────────────────── */
  .empty-props {
    color: var(--sb-fgcolor-muted);
    font-size: var(--sb-font-size-s1);
    padding: 4px 0;
    font-style: italic;
  }
`

// ─── Helpers ────────────────────────────────────────────────────────────────

// Re-export suggestStoryName so existing imports from './context-menu' keep working
export { suggestStoryName } from './utils/format-utils'

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
  closeBtn.className = 'icon-btn'
  closeBtn.innerHTML = CLOSE_ICON
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
  const openCodeBtn = document.createElement('button')
  openCodeBtn.className = 'icon-btn'
  openCodeBtn.id = 'open-component-btn'
  openCodeBtn.innerHTML = CODE_ICON
  openCodeBtn.title = 'Open component in editor'
  openCodeBtn.addEventListener('click', () =>
    callbacks.openInEditor(meta.filePath),
  )
  callbacks.isOpenInEditorAvailable().then((avail) => {
    if (!avail) openCodeBtn.style.display = 'none'
  })
  actions.appendChild(openCodeBtn)

  // 2. Copy Prompt button — copies LLM-friendly context about this component
  const copyPromptBtn = document.createElement('button')
  copyPromptBtn.className = 'icon-btn copy-prompt-btn'
  copyPromptBtn.innerHTML = COPY_PROMPT_ICON
  copyPromptBtn.title = 'Copy component context as a prompt for an LLM'
  copyPromptBtn.addEventListener('click', () => {
    const prompt = buildLLMPrompt(
      instance,
      storyInfo.hasStory,
      storyInfo.storyPath,
    )
    navigator.clipboard.writeText(prompt).then(() => {
      copyPromptBtn.classList.add('copied')
      copyPromptBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      setTimeout(() => {
        if (copyPromptBtn.isConnected) {
          copyPromptBtn.classList.remove('copied')
          copyPromptBtn.innerHTML = COPY_PROMPT_ICON
        }
      }, 1500)
    })
  })
  actions.appendChild(copyPromptBtn)

  // 3. Open Story button (pink Storybook icon) — only when story exists
  let goToStoryBtn: HTMLButtonElement | undefined
  if (storyInfo.hasStory) {
    goToStoryBtn = document.createElement('button')
    goToStoryBtn.className = 'icon-btn'
    goToStoryBtn.innerHTML = CODE_ICON
    goToStoryBtn.title = 'Open story in editor'
    goToStoryBtn.addEventListener('click', () =>
      callbacks.openInEditor(storyInfo.storyPath!),
    )
    actions.appendChild(goToStoryBtn)
  }

  // 4. View Story in Storybook panel button — only when story exists
  let viewStoryBtn: HTMLButtonElement | undefined
  if (callbacks.visitStory && storyInfo.hasStory) {
    viewStoryBtn = document.createElement('button')
    viewStoryBtn.className = 'icon-btn'
    viewStoryBtn.innerHTML = EYE_ICON
    viewStoryBtn.title = 'View story in Storybook'
    const relPath = meta.relativeFilePath || meta.filePath
    const visitCb = callbacks.visitStory
    viewStoryBtn.addEventListener('click', () => {
      visitCb(relPath)
      callbacks.onClose()
    })
    actions.appendChild(viewStoryBtn)
  }

  header.appendChild(actions)
  body.appendChild(header)


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
  collapseBtn.className = 'icon-btn'
  collapseBtn.innerHTML = CHEVRON_DOWN_ICON
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
    const closeHandler = (ev: Event) => {
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
    collapseBtn.innerHTML = propsCollapsed ? CHEVRON_LEFT_ICON : CHEVRON_DOWN_ICON
  })

  body.appendChild(propsSection)


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
      if (goToStoryBtn) {
        goToStoryBtn.onclick = () => callbacks.openInEditor(storyPath)
        return
      }
      goToStoryBtn = document.createElement('button')
      goToStoryBtn.className = 'icon-btn'
      goToStoryBtn.innerHTML = CODE_ICON
      goToStoryBtn.title = 'Open story in editor'
      goToStoryBtn.addEventListener('click', () => callbacks.openInEditor(storyPath))
      actions.appendChild(goToStoryBtn)
    },
    enableViewStory() {
      if (viewStoryBtn || !callbacks.visitStory) return
      viewStoryBtn = document.createElement('button')
      viewStoryBtn.className = 'icon-btn'
      viewStoryBtn.innerHTML = EYE_ICON
      viewStoryBtn.title = 'View story in Storybook'
      const relPath = meta.relativeFilePath || meta.filePath
      const visitCb = callbacks.visitStory
      viewStoryBtn.addEventListener('click', () => {
        visitCb(relPath)
        callbacks.onClose()
      })
      actions.appendChild(viewStoryBtn)
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
