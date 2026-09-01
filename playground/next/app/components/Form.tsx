'use client'

import { useState, type FormEvent } from 'react'
import { Input } from './Input'
import { Select } from './Select'

export interface TaskFormData {
  title: string
  priority: 'high' | 'medium' | 'low'
  dueDate: string
  assignee: string
  status: 'pending' | 'in-progress' | 'completed'
}

export interface TaskFormProps {
  onSubmit: (data: TaskFormData) => void
  onCancel?: () => void
}

export function TaskForm({ onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [status, setStatus] = useState<string>('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    onSubmit({
      title,
      priority: priority as TaskFormData['priority'],
      dueDate,
      assignee,
      status: status as TaskFormData['status'],
    })

    // Reset form
    setTitle('')
    setPriority('')
    setDueDate('')
    setAssignee('')
    setStatus('')
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <Input
        label="Task Name"
        name="title"
        placeholder="Enter task title"
        value={title}
        required
        onChange={setTitle}
      />

      <Select
        label="Priority"
        name="priority"
        value={priority}
        required
        options={[
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ]}
        onChange={setPriority}
      />

      <Input
        label="Deadline"
        name="dueDate"
        type="text"
        placeholder="e.g., Today, Tomorrow, Feb 23"
        value={dueDate}
        required
        onChange={setDueDate}
      />

      <Input
        label="Assignee"
        name="assignee"
        placeholder="Enter assignee name"
        value={assignee}
        required
        onChange={setAssignee}
      />

      <Select
        label="Status"
        name="status"
        value={status}
        required
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'in-progress', label: 'In Progress' },
          { value: 'completed', label: 'Completed' },
        ]}
        onChange={setStatus}
      />

      <div className="task-form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          Add Task
        </button>
      </div>
    </form>
  )
}
