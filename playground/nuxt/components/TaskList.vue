<script setup lang="ts">
interface TaskListProps {
  title: string
  count?: number
}

defineProps<TaskListProps>()
</script>

<template>
  <section class="task-list">
    <div class="task-list-header">
      <h2 class="task-list-title">{{ title }}</h2>
      <span v-if="count !== undefined" class="task-list-count">{{ count }} tasks</span>
    </div>
    <slot />
  </section>
</template>
