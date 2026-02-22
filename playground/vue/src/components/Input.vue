<script setup lang="ts">
import { computed } from 'vue'

interface InputProps {
  id?: string
  name?: string
  type?: 'text' | 'email' | 'password' | 'search'
  label: string
  placeholder?: string
  value: string
  required?: boolean
}

const props = withDefaults(defineProps<InputProps>(), {
  type: 'text',
  required: false,
})

const emit = defineEmits<{
  'update:value': [value: string]
}>()

const inputId = computed(
  () => props.id || props.name || props.label.toLowerCase().replace(/\s+/g, '-'),
)
</script>

<template>
  <label :for="inputId" class="input-field">
    <span class="input-label">{{ label }}</span>
    <input
      :id="inputId"
      :name="name || inputId"
      :type="type"
      :placeholder="placeholder"
      :value="value"
      :required="required"
      class="input-control"
      @input="emit('update:value', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
