import React from 'react'
import { withFrame } from './withFrame'

// `BaseNote` is local (not exported) and `FramedNote`'s initializer is an
// arbitrary HOC call `withFrame(BaseNote)` — neither is tagged. This subtree
// is intentionally NOT detected; documented in docs/REACT_PATTERNS.md as a
// known limitation (workaround: export + use the inner component directly,
// or wrap with memo/forwardRef).
interface BaseNoteProps {
  text: string
}

function BaseNote({ text }: BaseNoteProps) {
  return <div className="task-card-meta">FramedNote (custom HOC): {text}</div>
}

export const FramedNote = withFrame(BaseNote)
