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
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2 class="modal-title">{{ title }}</h2>
        <button
          type="button"
          class="modal-close"
          aria-label="Close modal"
          @click="$emit('close')"
        >
          ✕
        </button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
</template>
