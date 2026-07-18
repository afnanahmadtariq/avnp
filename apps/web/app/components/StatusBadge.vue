<script setup lang="ts">
withDefaults(
  defineProps<{
    dot?: boolean;
    tone?: "neutral" | "success" | "live" | "warning" | "blue";
  }>(),
  {
    dot: true,
    tone: "neutral",
  },
);
</script>

<template>
  <span class="status-badge" :class="`status-badge--${tone}`">
    <span v-if="dot" aria-hidden="true" class="status-badge__dot" />
    <slot />
  </span>
</template>

<style scoped>
.status-badge {
  align-items: center;
  background: var(--relay-surface-muted);
  border: 1px solid transparent;
  border-radius: 999px;
  color: var(--relay-muted);
  display: inline-flex;
  font-size: 0.69rem;
  font-weight: 560;
  gap: 6px;
  line-height: 1;
  padding: 6px 8px;
  white-space: nowrap;
}

.status-badge__dot {
  background: currentColor;
  border-radius: 999px;
  height: 6px;
  width: 6px;
}

.status-badge--success {
  background: var(--relay-green-soft);
  color: var(--relay-green);
}

.status-badge--live {
  background: var(--relay-blue-soft);
  color: var(--relay-blue);
}

.status-badge--warning {
  background: var(--relay-amber-soft);
  color: var(--relay-amber);
}

.status-badge--blue {
  background: var(--relay-blue-soft);
  color: var(--relay-blue);
}
</style>
