<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

import { useRequestWorkflow } from "../../composables/useRequestWorkflow";
import {
  isRequestStageAvailable,
  requestDestination,
  requestNextStage,
  requestStageLabel,
  type RequestStage,
} from "../../utils/request-navigation";

const props = defineProps<{ stage: RequestStage }>();
const route = useRoute();
const router = useRouter();
const { setCurrent } = useCurrentRequest();
const { loadJob } = useRequestWorkflow();
const ready = ref(false);
const pending = ref(true);
const loadError = ref("");
const recoveryDestination = ref("");
const recoveryLabel = ref("");
let resolutionSequence = 0;

const requestId = computed(() => {
  const value = route.params.id;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
});
const routeRunId = computed(() => {
  const value = route.query.run;
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
});
const requestKey = computed(
  () => `${props.stage}:${requestId.value}:${routeRunId.value}`,
);

async function resolveStage(): Promise<void> {
  const sequence = ++resolutionSequence;
  const id = requestId.value;
  ready.value = false;
  pending.value = true;
  loadError.value = "";
  recoveryDestination.value = "";
  recoveryLabel.value = "";

  if (!id) {
    loadError.value = "This request link is incomplete.";
    pending.value = false;
    return;
  }

  try {
    const job = await loadJob(id, { force: true });
    if (sequence !== resolutionSequence || !job) return;

    setCurrent(job.publicId, job.latestRunId ?? undefined);
    if (!isRequestStageAvailable(job, props.stage)) {
      const nextStage = requestNextStage(job);
      recoveryDestination.value = requestDestination(job);
      recoveryLabel.value = requestStageLabel(nextStage);
      pending.value = false;
      await router.replace(recoveryDestination.value);
      return;
    }

    ready.value = true;
  } catch (error: unknown) {
    if (sequence !== resolutionSequence) return;
    loadError.value =
      error instanceof Error
        ? error.message
        : "Relay could not open this request step.";
  } finally {
    if (sequence === resolutionSequence) pending.value = false;
  }
}

watch([requestId, routeRunId], () => void resolveStage(), { immediate: true });

onBeforeUnmount(() => {
  resolutionSequence += 1;
});
</script>

<template>
  <slot v-if="ready" :request-key="requestKey" />
  <main v-else id="main-content" class="request-stage-gate product-page">
    <section v-if="pending" aria-live="polite" class="request-stage-card">
      <span aria-hidden="true" class="request-stage-card__icon">…</span>
      <div>
        <h1>Opening your request</h1>
        <p>Relay is checking the current step and saved progress.</p>
      </div>
    </section>

    <section
      v-else-if="recoveryDestination"
      aria-live="polite"
      class="request-stage-card"
    >
      <span aria-hidden="true" class="request-stage-card__icon">→</span>
      <div>
        <h1>This step is not available yet</h1>
        <p>
          Your request has another action to complete first. Relay is taking you
          to the correct saved step.
        </p>
        <NuxtLink class="button button--blue" :to="recoveryDestination">
          {{ recoveryLabel }} <span aria-hidden="true">→</span>
        </NuxtLink>
      </div>
    </section>

    <section v-else class="request-stage-card" role="alert">
      <span aria-hidden="true" class="request-stage-card__icon">!</span>
      <div>
        <h1>Request unavailable</h1>
        <p>{{ loadError }}</p>
        <div class="request-stage-card__actions">
          <button
            class="button button--blue"
            type="button"
            @click="resolveStage"
          >
            Try again
          </button>
          <NuxtLink class="button button--secondary" to="/dashboard">
            View your requests
          </NuxtLink>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.request-stage-gate {
  margin: 0 auto;
  max-width: var(--relay-width-narrow);
  min-height: 100vh;
  padding: var(--relay-space-12) var(--relay-page-gutter) var(--relay-space-24);
}
.request-stage-card {
  align-items: flex-start;
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 16px;
  display: flex;
  gap: var(--relay-space-4);
  padding: var(--relay-space-6);
}
.request-stage-card__icon {
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
.request-stage-card h1 {
  font-size: var(--relay-text-section-title);
  margin: 0 0 var(--relay-space-2);
}
.request-stage-card p {
  color: var(--relay-muted);
  line-height: var(--relay-leading-control);
  margin: 0;
}
.request-stage-card .button,
.request-stage-card__actions {
  margin-top: var(--relay-space-5);
}
.request-stage-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--relay-space-2);
}
.request-stage-card__actions .button {
  margin-top: 0;
}
</style>
