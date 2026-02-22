<script setup lang="ts">
interface HeaderProps {
  title: string
  userName: string
}

defineProps<HeaderProps>()
</script>

<template>
  <header class="header">
    <div class="header-title">
      <div class="header-title-icon" />
      {{ title }}
    </div>
    <div class="header-user">
      <span>{{ userName }}</span>
      <div class="header-avatar" />
    </div>
  </header>
</template>
