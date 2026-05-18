import React, { memo } from 'react'

// PATTERN: React.memo wrapper, bare `memo(...)` form, named inner function
export interface MemoStatProps {
  label: string
  value: number
}

export const MemoStat = memo(function MemoStat({
  label,
  value,
}: MemoStatProps) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label} (memo)</div>
    </div>
  )
})
