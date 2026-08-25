'use client'

import { Button } from './Button'
import { Badge } from './Badge'

export interface Task {
  id: string
  title: string
  status: 'pending' | 'in-progress' | 'completed'
  metadata: {
    priority: 'high' | 'medium' | 'low'
    dueDate: string
    assignee: {
      name: string
      avatar?: string
    }
  }
}

export interface TaskCardProps {
  task: Task
  onAction?: () => void
}

export function TaskCard({ task, onAction }: TaskCardProps) {
  const { title, status, metadata } = task
  const { priority, dueDate, assignee } = metadata

  return (
    <div className="task-card">
      <div className="task-card-header">
        <span className="task-card-title">{title}</span>
        <Badge status={status} />
      </div>
      <div className="task-card-meta">
        <span className="task-card-priority">
          <span className={`task-card-priority-dot ${priority}`} />
          {priority}
        </span>
        <span className="task-card-due">📅 {dueDate}</span>
        <span>👤 {assignee.name}</span>
      </div>
      {onAction && (
        <div style={{ marginTop: '0.75rem' }}>
          <Button variant="secondary" size="small" onClick={onAction}>
            View Details
          </Button>
        </div>
      )}
    </div>
  )
}
