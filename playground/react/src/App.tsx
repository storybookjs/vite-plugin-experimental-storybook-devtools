import React, { useState } from 'react'
import { Header } from './components/Header'
import { Button } from './components/Button'
import { TaskCard, type Task } from './components/TaskCard'
import { TaskList } from './components/TaskList'
import { TaskForm, type TaskFormData } from './components/Form'
import { Modal } from './components/Modal'
import { PatternShowcase } from './components/patterns/PatternShowcase'

const initialTasks: Task[] = [
  {
    id: '1',
    title: 'Review component highlighter PR',
    status: 'in-progress',
    metadata: {
      priority: 'high',
      dueDate: 'Today',
      assignee: { name: 'Alice' },
    },
  },
  {
    id: '2',
    title: 'Write documentation for new features',
    status: 'pending',
    metadata: {
      priority: 'medium',
      dueDate: 'Tomorrow',
      assignee: { name: 'Bob' },
    },
  },
  {
    id: '3',
    title: 'Update dependencies to latest versions',
    status: 'completed',
    metadata: {
      priority: 'low',
      dueDate: 'Yesterday',
      assignee: { name: 'Charlie' },
    },
  },
]

export const App = () => {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [isModalOpen, setIsModalOpen] = useState(false)

  function handleAddTask(formData: TaskFormData) {
    const newTask: Task = {
      id: String(Date.now()),
      title: formData.title,
      status: formData.status,
      metadata: {
        priority: formData.priority,
        dueDate: formData.dueDate,
        assignee: { name: formData.assignee },
      },
    }

    setTasks((prev) => [newTask, ...prev])
    setIsModalOpen(false)
  }

  const inProgressCount = tasks.filter((t) => t.status === 'in-progress').length
  const completedCount = tasks.filter((t) => t.status === 'completed').length

  return (
    <div>
      {/* Header: simple component with no children */}
      <Header title="TaskFlow React" userName="John Doe" />

      <main className="dashboard">
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-title">My Tasks</h1>
            <p className="dashboard-subtitle">
              Track and manage your work
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Buttons: primary and secondary variants */}
            <Button variant="secondary">Filter</Button>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>
              + New Task
            </Button>
          </div>
        </div>

        {/* Non-component content */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{tasks.length}</div>
            <div className="stat-label">Total Tasks</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{inProgressCount}</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{completedCount}</div>
            <div className="stat-label">Completed</div>
          </div>
        </div>

        {/* TaskList: component with children */}
        <TaskList title="All Tasks" count={tasks.length}>
          {/* TaskCard: component with deep object props */}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onAction={() => alert(`Viewing: ${task.title}`)}
            />
          ))}

          <Button variant="secondary" onClick={() => alert('Load more!')}>
            Load more
          </Button>
        </TaskList>
      {/* All React authoring patterns (export styles, wrappers, class,
          generics, compound, prop kinds) — see docs/REACT_PATTERNS.md */}
      <PatternShowcase />
      </main>

      {/* Task Creation Modal */}
      <Modal
        isOpen={isModalOpen}
        title="Create New Task"
        onClose={() => setIsModalOpen(false)}
      >
        <TaskForm
          onSubmit={handleAddTask}
          onCancel={() => setIsModalOpen(false)}
        />
      </Modal>
    </div>
  )
}
