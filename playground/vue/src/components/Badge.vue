<script setup lang="ts">
interface BadgeProps {
  status: 'pending' | 'in-progress' | 'completed'
}

defineProps<BadgeProps>()
</script>

<template>
  <span class="task-card-status" :class="status">{{ status.replace('-', ' ') }}</span>
</template>
