<script setup lang="ts">
withDefaults(
  defineProps<{
    compact?: boolean;
  }>(),
  {
    compact: false,
  },
);
</script>

<template>
  <span class="relay-logo">
    <img
      v-if="compact"
      alt=""
      aria-hidden="true"
      class="relay-logo__mark"
      height="29"
      src="/brand/relay-mark.svg"
      width="29"
    />
    <img
      v-else
      alt="Relay"
      class="relay-logo__lockup"
      height="32"
      src="/brand/relay-lockup.svg"
      width="114"
    />
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

.relay-logo__lockup {
  display: block;
  height: 32px;
  width: 114px;
}
</style>
