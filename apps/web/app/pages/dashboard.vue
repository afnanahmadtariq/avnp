<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import ApiFeedback from "../components/app/ApiFeedback.vue";
import type { JobSummary } from "../types/api";
import { formatCurrency } from "../utils/currency";

useSeoMeta({ title: "Dashboard · Relay" });

const api = useRelayApi();
const { currentRequest, setCurrent } = useRequestContext();
const { clearCurrent } = useCurrentRequest();
const jobs = ref<JobSummary[]>([]);
const pending = ref(true);
const loadError = ref("");

const activeJobs = computed(
  () =>
    jobs.value.filter(
      (job) => !["cancelled", "completed"].includes(job.status.toLowerCase()),
    ).length,
);
const verifiedSavings = computed(() =>
  jobs.value.reduce((total, job) => total + (job.savingsCents ?? 0), 0),
);
const actionRequired = computed(
  () =>
    jobs.value.filter((job) =>
      [
        "approve_and_start",
        "discover_businesses",
        "review_and_confirm",
        "review_report",
      ].includes(job.nextAction),
    ).length,
);

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(
  job: JobSummary,
): "blue" | "live" | "neutral" | "success" | "warning" {
  const stage = job.stage.toLowerCase();

  if (stage === "completed") return "success";
  if (["calling", "comparing", "discovering", "queued"].includes(stage)) {
    return "live";
  }
  if (["draft", "failed", "paused"].includes(stage)) return "warning";
  if (stage === "ready") return "blue";
  return "neutral";
}

function stageNumber(job: JobSummary): number {
  const stage = job.stage.toLowerCase();

  if (["completed", "partially_completed"].includes(stage)) return 4;
  if (["calling", "comparing", "paused", "queued"].includes(stage)) return 3;
  if (["discovering", "ready"].includes(stage)) return 2;
  return 1;
}

function nextActionCopy(job: JobSummary): string {
  const copy: Record<string, string> = {
    approve_and_start: "Approve at least three businesses and start calls.",
    discover_businesses: "Review the matched businesses for this brief.",
    follow_run:
      "Relay is handling calls. Open the workspace for live progress.",
    review_and_confirm:
      "Review and confirm the exact brief before calls begin.",
    review_report: "Your comparison is ready for a final decision.",
    resume_or_cancel:
      "Calls are paused. Open the workspace to choose what happens next.",
  };

  return copy[job.nextAction] ?? "Open this request to continue.";
}

function jobRoute(job: JobSummary): string {
  const base = `/requests/${encodeURIComponent(job.publicId)}`;

  if (job.nextAction === "review_and_confirm") return `${base}/review`;
  if (["approve_and_start", "discover_businesses"].includes(job.nextAction)) {
    return `${base}/businesses`;
  }
  if (job.nextAction === "review_report") return `${base}/report`;
  return `${base}/workspace`;
}

function formattedDate(value: string | null): string {
  if (!value) return "Date not set";

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
}

function updatedLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently updated"
    : `Updated ${new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
      }).format(date)}`;
}

async function loadJobs(): Promise<void> {
  pending.value = true;
  loadError.value = "";

  try {
    const response = await api.getJobs();
    jobs.value = response.items;
    const currentStillExists = jobs.value.some(
      (job) => job.publicId === currentRequest.value.publicId,
    );
    if (!currentStillExists && jobs.value[0]) {
      setCurrent(jobs.value[0].publicId);
    } else if (jobs.value.length === 0) {
      clearCurrent();
    }
  } catch (error: unknown) {
    loadError.value =
      error instanceof Error
        ? error.message
        : "Relay could not load your requests.";
    jobs.value = [];
  } finally {
    pending.value = false;
  }
}

function selectJob(job: JobSummary): void {
  setCurrent(job.publicId);
}

onMounted(loadJobs);
</script>

<template>
  <AppShell>
    <main id="main-content" class="dashboard-page product-page">
      <header class="product-page-header">
        <div>
          <p class="product-kicker">Your Relay workspace</p>
          <h1>Welcome back.</h1>
          <p>Keep an eye on your active negotiation or start something new.</p>
        </div>
        <NuxtLink class="button button--blue" to="/start"
          >New request <span aria-hidden="true">＋</span></NuxtLink
        >
      </header>

      <ApiFeedback :message="loadError" :pending="pending" @retry="loadJobs" />

      <section
        v-if="!pending && !loadError"
        aria-label="Relay summary"
        class="summary-grid"
      >
        <article class="summary-card">
          <span>Active requests</span><strong>{{ activeJobs }}</strong
          ><small>{{ jobs.length }} total requests</small>
        </article>
        <article class="summary-card">
          <span>Verified savings</span
          ><strong>{{ formatCurrency(verifiedSavings / 100) }}</strong
          ><small>Across API-backed offers</small>
        </article>
        <article class="summary-card">
          <span>Ready for you</span><strong>{{ actionRequired }}</strong
          ><small>Requests needing a decision</small>
        </article>
      </section>

      <section v-if="!pending && !loadError" class="dashboard-section">
        <div class="dashboard-section__heading">
          <div>
            <h2>Your requests</h2>
            <p>Every request from intake to final decision.</p>
          </div>
          <StatusBadge :dot="false" tone="blue"
            >{{ activeJobs }} active</StatusBadge
          >
        </div>
        <div v-if="jobs.length > 0" class="request-list">
          <article v-for="job in jobs" :key="job.publicId" class="request-card">
            <div class="request-card__main">
              <div class="request-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 18h16M6 18V9h12v9M5 9l2-5h10l2 5M9 12h6" />
                </svg>
              </div>
              <div>
                <div class="request-card__status">
                  <StatusBadge :tone="statusTone(job)">
                    {{ titleCase(job.stage) }}
                  </StatusBadge>
                  <span>{{ updatedLabel(job.updatedAt) }}</span>
                </div>
                <h3>{{ job.title }}</h3>
                <p>
                  {{ job.route.pickup }} <span aria-hidden="true">→</span>
                  {{ job.route.destination }} ·
                  {{ formattedDate(job.movingDate) }}
                </p>
                <div class="request-card__next">
                  <span aria-hidden="true" />
                  <p>
                    <strong>{{ titleCase(job.nextAction) }}.</strong>
                    {{ nextActionCopy(job) }}
                  </p>
                </div>
              </div>
            </div>
            <div class="request-card__progress">
              <div>
                <span>Progress</span>
                <strong>{{ stageNumber(job) }} of 4 stages</strong>
              </div>
              <div class="dashboard-progress">
                <span :style="{ width: `${stageNumber(job) * 25}%` }" />
              </div>
              <small>{{ titleCase(job.status) }}</small>
            </div>
            <div class="request-card__result">
              <span>Best current offer</span>
              <strong>
                {{
                  typeof job.bestOfferCents === "number"
                    ? formatCurrency(job.bestOfferCents / 100)
                    : "Pending"
                }}
              </strong>
              <small>
                {{
                  typeof job.savingsCents === "number"
                    ? `${formatCurrency(job.savingsCents / 100)} verified savings`
                    : "Awaiting comparable quotes"
                }}
              </small>
            </div>
            <NuxtLink
              :aria-label="`Open ${job.title}`"
              class="request-card__open"
              :to="jobRoute(job)"
              @click="selectJob(job)"
              >Open <span aria-hidden="true">→</span></NuxtLink
            >
          </article>
        </div>
        <div v-else class="empty-state">
          <h3>No requests yet</h3>
          <p>Create a brief and Relay will keep every stage visible here.</p>
          <NuxtLink class="button button--blue" to="/start"
            >Create your first request</NuxtLink
          >
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
.dashboard-page {
  margin: 0 auto;
  max-width: var(--relay-width-standard);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.product-page-header {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 34px;
}
.product-kicker {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin-bottom: 9px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.product-page-header h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 550;
  letter-spacing: -0.055em;
  margin-bottom: 7px;
}
.product-page-header p:last-child {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  margin: 0;
}
.summary-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, 1fr);
  margin-bottom: 38px;
}
.summary-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 14px;
  display: grid;
  gap: 6px;
  padding: 20px;
}
.summary-card span,
.summary-card small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
}
.summary-card strong {
  font-size: 1.7rem;
  font-weight: 540;
  letter-spacing: -0.04em;
}
.summary-card small {
  color: var(--relay-muted);
}
.dashboard-section__heading {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 14px;
}
.dashboard-section__heading h2 {
  font-size: var(--relay-text-section-title);
  font-weight: 620;
  line-height: var(--relay-leading-heading);
  margin-bottom: 5px;
}
.dashboard-section__heading p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  margin: 0;
}
.request-list {
  display: grid;
  gap: var(--relay-space-3);
}
.request-card {
  align-items: center;
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 16px;
  display: grid;
  gap: 22px;
  grid-template-columns:
    minmax(250px, 1.4fr) minmax(190px, 0.8fr) minmax(130px, 0.55fr)
    auto;
  padding: 20px;
}
.request-card__main {
  align-items: center;
  display: flex;
  gap: 14px;
}
.request-icon {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 12px;
  display: flex;
  flex: 0 0 auto;
  height: 44px;
  justify-content: center;
  width: 44px;
}
.request-icon svg {
  fill: none;
  height: 23px;
  stroke: var(--relay-blue);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  width: 23px;
}
.request-card__status {
  align-items: center;
  display: flex;
  gap: 8px;
}
.request-card__status > span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.request-card h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 10px 0 5px;
}
.request-card p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.request-card p span {
  color: var(--relay-blue);
}
.request-card__progress {
  display: grid;
  gap: 6px;
}
.request-card__progress > div:first-child {
  display: flex;
  font-size: var(--relay-text-meta);
  justify-content: space-between;
}
.request-card__progress span,
.request-card__progress small {
  color: var(--relay-faint);
}
.request-card__progress strong {
  font-weight: 600;
}
.dashboard-progress {
  background: #eceef2;
  border-radius: 99px;
  height: 5px;
  overflow: hidden;
}
.dashboard-progress span {
  background: var(--relay-blue);
  border-radius: inherit;
  display: block;
  height: 100%;
  width: 74%;
}
.request-card__progress small {
  font-size: var(--relay-text-meta);
}
.request-card__result {
  display: grid;
  gap: 4px;
}
.request-card__result span,
.request-card__result small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.request-card__result strong {
  font-size: 1.15rem;
  font-weight: 600;
}
.request-card__result small {
  color: var(--relay-green);
}
.request-card__open {
  align-items: center;
  background: var(--relay-ink);
  border-radius: 9px;
  color: white;
  display: flex;
  font-size: var(--relay-text-control);
  font-weight: 600;
  gap: 7px;
  min-height: 44px;
  padding: 0 13px;
}
.request-card__next {
  align-items: flex-start;
  display: flex;
  gap: var(--relay-space-2);
  margin-top: var(--relay-space-3);
}
.request-card__next > span {
  background: var(--relay-green);
  border-radius: 999px;
  flex: 0 0 auto;
  height: 7px;
  margin-top: 7px;
  width: 7px;
}
.request-card__next p {
  margin: 0;
}
.request-card__next strong {
  color: var(--relay-ink);
  font-weight: 620;
}
.empty-state {
  align-items: center;
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  min-height: 240px;
  padding: var(--relay-space-8);
  text-align: center;
}
.empty-state h3 {
  font-size: var(--relay-text-card-title);
  margin: auto 0 var(--relay-space-2);
}
.empty-state p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  margin: 0 0 var(--relay-space-5);
}
.empty-state .button {
  margin-bottom: auto;
}
@media (max-width: 1024px) {
  .request-card {
    grid-template-columns: 1fr 1fr;
  }
  .request-card__open {
    justify-self: end;
  }
  .request-card__result {
    justify-self: end;
  }
}
@media (max-width: 640px) {
  .dashboard-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .product-page-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
  }
  .summary-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
    overflow-x: auto;
  }
  .request-card {
    grid-template-columns: 1fr;
  }
  .request-card__result,
  .request-card__open {
    justify-self: stretch;
  }
  .request-card__open {
    justify-content: center;
  }
}
</style>
