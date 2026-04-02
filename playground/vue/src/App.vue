<script setup lang="ts">
import { computed, ref } from 'vue'
import Header from './components/Header.vue'
import Button from './components/Button.vue'
import TaskCard, { type Task } from './components/TaskCard.vue'
import TaskList from './components/TaskList.vue'
import TaskForm, { type TaskFormData } from './components/TaskForm.vue'
import Modal from './components/Modal.vue'

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

const tasks = ref<Task[]>(initialTasks)
const isModalOpen = ref(false)

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

  tasks.value = [newTask, ...tasks.value]
  isModalOpen.value = false
}

function handleViewTask(title: string) {
  alert(`Viewing: ${title}`)
}

function handleLoadMore() {
  alert('Load more!')
}

const inProgressCount = computed(
  () => tasks.value.filter((task) => task.status === 'in-progress').length,
)
const completedCount = computed(
  () => tasks.value.filter((task) => task.status === 'completed').length,
)
</script>

<template>
  <div>
    <Header title="TaskFlow Vue" user-name="John Doe" />

    <main class="dashboard">
      <div class="dashboard-header">
        <div>
          <h1 class="dashboard-title">My Tasks</h1>
          <p class="dashboard-subtitle">Track and manage your work</p>
        </div>
        <div style="display: flex; gap: 0.5rem">
          <Button variant="secondary">Filter</Button>
          <Button variant="primary" @click="isModalOpen = true">+ New Task</Button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ tasks.length }}</div>
          <div class="stat-label">Total Tasks</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ inProgressCount }}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ completedCount }}</div>
          <div class="stat-label">Completed</div>
        </div>
      </div>

      <TaskList title="All Tasks" :count="tasks.length">
        <TaskCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          show-action
          @action="handleViewTask(task.title)"
        />

        <Button variant="secondary" @click="handleLoadMore">Load more</Button>
      </TaskList>
    </main>

    <Modal
      :is-open="isModalOpen"
      title="Create New Task"
      @close="isModalOpen = false"
    >
      <TaskForm show-cancel @submit="handleAddTask" @cancel="isModalOpen = false" />
    </Modal>
  </div>
</template>
