<script setup lang="ts">
interface ModalProps {
  isOpen: boolean
  title: string
}

defineProps<ModalProps>()

defineEmits<{
  close: []
}>()
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="$emit('close')">
    <div class="modal" @click.stop>
      <div class="modal-header">
        <h2 class="modal-title">{{ title }}</h2>
        <button class="modal-close" type="button" @click="$emit('close')">
          x
        </button>
      </div>
      <slot />
    </div>
  </div>
</template>
