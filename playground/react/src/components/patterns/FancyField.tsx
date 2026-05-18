import React, { forwardRef } from 'react'

// PATTERN: React.forwardRef wrapper, bare `forwardRef(...)` form
// PROP: ref forwarding + optional defaultValue
export interface FancyFieldProps {
  label: string
  defaultValue?: string
  placeholder?: string
}

export const FancyField = forwardRef<HTMLInputElement, FancyFieldProps>(
  function FancyField({ label, defaultValue, placeholder }, ref) {
    return (
      <label className="input-field">
        <span className="input-label">{label} (forwardRef)</span>
        <input
          ref={ref}
          className="input-control"
          defaultValue={defaultValue}
          placeholder={placeholder}
        />
      </label>
    )
  },
)
