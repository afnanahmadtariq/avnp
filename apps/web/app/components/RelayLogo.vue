<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
    inverse?: boolean;
  }>(),
  {
    compact: false,
    inverse: false,
  },
);
</script>

<template>
  <span class="relay-logo" :class="{ 'relay-logo--inverse': inverse }">
    <img
      alt=""
      aria-hidden="true"
      class="relay-logo__mark"
      height="29"
      src="/brand/relay-mark.svg"
      width="29"
    />
    <span v-if="!compact" class="relay-logo__word">Relay</span>
  </span>
</template>

<style scoped>
.relay-logo {
  align-items: center;
  display: inline-flex;
  gap: 10px;
  width: fit-content;
}

.relay-logo__mark {
  border-radius: 9px;
  display: block;
  flex: 0 0 auto;
  height: 29px;
  width: 29px;
}

.relay-logo__word {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.035em;
}

.relay-logo--inverse .relay-logo__word {
  color: #ffffff;
}
</style>
