'use client'

export interface BadgeProps {
  status: 'pending' | 'in-progress' | 'completed'
}

export function Badge({ status }: BadgeProps) {
  return (
    <span className={`task-card-status ${status}`}>
      {status.replace('-', ' ')}
    </span>
  )
}
