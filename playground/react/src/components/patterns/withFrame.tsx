import React from 'react'

// PATTERN (UNSUPPORTED detection): a custom higher-order component.
// `withFrame(Inner)` returns a new component, but the transform can only
// statically recognize `memo`/`forwardRef` wrappers — an arbitrary HOC call
// is not provably a component at build time, so the *result* binding is not
// tagged. See docs/REACT_PATTERNS.md.
export function withFrame<P extends object>(
  Inner: React.ComponentType<P>,
): React.FC<P> {
  return function Framed(props: P) {
    return (
      <div className="task-card" style={{ outline: '2px dashed #888' }}>
        <Inner {...props} />
      </div>
    )
  }
}
