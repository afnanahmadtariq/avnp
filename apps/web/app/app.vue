<script setup lang="ts">
import { nextTick, watch } from "vue";

const route = useRoute();

watch(
  () => route.fullPath,
  async () => {
    if (!import.meta.client || route.hash) return;

    await nextTick();
    const main = document.querySelector<HTMLElement>("#main-content");
    main?.setAttribute("tabindex", "-1");
    main?.focus({ preventScroll: true });
  },
);
</script>

<template>
  <div>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <NuxtRouteAnnouncer />
    <NuxtLoadingIndicator color="#3157f6" :height="2" />
    <NuxtPage />
  </div>
</template>
