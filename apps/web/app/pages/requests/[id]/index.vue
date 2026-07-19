<script setup lang="ts">
import type { JobDetail } from "~/types/api";

import { onMounted, ref } from "vue";

import { RelayApiError, useRelayApi } from "../../../composables/useRelayApi";

useSeoMeta({ title: "Opening request · Relay" });

const api = useRelayApi();
const route = useRoute();
const { setCurrent } = useCurrentRequest();
const pending = ref(true);
const loadError = ref("");
const notFound = ref(false);

function destination(job: JobDetail): string {
  const base = `/requests/${encodeURIComponent(job.publicId)}`;

  if (job.nextAction === "review_and_confirm") return `${base}/review`;
  if (["approve_and_start", "discover_businesses"].includes(job.nextAction)) {
    return `${base}/businesses`;
  }
  if (job.nextAction === "review_report") return `${base}/report`;
  if (job.nextAction === "start_over") return "/start";
  return `${base}/workspace`;
}

async function openRequest(): Promise<void> {
  pending.value = true;
  loadError.value = "";
  notFound.value = false;
  const routeId = Array.isArray(route.params.id)
    ? route.params.id[0]
    : route.params.id;

  if (!routeId) {
    notFound.value = true;
    loadError.value = "This request link is incomplete.";
    pending.value = false;
    return;
  }

  try {
    const job = await api.getJob(routeId);
    setCurrent(job.publicId, job.latestRunId ?? undefined);
    await navigateTo(destination(job), { replace: true });
  } catch (error: unknown) {
    notFound.value = error instanceof RelayApiError && error.statusCode === 404;
    loadError.value = notFound.value
      ? `Request ${routeId} was not found in your account.`
      : error instanceof Error
        ? error.message
        : "Relay could not open this request.";
  } finally {
    pending.value = false;
  }
}

onMounted(() => {
  void openRequest();
});
</script>

<template>
  <AppShell>
    <main id="main-content" class="request-resolver product-page">
      <section v-if="pending" aria-live="polite" class="resolver-card">
        <span aria-hidden="true" class="resolver-card__icon">…</span>
        <div>
          <h1>Opening your request</h1>
          <p>Relay is finding the correct next step.</p>
        </div>
      </section>
      <section v-else class="resolver-card" role="alert">
        <span aria-hidden="true" class="resolver-card__icon">!</span>
        <div>
          <h1>{{ notFound ? "Request not found" : "Request unavailable" }}</h1>
          <p>{{ loadError }}</p>
          <div class="resolver-card__actions">
            <NuxtLink class="button button--blue" to="/dashboard">
              View your requests
            </NuxtLink>
            <NuxtLink class="button button--secondary" to="/start">
              Start a new request
            </NuxtLink>
            <button
              v-if="!notFound"
              class="button button--secondary"
              type="button"
              @click="openRequest"
            >
              Try again
            </button>
          </div>
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
.request-resolver {
  margin: 0 auto;
  max-width: var(--relay-width-narrow);
  padding: var(--relay-space-12) var(--relay-page-gutter) var(--relay-space-24);
}
.resolver-card {
  align-items: flex-start;
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 16px;
  display: flex;
  gap: var(--relay-space-4);
  padding: var(--relay-space-6);
}
.resolver-card__icon {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 999px;
  color: var(--relay-blue);
  display: inline-flex;
  flex: 0 0 auto;
  font-weight: 700;
  height: 32px;
  justify-content: center;
  width: 32px;
}
.resolver-card h1 {
  font-size: var(--relay-text-section-title);
  margin: 0 0 var(--relay-space-2);
}
.resolver-card p {
  color: var(--relay-muted);
  line-height: var(--relay-leading-control);
  margin: 0;
}
.resolver-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--relay-space-2);
  margin-top: var(--relay-space-5);
}
@media (max-width: 640px) {
  .request-resolver {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .resolver-card__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .resolver-card__actions .button {
    justify-content: center;
  }
}
</style>
