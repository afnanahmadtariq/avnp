<script setup lang="ts">
interface NuxtErrorShape {
  message?: string;
  statusCode?: number;
  statusMessage?: string;
}

const props = defineProps<{ error: NuxtErrorShape }>();
const isNotFound = computed(() => props.error.statusCode === 404);

useSeoMeta({
  title: () =>
    `${isNotFound.value ? "Page not found" : "Something went wrong"} · Relay`,
});

function returnToRelay(): Promise<void> {
  return clearError({ redirect: "/dashboard" });
}
</script>

<template>
  <main id="main-content" class="error-page">
    <NuxtLink aria-label="Relay home" class="error-page__brand" to="/">
      <RelayLogo />
    </NuxtLink>
    <section class="error-card">
      <p>{{ error.statusCode ?? "Error" }}</p>
      <h1>
        {{ isNotFound ? "This page does not exist." : "Relay hit a problem." }}
      </h1>
      <span>
        {{
          isNotFound
            ? "The link may be outdated. Your requests are still available from the dashboard."
            : "Your data has not been changed. Return to Relay and try the action again."
        }}
      </span>
      <div>
        <button
          class="button button--blue"
          type="button"
          @click="returnToRelay"
        >
          Go to dashboard
        </button>
        <NuxtLink class="button button--secondary" to="/">Relay home</NuxtLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.error-page {
  background: var(--relay-canvas-app);
  min-height: 100vh;
  padding: var(--relay-space-8) var(--relay-page-gutter);
}
.error-page__brand {
  display: inline-block;
}
.error-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 18px;
  margin: 12vh auto 0;
  max-width: 620px;
  padding: clamp(28px, 5vw, 52px);
}
.error-card > p {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 var(--relay-space-3);
  text-transform: uppercase;
}
.error-card h1 {
  font-size: var(--relay-text-page-title);
  letter-spacing: -0.05em;
  margin: 0 0 var(--relay-space-3);
}
.error-card > span {
  color: var(--relay-muted);
  display: block;
  font-size: var(--relay-text-control);
  line-height: var(--relay-leading-control);
}
.error-card > div {
  display: flex;
  flex-wrap: wrap;
  gap: var(--relay-space-2);
  margin-top: var(--relay-space-6);
}
@media (max-width: 640px) {
  .error-page {
    padding: var(--relay-space-6) var(--relay-page-gutter-mobile);
  }
  .error-card {
    margin-top: 8vh;
  }
  .error-card > div {
    align-items: stretch;
    flex-direction: column;
  }
  .error-card .button {
    justify-content: center;
  }
}
</style>
