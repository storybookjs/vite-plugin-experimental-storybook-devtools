'use client'

export interface SelectProps {
  id?: string
  name?: string
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  required?: boolean
  onChange: (value: string) => void
}

export function Select({
  id,
  name,
  label,
  value,
  options,
  required = false,
  onChange,
}: SelectProps) {
  const selectId = id || name || label.toLowerCase().replace(/\s+/g, '-')

  return (
    <label htmlFor={selectId} className="input-field">
      <span className="input-label">{label}</span>
      <select
        id={selectId}
        name={name || selectId}
        value={value}
        required={required}
        className="select-control"
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select {label.toLowerCase()}...</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
