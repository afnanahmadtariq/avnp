<script setup lang="ts">
defineProps<{
  message: string;
  pending?: boolean;
}>();

defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div v-if="pending || message" class="api-feedback" role="status">
    <span aria-hidden="true" class="api-feedback__icon">
      {{ pending ? "…" : "!" }}
    </span>
    <p>{{ pending ? "Loading the latest Relay data…" : message }}</p>
    <button v-if="!pending" type="button" @click="$emit('retry')">
      Try again
    </button>
  </div>
</template>

<style scoped>
.api-feedback {
  align-items: center;
  background: var(--relay-surface);
  border: 1px solid var(--relay-line);
  border-radius: 12px;
  display: flex;
  font-size: var(--relay-text-control, 0.875rem);
  gap: 12px;
  margin-bottom: 20px;
  padding: 14px 16px;
}

.api-feedback__icon {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 999px;
  color: var(--relay-blue);
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 700;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.api-feedback p {
  flex: 1;
  margin: 0;
}

.api-feedback button {
  background: transparent;
  border: 0;
  color: var(--relay-blue);
  font-weight: 650;
  padding: 8px;
}

@media (max-width: 640px) {
  .api-feedback {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .api-feedback button {
    margin-left: 40px;
  }
}
</style>
