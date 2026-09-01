'use client'

import type { ReactNode } from 'react'

export interface ButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'default' | 'small'
  onClick?: () => void
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'default',
  onClick,
  children,
}: ButtonProps) {
  const className = ['btn', `btn-${variant}`, size === 'small' && 'btn-small']
    .filter(Boolean)
    .join(' ')

  return (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  )
}
