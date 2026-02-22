export type ClickEvent = { type: 'click' | 'dblclick' }
export type TypeEvent = { type: 'type'; value: string }
export type KeydownEvent = {
  type: 'keydown'
  key: '{enter}' | '{esc}' | 'tab' | 'shift'
}
export type KeyupEvent = {
  type: 'keyup'
  key: 'shift'
}
export type SelectEvent = { type: 'select'; options: string[] }
export type UploadEvent = { type: 'upload'; files: string[] }
export type FocusEvent = { type: 'focus'; shift: boolean }
export type AssertionEvent = {
  type: 'assertion'
  assertionType:
    | 'toBeVisible'
    | 'toBeInTheDocument'
    | 'toBeChecked'
    | 'not.toBeChecked'
    | 'toBeDisabled'
    | 'toBeEnabled'
    | 'toHaveFocus'
    | 'toHaveValue'
    | 'not.toHaveValue'
    | 'toHaveTextContent'
  args: unknown[]
}

export type InteractionEvent =
  | ClickEvent
  | TypeEvent
  | KeydownEvent
  | KeyupEvent
  | SelectEvent
  | UploadEvent
  | FocusEvent
  | AssertionEvent

export type ElementQuery = {
  object: 'canvas' | 'body'
  method: string
  args: unknown[]
  nth: number | null
}

export type Interaction = {
  elementQuery: ElementQuery
  event: InteractionEvent
}
