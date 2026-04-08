/**
 * Shared highlight state — avoids circular imports between overlay.ts and listeners.ts.
 *
 * Tracks whether the panel's highlighter tab is active (panel-driven overlay).
 * The overlay checks this to decide whether clicks show the context menu or go to the panel.
 * The listeners module sets this based on the highlighter-tab-active shared state.
 */

let isPanelHighlighterActive = false

export function getIsPanelHighlighterActive(): boolean {
  return isPanelHighlighterActive
}

export function setIsPanelHighlighterActive(active: boolean): void {
  isPanelHighlighterActive = active
}
