<script setup lang="ts">
import { computed } from 'vue'

interface ButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'default' | 'small'
}

const props = withDefaults(defineProps<ButtonProps>(), {
  variant: 'primary',
  size: 'default',
})

defineEmits<{
  click: []
}>()

const className = computed(() => [
  'btn',
  `btn-${props.variant}`,
  props.size === 'small' ? 'btn-small' : undefined,
])
</script>

<template>
  <button :class="className" @click="$emit('click')">
    <slot />
  </button>
</template>
