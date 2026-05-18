import React, { useState } from 'react'

// PATTERN: compound component with dot-notation subcomponents.
// `Disclosure` (exported) IS detected. `Disclosure.Summary` /
// `Disclosure.Panel` are static member assignments, NOT top-level exported
// bindings, so they are intentionally NOT detected as separate components
// (documented in docs/REACT_PATTERNS.md).
export interface DisclosureProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function Summary({ children }: { children: React.ReactNode }) {
  return <span className="task-card-title">{children}</span>
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="task-card-meta">{children}</div>
}

export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="task-card">
      <button
        className="btn btn-secondary btn-small"
        onClick={() => setOpen((o) => !o)}
      >
        <Disclosure.Summary>
          {open ? '▾' : '▸'} {title}
        </Disclosure.Summary>
      </button>
      {open && <Disclosure.Panel>{children}</Disclosure.Panel>}
    </div>
  )
}

Disclosure.Summary = Summary
Disclosure.Panel = Panel
