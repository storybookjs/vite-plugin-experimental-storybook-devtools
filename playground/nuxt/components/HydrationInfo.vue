<script setup lang="ts">
defineProps<{
  /** ISO timestamp initialized on the server and carried over in the Nuxt payload. */
  renderedAt: string
}>()
</script>

<!--
  Rendered on the server from payload-transferred state — the SSR +
  hydration path the shared SSR suite verifies: markup present in the raw
  payload, no hydration mismatch with instrumentation active, instance
  registered after hydration.
-->
<template>
  <aside class="hydration-info">
    Server-rendered at <time :datetime="renderedAt">{{ renderedAt }}</time>
  </aside>
</template>
