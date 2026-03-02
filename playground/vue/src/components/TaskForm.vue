<script setup lang="ts">
import { computed, useAttrs, ref } from 'vue'
import Input from './Input.vue'
import Select from './Select.vue'

export interface TaskFormData {
  title: string
  priority: 'high' | 'medium' | 'low'
  dueDate: string
  assignee: string
  status: 'pending' | 'in-progress' | 'completed'
}

const emit = defineEmits<{
  submit: [data: TaskFormData]
  cancel: []
}>()

const attrs = useAttrs()
const hasCancelListener = computed(() => Boolean(attrs.onCancel))

const title = ref('')
const priority = ref('')
const dueDate = ref('')
const assignee = ref('')
const status = ref('')

function handleSubmit() {
  emit('submit', {
    title: title.value,
    priority: priority.value as TaskFormData['priority'],
    dueDate: dueDate.value,
    assignee: assignee.value,
    status: status.value as TaskFormData['status'],
  })

  title.value = ''
  priority.value = ''
  dueDate.value = ''
  assignee.value = ''
  status.value = ''
}
</script>

<template>
  <form class="task-form" @submit.prevent="handleSubmit">
    <Input
      label="Task Name"
      name="title"
      placeholder="Enter task title"
      :value="title"
      required
      @update:value="title = $event"
    />

    <Select
      label="Priority"
      name="priority"
      :value="priority"
      required
      :options="[
        { value: 'high', label: 'High' },
        { value: 'medium', label: 'Medium' },
        { value: 'low', label: 'Low' },
      ]"
      @update:value="priority = $event"
    />

    <Input
      label="Deadline"
      name="dueDate"
      type="text"
      placeholder="e.g., Today, Tomorrow, Feb 23"
      :value="dueDate"
      required
      @update:value="dueDate = $event"
    />

    <Input
      label="Assignee"
      name="assignee"
      placeholder="Enter assignee name"
      :value="assignee"
      required
      @update:value="assignee = $event"
    />

    <Select
      label="Status"
      name="status"
      :value="status"
      required
      :options="[
        { value: 'pending', label: 'Pending' },
        { value: 'in-progress', label: 'In Progress' },
        { value: 'completed', label: 'Completed' },
      ]"
      @update:value="status = $event"
    />

    <div class="task-form-actions">
      <button
        v-if="hasCancelListener"
        type="button"
        class="btn btn-secondary"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button type="submit" class="btn btn-primary">Add Task</button>
    </div>
  </form>
</template>
