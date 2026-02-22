import { combineInteractions } from '../codegen/combine-interactions'
import {
  generateQuery,
  getClosestInteractiveElement,
} from '../codegen/generate-query'
import {
  DOM_EVENTS,
  getInteractionEvent,
} from '../codegen/get-interaction-event'
import { convertInteractionsToCode } from '../codegen/interactions-to-code'
import type { Interaction } from '../codegen/types'

// Recording state
let isRecording = false
let recordedInteractions: Interaction[] = []
let recordingIndicatorElement: HTMLDivElement | null = null
let onStopCallback: ((interactions: Interaction[]) => void) | null = null

// Default test ID attribute
const TEST_ID_ATTRIBUTE = 'data-testid'

/**
 * Mark an element as part of the highlighter UI so interactions on it are skipped.
 * Use this on all our own overlay and menu elements.
 */
export const UI_MARKER = 'data-component-highlighter-ui'

// Main interaction listener - processes DOM events during recording
const interactionListener = async (event: Event) => {
  if (!isRecording) return

  // Skip events on our own UI elements
  const target = event.target as HTMLElement
  if (target.closest(`[${UI_MARKER}]`)) return

  const interactionEvent = getInteractionEvent(event)
  if (!interactionEvent) return

  const closestInteractive = getClosestInteractiveElement(target) || target
  const elementQuery = await generateQuery(
    document.body,
    closestInteractive,
    TEST_ID_ATTRIBUTE,
  )
  if (!elementQuery) return

  const interaction: Interaction = { elementQuery, event: interactionEvent }
  recordedInteractions = combineInteractions(interaction, recordedInteractions)

  updateRecordingIndicator()
}

// ---- Floating Recording Indicator ----

function createRecordingIndicator() {
  const el = document.createElement('div')
  el.id = 'component-highlighter-recording-indicator'
  el.setAttribute(UI_MARKER, 'true')
  el.style.cssText = `
    position: fixed;
    bottom: 12px;
    left: 12px;
    background: #dc2626;
    color: white;
    padding: 8px 14px;
    border-radius: 8px;
    font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.2);
    user-select: none;
  `

  const dot = document.createElement('span')
  dot.id = 'recording-dot'
  dot.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: white;
    display: inline-block;
    animation: ch-blink 1s step-start infinite;
  `

  const label = document.createElement('span')
  label.id = 'recording-label'
  label.textContent = 'Recording...'
  label.style.fontWeight = '600'

  const stopBtn = document.createElement('button')
  stopBtn.id = 'recording-stop-btn'
  stopBtn.setAttribute(UI_MARKER, 'true')
  stopBtn.style.cssText = `
    background: rgba(255, 255, 255, 0.2);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.4);
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
  `
  stopBtn.textContent = 'Stop'
  stopBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    e.preventDefault()
    stopRecording()
  })

  el.appendChild(dot)
  el.appendChild(label)
  el.appendChild(stopBtn)

  // Inject blink animation if not already present
  if (!document.getElementById('ch-recording-styles')) {
    const style = document.createElement('style')
    style.id = 'ch-recording-styles'
    style.textContent = `
      @keyframes ch-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.2; }
      }
    `
    document.head.appendChild(style)
  }

  return el
}

function showRecordingIndicator() {
  if (recordingIndicatorElement) return

  recordingIndicatorElement = createRecordingIndicator()
  document.body.appendChild(recordingIndicatorElement)
}

function hideRecordingIndicator() {
  if (recordingIndicatorElement) {
    recordingIndicatorElement.remove()
    recordingIndicatorElement = null
  }
}

function updateRecordingIndicator() {
  if (!recordingIndicatorElement) return

  const count = recordedInteractions.length
  const label = recordingIndicatorElement.querySelector(
    '#recording-label',
  ) as HTMLSpanElement
  if (label) {
    label.textContent =
      count === 0
        ? 'Recording...'
        : `Recording (${count} interaction${count !== 1 ? 's' : ''})`
  }
}

// ---- Public API ----

/**
 * Start recording interactions. Clears any previously recorded interactions.
 * @param onStop Optional callback invoked when recording stops
 */
export function startRecording(onStop?: (interactions: Interaction[]) => void) {
  if (isRecording) return

  isRecording = true
  recordedInteractions = []
  onStopCallback = onStop ?? null

  for (const eventType of DOM_EVENTS) {
    document.body.addEventListener(eventType, interactionListener, true)
  }

  showRecordingIndicator()
  console.log('[component-highlighter] Interaction recording started')
}

/**
 * Stop recording and return the recorded interactions.
 */
export function stopRecording(): Interaction[] {
  if (!isRecording) return recordedInteractions

  isRecording = false

  for (const eventType of DOM_EVENTS) {
    document.body.removeEventListener(eventType, interactionListener, true)
  }

  hideRecordingIndicator()

  const interactions = [...recordedInteractions]
  console.log(
    `[component-highlighter] Interaction recording stopped. ${interactions.length} interactions captured.`,
  )

  if (onStopCallback) {
    onStopCallback(interactions)
    onStopCallback = null
  }

  return interactions
}

/**
 * Get the currently recorded interactions without stopping recording.
 */
export function getRecordedInteractions(): Interaction[] {
  return [...recordedInteractions]
}

/**
 * Clear all recorded interactions without stopping recording.
 */
export function clearRecordedInteractions() {
  recordedInteractions = []
  updateRecordingIndicator()
}

/**
 * Returns true if recording is currently active.
 */
export function isCurrentlyRecording(): boolean {
  return isRecording
}

/**
 * Convert the current recorded interactions to play function code.
 * Returns null if there are no recorded interactions.
 */
export function getPlayFunctionCode(): {
  imports: string[]
  playLines: string[]
} | null {
  if (recordedInteractions.length === 0) return null

  const { imports, play } = convertInteractionsToCode(recordedInteractions)

  if (!play.length) return null

  return {
    imports: imports.map((line) => line.text),
    playLines: play.map((line) => line.text),
  }
}
