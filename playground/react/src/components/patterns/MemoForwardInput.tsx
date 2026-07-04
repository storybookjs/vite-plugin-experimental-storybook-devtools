import React, { forwardRef, memo } from 'react'

// PATTERN: composed wrappers `memo(forwardRef(...))`
export interface MemoForwardInputProps {
  label: string
  placeholder?: string
}

export const MemoForwardInput = memo(
  forwardRef<HTMLInputElement, MemoForwardInputProps>(function MemoForwardInput(
    { label, placeholder },
    ref,
  ) {
    return (
      <label className="input-field">
        <span className="input-label">{label} (memo+forwardRef)</span>
        <input ref={ref} className="input-control" placeholder={placeholder} />
      </label>
    )
  }),
)
