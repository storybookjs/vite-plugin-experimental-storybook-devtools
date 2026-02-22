<script setup lang="ts">
import { computed } from 'vue'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id?: string
  name?: string
  label: string
  value: string
  options: SelectOption[]
  required?: boolean
}

const props = withDefaults(defineProps<SelectProps>(), {
  required: false,
})

const emit = defineEmits<{
  'update:value': [value: string]
}>()

const selectId = computed(
  () => props.id || props.name || props.label.toLowerCase().replace(/\s+/g, '-'),
)
</script>

<template>
  <label :for="selectId" class="input-field">
    <span class="input-label">{{ label }}</span>
    <select
      :id="selectId"
      :name="name || selectId"
      :value="value"
      :required="required"
      class="select-control"
      @change="emit('update:value', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">Select {{ label.toLowerCase() }}...</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
