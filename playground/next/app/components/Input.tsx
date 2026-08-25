'use client'

export interface InputProps {
  id?: string
  name?: string
  type?: 'text' | 'email' | 'password' | 'search'
  label: string
  placeholder?: string
  value: string
  required?: boolean
  onChange: (value: string) => void
}

export function Input({
  id,
  name,
  type = 'text',
  label,
  placeholder,
  value,
  required = false,
  onChange,
}: InputProps) {
  const inputId = id || name || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <label htmlFor={inputId} className="input-field">
      <span className="input-label">{label}</span>
      <input
        id={inputId}
        name={name || inputId}
        type={type}
        placeholder={placeholder}
        value={value}
        required={required}
        className="input-control"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
