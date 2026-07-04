import React from 'react'

// PATTERN (UNSUPPORTED detection): anonymous default export.
// There is no stable binding name to tag, so this is intentionally skipped.
// Workaround: give it a name (`export default function AnonWidget() {}` or
// `const AnonWidget = () => {}; export default AnonWidget`).
// Documented in docs/REACT_PATTERNS.md.
export default () => (
  <div className="task-card-meta">AnonWidget (anonymous default — not detected)</div>
)
