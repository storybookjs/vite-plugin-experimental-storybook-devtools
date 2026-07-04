import React from 'react'

// PATTERN: member-expression wrapper form `React.memo(...)`
// (regression guard: previously only the bare `memo(...)` identifier was tagged)
export interface ReactMemoCardProps {
  title: string
  body: string
}

export const ReactMemoCard = React.memo(function ReactMemoCard({
  title,
  body,
}: ReactMemoCardProps) {
  return (
    <div className="task-card">
      <div className="task-card-header">
        <span className="task-card-title">{title}</span>
      </div>
      <div className="task-card-meta">{body} (React.memo)</div>
    </div>
  )
})
