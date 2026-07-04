/**
 * Shared inline prop editor.
 *
 * Both the in-page context menu and the DevTools panel render an identical
 * "pencil → form → Apply" editor for live-editing a component prop. This is the
 * single implementation of that form: it builds the input (by `EditKind`),
 * the Apply/Cancel actions, the inline error slot, and the keyboard handling.
 *
 * Callers differ only in (a) the CSS class set and (b) what `onApply` does with
 * the entered value — the context menu calls `__componentHighlighterSetProp`
 * synchronously (in-page), the panel routes through RPC. Everything else is
 * shared, so it lives here rather than being copy-pasted per consumer.
 */
import { type EditKind, type SetPropPayload, editInitialText } from './prop-utils'

/** Result of applying an edit. `undefined`/void is treated as success. */
export interface PropEditResult {
  ok: boolean
  error?: string
}

/** CSS class names for the editor's elements (consumer-specific styling). */
export interface PropEditorClassNames {
  form: string
  input: string
  textarea: string
  actions: string
  save: string
  cancel: string
  error: string
}

export interface PropEditorOptions {
  /** Element the editor form is appended to. */
  parent: HTMLElement
  /** Current (serialized) value being edited. */
  value: unknown
  /** How to interpret/seed the input. */
  kind: EditKind
  classes: PropEditorClassNames
  saveLabel?: string
  cancelLabel?: string
  /**
   * Apply the entered value. Return `{ ok: false, error }` to keep the form
   * open and show the error; return `{ ok: true }`/void (sync or async) for
   * success. The panel routes this through RPC (fire-and-forget → void); the
   * context menu calls the runtime synchronously and forwards its result.
   */
  onApply: (
    payload: SetPropPayload,
  ) => PropEditResult | void | Promise<PropEditResult | void>
  /** Called once after a successful apply (caller tears down / re-renders). */
  onApplied?: (payload: SetPropPayload) => void
  /** Called when the user cancels (Escape / Cancel button). */
  onCancel: () => void
}

/**
 * Build the editor form, append it to `parent`, focus the input, and return the
 * form element. Removal is the caller's responsibility (via `onApplied`/
 * `onCancel`), since teardown differs per consumer (restore badge vs re-render).
 */
export function createPropEditor(opts: PropEditorOptions): HTMLElement {
  const { parent, value, kind, classes } = opts

  const form = document.createElement('div')
  form.className = classes.form

  let inputEl: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  const initial = editInitialText(value, kind)

  if (kind === 'boolean') {
    const sel = document.createElement('select')
    sel.className = classes.input
    sel.innerHTML = `<option value="true">true</option><option value="false">false</option>`
    sel.value = initial
    inputEl = sel
  } else if (kind === 'json') {
    const ta = document.createElement('textarea')
    ta.className = classes.textarea
    ta.value = initial
    ta.spellcheck = false
    inputEl = ta
  } else {
    const inp = document.createElement('input')
    inp.className = classes.input
    inp.type = kind === 'number' ? 'number' : 'text'
    inp.value = initial
    inputEl = inp
  }
  form.appendChild(inputEl)

  const actions = document.createElement('div')
  actions.className = classes.actions
  const saveBtn = document.createElement('button')
  saveBtn.className = classes.save
  saveBtn.textContent = opts.saveLabel ?? 'Apply'
  const cancelBtn = document.createElement('button')
  cancelBtn.className = classes.cancel
  cancelBtn.textContent = opts.cancelLabel ?? 'Cancel'
  actions.appendChild(saveBtn)
  actions.appendChild(cancelBtn)
  form.appendChild(actions)

  const errEl = document.createElement('div')
  errEl.className = classes.error
  errEl.style.display = 'none'
  form.appendChild(errEl)

  const apply = async () => {
    const text = 'value' in inputEl ? String(inputEl.value) : ''
    const payload: SetPropPayload = { kind, text }
    let res: PropEditResult | void
    try {
      res = await opts.onApply(payload)
    } catch (e) {
      res = { ok: false, error: (e as Error).message }
    }
    if (res && res.ok === false) {
      errEl.textContent = res.error || 'Failed to apply'
      errEl.style.display = ''
      return
    }
    opts.onApplied?.(payload)
  }

  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void apply()
  })
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    opts.onCancel()
  })
  inputEl.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent
    if (ke.key === 'Enter' && kind !== 'json') {
      e.preventDefault()
      void apply()
    } else if (ke.key === 'Escape') {
      e.preventDefault()
      opts.onCancel()
    }
  })

  parent.appendChild(form)
  inputEl.focus()
  return form
}
