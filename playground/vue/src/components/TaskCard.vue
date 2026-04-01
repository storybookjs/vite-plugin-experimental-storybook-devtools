<script setup lang="ts">
import Button from './Button.vue'
import Badge from './Badge.vue'

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

interface TaskCardProps {
  task: Task
  showAction?: boolean
}

defineProps<TaskCardProps>()

defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="task-card">
    <div class="task-card-header">
      <span class="task-card-title">{{ task.title }}</span>
      <Badge :status="task.status" />
    </div>
    <div class="task-card-meta">
      <span class="task-card-priority">
        <span class="task-card-priority-dot" :class="task.metadata.priority" />
        {{ task.metadata.priority }}
      </span>
      <span class="task-card-due">📅 {{ task.metadata.dueDate }}</span>
      <span>👤 {{ task.metadata.assignee.name }}</span>
    </div>
    <div v-if="showAction" style="margin-top: 0.75rem">
      <Button variant="secondary" size="small" @click="$emit('action')">
        View Details
      </Button>
    </div>
  </div>
</template>
