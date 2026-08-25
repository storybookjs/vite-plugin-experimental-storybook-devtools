'use client'

import type { ReactNode } from 'react'

export interface TaskListProps {
  title: string
  count?: number
  children: ReactNode
}

export function TaskList({ title, count, children }: TaskListProps) {
  return (
    <section className="task-list">
      <div className="task-list-header">
        <h2 className="task-list-title">{title}</h2>
        {count !== undefined && (
          <span className="task-list-count">{count} tasks</span>
        )}
      </div>
      {children}
    </section>
  )
}
