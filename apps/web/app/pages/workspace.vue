<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import ApiFeedback from "../components/app/ApiFeedback.vue";
import WorkspaceQuoteComparison from "../components/workspace/QuoteComparison.vue";
import { useRelayApi } from "../composables/useRelayApi";
import { useRequestContext } from "../composables/useRequestContext";
import { useDecisionSelection } from "../composables/useDecisionSelection";
import type { Negotiation, NegotiationTone, Quote } from "../data/demo";
import type {
  JobDetail,
  RunCall,
  RunEvent,
  RunQuote,
  RunSnapshot,
} from "../types/api";
import { formatCurrency } from "../utils/currency";
import { evidencePointLabel, evidenceSupportCopy } from "../utils/evidence";

useSeoMeta({
  description:
    "Follow Relay calls, evidence, offers, and the recommendation for your confirmed brief.",
  robots: "noindex, nofollow",
  title: "Negotiation workspace · Relay",
});

const { publicId, runId, setCurrent } = useRequestContext();
const activeNegotiationId = ref("");
const callsPaused = ref(false);
const apiError = ref("");
const apiPending = ref(true);
const controlPending = ref(false);
const decisionPending = ref(false);
const evidencePendingId = ref("");
const job = ref<JobDetail>();
const run = ref<RunSnapshot>();
const runEvents = ref<RunEvent[]>([]);
const { decisionSaved, markDecisionSaved, selectedQuoteId, selectQuote } =
  useDecisionSelection();
let pollTimer: number | undefined;
let pollPending = false;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function callTone(call: RunCall): NegotiationTone {
  if (call.status === "completed") return "complete";
  if (["dialing", "in_progress", "negotiating"].includes(call.status)) {
    return "live";
  }
  return "received";
}

function callStatus(call: RunCall): string {
  const labels: Record<string, string> = {
    cancelled: "Call cancelled",
    completed:
      call.outcome === "quote_received" ? "Quote received" : "Complete",
    dialing: "Dialing",
    failed: "Call failed",
    in_progress: "Gathering details",
    negotiating: "Negotiating live",
    queued: "Queued",
  };

  return labels[call.status] ?? call.status.replaceAll("_", " ");
}

function transcriptEntries(call: RunCall): Negotiation["transcript"] {
  const lines = call.transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines.length > 0 ? lines : ["Relay: Waiting for transcript updates."]
  ).map((line, index) => {
    const businessLine = /^business:/i.test(line);

    return {
      at: `00:${String(index + 1).padStart(2, "0")}`,
      speaker: businessLine ? ("Business" as const) : ("Relay" as const),
      text: line.replace(/^(relay|business):\s*/i, ""),
    };
  });
}

function mapCall(call: RunCall): Negotiation {
  const evidence =
    call.evidenceItems?.map((item) => ({
      accessible: item.available,
      detail: "Saved with this negotiation for review.",
      id: item.id,
      label: item.label,
      source: "Verified call record",
    })) ??
    call.evidence.map((item, index) => ({
      accessible: false,
      detail: "Saved with this negotiation for review.",
      id: `${call.id}-evidence-${index}`,
      label: item,
      source: "Verified call record",
    }));

  return {
    id: call.id,
    company: call.businessName,
    initials: initials(call.businessName),
    status: callStatus(call),
    tone: callTone(call),
    initialOffer: (call.initialOfferCents ?? call.currentOfferCents ?? 0) / 100,
    currentOffer: (call.currentOfferCents ?? call.initialOfferCents ?? 0) / 100,
    progress: call.progress,
    lastUpdate: call.status === "completed" ? "Complete" : "Just now",
    strategy:
      call.status === "negotiating"
        ? "Comparable price and terms"
        : "Verified itemization",
    summary:
      call.outcome === "quote_received"
        ? "Relay confirmed the price and requested the same itemized scope used for every business."
        : "Relay is keeping the confirmed scope fixed while it gathers a structured outcome.",
    transcript: transcriptEntries(call),
    evidence,
  };
}

function mapQuote(quote: RunQuote, recommendedQuoteId?: string): Quote {
  return {
    id: quote.id,
    company: quote.businessName,
    total: quote.totalCents / 100,
    initialTotal: (quote.originalTotalCents ?? quote.totalCents) / 100,
    rating: quote.rating ?? 0,
    reviewCount: quote.reviewCount ?? 0,
    arrival: quote.arrivalWindow ?? "Confirmed with business",
    deposit:
      quote.depositCents === undefined
        ? "Not confirmed"
        : `${Math.round((quote.depositCents / quote.totalCents) * 100)}%`,
    duration: quote.estimatedDuration ?? "Confirmed scope",
    included:
      quote.inclusions.length > 0
        ? quote.inclusions
        : ["Confirmed moving scope"],
    fees: [{ label: "All-in quoted total", amount: quote.totalCents / 100 }],
    evidenceCount: quote.evidenceCount,
    score: quote.score ?? Math.round(quote.confidence * 100),
    ...(quote.id === recommendedQuoteId ? { recommended: true } : {}),
  };
}

const moveBrief = computed(() => {
  const detail = job.value;

  if (!detail) {
    return {
      access: "",
      budget: 0,
      date: "",
      destination: "",
      home: "",
      id: publicId.value,
      inventory: "",
      notes: "",
      pickup: "",
      route: "",
      title: "",
      window: "",
    };
  }

  const specification = detail.draft;
  return {
    id: detail.publicId,
    title: detail.title,
    pickup: specification.pickupAddress.formattedAddress,
    destination: specification.dropoffAddress.formattedAddress,
    route: `${specification.pickupAddress.formattedAddress} → ${specification.dropoffAddress.formattedAddress}`,
    date: new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
      new Date(`${specification.movingDate}T12:00:00`),
    ),
    window: "Confirmed with each business",
    budget: (specification.budget?.amountMinor ?? 0) / 100,
    home: `${specification.bedrooms}-bedroom move`,
    access: specification.hasElevator
      ? "Elevator access confirmed"
      : "Stair access confirmed",
    inventory: specification.inventory
      .map((item) => `${item.quantity} ${item.name}`)
      .join(" · "),
    notes: specification.notes ?? "No additional notes.",
  };
});

const negotiations = computed<Negotiation[]>(() =>
  run.value?.calls.length ? run.value.calls.map(mapCall) : [],
);

const recommendationQuoteId = computed(() => {
  const best = [...(run.value?.quotes ?? [])].sort(
    (left, right) => (right.score ?? 0) - (left.score ?? 0),
  )[0];
  return best?.id;
});

const quotes = computed<Quote[]>(() =>
  run.value?.quotes.length
    ? run.value.quotes.map((quote) =>
        mapQuote(quote, recommendationQuoteId.value),
      )
    : [],
);

const recommendation = computed(() => {
  const quote = quotes.value.find(
    (candidate) => candidate.id === recommendationQuoteId.value,
  );

  if (!run.value || !quote) {
    return {
      confidence: 0,
      headline: "",
      quoteId: "",
      rationale: [] as string[],
      savings: 0,
    };
  }

  return {
    quoteId: quote.id,
    savings: Math.max(0, quote.initialTotal - quote.total),
    confidence: quote.score,
    headline: `${quote.company} is the strongest verified value`,
    rationale: [
      "The confirmed scope is consistent across businesses",
      evidenceSupportCopy(quote.evidenceCount, "this offer"),
      "Unknown fees remain visible rather than becoming zero",
      "The recommendation uses price, completeness, confidence, and risk",
    ],
  };
});

const sessionActivity = computed(() =>
  runEvents.value.length
    ? runEvents.value.slice(0, 5).map((event) => ({
        at: new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(event.at)),
        label: event.message,
        company: event.callId ? "Call update" : "Relay",
      }))
    : [],
);

const activeNegotiation = computed(
  () =>
    negotiations.value.find(
      (negotiation) => negotiation.id === activeNegotiationId.value,
    ) ?? negotiations.value[0],
);

const recommendedQuote = computed(
  () =>
    quotes.value.find((quote) => quote.id === recommendation.value.quoteId) ??
    quotes.value[0],
);

const selectedQuote = computed(
  () =>
    quotes.value.find((quote) => quote.id === selectedQuoteId.value) ??
    recommendedQuote.value,
);

const completedCalls = computed(
  () =>
    negotiations.value.filter((negotiation) => negotiation.progress === 100)
      .length,
);
const verifiedEvidenceCount = computed(() =>
  negotiations.value.reduce(
    (total, negotiation) => total + negotiation.evidence.length,
    0,
  ),
);
const runComplete = computed(() =>
  ["cancelled", "completed", "failed", "partially_completed"].includes(
    run.value?.status ?? "",
  ),
);
const reportReady = computed(() =>
  ["completed", "partially_completed"].includes(run.value?.status ?? ""),
);
const terminalStatusLabel = computed(() => {
  if (run.value?.status === "cancelled") return "Run cancelled";
  if (run.value?.status === "failed") return "Run needs attention";
  return "Report ready";
});

function clearWorkspacePoll(): void {
  if (pollTimer !== undefined) {
    window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}

function scheduleWorkspacePoll(): void {
  clearWorkspacePoll();
  if (
    !run.value ||
    runComplete.value ||
    document.visibilityState === "hidden"
  ) {
    return;
  }

  pollTimer = window.setTimeout(() => {
    void refreshWorkspace();
  }, 4_000);
}

async function refreshWorkspace(): Promise<void> {
  if (pollPending || runComplete.value) return;

  pollPending = true;
  try {
    await loadWorkspace(true);
  } finally {
    pollPending = false;
    scheduleWorkspacePoll();
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    clearWorkspacePoll();
  } else if (run.value && !runComplete.value) {
    void refreshWorkspace();
  }
}
const reportLink = computed(() => {
  const query = run.value?.id ? `?run=${encodeURIComponent(run.value.id)}` : "";

  return `/requests/${encodeURIComponent(publicId.value)}/report${query}`;
});

watch(
  negotiations,
  (items) => {
    if (!items.some((item) => item.id === activeNegotiationId.value)) {
      activeNegotiationId.value = items[0]?.id ?? "";
    }
  },
  { immediate: true },
);

watch(runComplete, (complete) => {
  if (complete) clearWorkspacePoll();
});

async function loadWorkspace(silent = false): Promise<void> {
  if (!silent) {
    apiPending.value = true;
    job.value = undefined;
    run.value = undefined;
    runEvents.value = [];
  }
  apiError.value = "";

  try {
    const api = useRelayApi();
    const loadedJob = await api.getJob(publicId.value);
    const resolvedRunId = runId.value ?? loadedJob.latestRunId;

    job.value = loadedJob;

    if (!resolvedRunId) {
      apiError.value = "This request does not have a negotiation run yet.";
      return;
    }

    const [loadedRun, loadedEvents] = await Promise.all([
      api.getRun(resolvedRunId),
      api.getEvents(resolvedRunId),
    ]);

    if (loadedRun.jobPublicId !== loadedJob.publicId) {
      throw new Error(
        "This negotiation run belongs to a different request. Open the request from the dashboard and try again.",
      );
    }

    run.value = loadedRun;
    runEvents.value = loadedEvents.items;
    callsPaused.value = loadedRun.paused;
    if (loadedRun.decision?.quoteId) {
      markDecisionSaved(loadedRun.decision.quoteId);
    }
    setCurrent(loadedJob.publicId, loadedRun.id);
  } catch (error: unknown) {
    if (!silent) {
      apiError.value =
        error instanceof Error
          ? error.message
          : "Relay could not load the negotiation run.";
    }
  } finally {
    apiPending.value = false;
  }
}

async function toggleCalls(): Promise<void> {
  const nextPaused = !callsPaused.value;
  callsPaused.value = nextPaused;

  if (!run.value || controlPending.value) return;

  controlPending.value = true;
  apiError.value = "";

  try {
    const updated = await useRelayApi().updateRun(
      run.value.id,
      nextPaused ? "pause" : "resume",
    );
    run.value = updated;
    callsPaused.value = updated.paused;
  } catch (error: unknown) {
    apiError.value =
      error instanceof Error
        ? error.message
        : "Relay could not update the run.";
  } finally {
    controlPending.value = false;
  }
}

async function saveRecommendedDecision(): Promise<void> {
  if (!run.value || !recommendedQuote.value || decisionPending.value) return;

  decisionPending.value = true;
  apiError.value = "";
  try {
    await useRelayApi().saveDecision(run.value.id, recommendedQuote.value.id);
    markDecisionSaved(recommendedQuote.value.id);
  } catch (error: unknown) {
    apiError.value =
      error instanceof Error
        ? error.message
        : "Relay could not save the decision.";
  } finally {
    decisionPending.value = false;
  }
}

async function openEvidence(
  evidence: Negotiation["evidence"][number],
): Promise<void> {
  if (!evidence.accessible || evidencePendingId.value) return;

  const previewWindow = window.open("about:blank", "_blank");
  if (previewWindow) previewWindow.opener = null;
  evidencePendingId.value = evidence.id;
  apiError.value = "";

  try {
    const access = await useRelayApi().getEvidenceAccess(evidence.id);
    if (previewWindow) {
      previewWindow.location.replace(access.url);
    } else {
      window.location.assign(access.url);
    }
  } catch (error: unknown) {
    previewWindow?.close();
    apiError.value =
      error instanceof Error
        ? error.message
        : "Relay could not open this evidence item.";
  } finally {
    evidencePendingId.value = "";
  }
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void loadWorkspace().then(scheduleWorkspacePoll);
});

onBeforeUnmount(() => {
  clearWorkspacePoll();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});

function badgeTone(
  tone: NegotiationTone,
): "success" | "live" | "neutral" | "warning" {
  if (tone === "complete") return "success";
  if (tone === "live") return callsPaused.value ? "warning" : "live";
  return "neutral";
}
</script>

<template>
  <AppShell>
    <main id="main-content" class="workspace-main">
      <ApiFeedback
        :message="apiError"
        :pending="apiPending"
        @retry="loadWorkspace"
      />

      <section v-if="job && run" class="session-heading">
        <div>
          <div class="session-heading__crumbs">
            <span>Moves</span><span aria-hidden="true">/</span>
            <span>{{ moveBrief.id }}</span>
          </div>
          <h1>{{ moveBrief.title }}</h1>
          <p>{{ moveBrief.route }} · {{ moveBrief.date }}</p>
        </div>
        <div class="session-heading__actions">
          <NuxtLink
            v-if="reportReady"
            class="button button--blue"
            :to="reportLink"
          >
            View final report <span aria-hidden="true">→</span>
          </NuxtLink>
          <button
            v-else-if="!runComplete"
            :aria-pressed="callsPaused"
            class="button button--secondary"
            :disabled="controlPending"
            type="button"
            @click="toggleCalls"
          >
            <svg aria-hidden="true" class="pause-icon" viewBox="0 0 20 20">
              <path v-if="callsPaused" d="m7 5 8 5-8 5V5Z" />
              <path v-else d="M7 5v10M13 5v10" />
            </svg>
            {{
              controlPending
                ? "Updating…"
                : callsPaused
                  ? "Resume calls"
                  : "Pause calls"
            }}
          </button>
          <NuxtLink v-else class="button button--secondary" to="/dashboard">
            Return to requests <span aria-hidden="true">→</span>
          </NuxtLink>
        </div>
      </section>

      <section
        v-if="job && run"
        aria-label="Negotiation progress"
        class="stage-card card"
      >
        <div class="stage-card__topline">
          <div>
            <StatusBadge
              :tone="
                reportReady
                  ? 'success'
                  : runComplete || callsPaused
                    ? 'warning'
                    : 'live'
              "
            >
              {{
                runComplete
                  ? terminalStatusLabel
                  : callsPaused
                    ? "Calls paused"
                    : "Negotiating now"
              }}
            </StatusBadge>
            <span>{{
              reportReady
                ? "All outcomes saved"
                : runComplete
                  ? "Run ended"
                  : "In progress"
            }}</span>
          </div>
          <strong>{{
            reportReady
              ? "4 of 4 stages complete"
              : runComplete
                ? "Run ended before decision"
                : "3 of 4 stages in progress"
          }}</strong>
        </div>
        <ol class="stage-track">
          <li class="stage-track__item stage-track__item--complete">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Brief confirmed</strong>
              <small
                >Version {{ run.specificationVersion?.version ?? 1 }}</small
              >
            </div>
          </li>
          <li class="stage-track__item stage-track__item--complete">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Businesses found</strong>
              <small>{{ negotiations.length }} approved businesses</small>
            </div>
          </li>
          <li
            class="stage-track__item"
            :class="
              reportReady
                ? 'stage-track__item--complete'
                : runComplete
                  ? ''
                  : 'stage-track__item--current'
            "
          >
            <span aria-hidden="true">{{
              reportReady ? "✓" : runComplete ? "!" : "3"
            }}</span>
            <div>
              <strong>Negotiating</strong>
              <small>{{
                reportReady
                  ? `${completedCalls} calls complete`
                  : runComplete
                    ? `${completedCalls} calls completed before the run ended`
                    : callsPaused
                      ? "Calls paused"
                      : "Calls active"
              }}</small>
            </div>
          </li>
          <li
            class="stage-track__item"
            :class="{ 'stage-track__item--complete': reportReady }"
          >
            <span aria-hidden="true">{{ reportReady ? "✓" : "4" }}</span>
            <div>
              <strong>Decision ready</strong>
              <small>{{
                reportReady
                  ? "Ready to review"
                  : runComplete
                    ? "Not available"
                    : "Updating"
              }}</small>
            </div>
          </li>
        </ol>
      </section>

      <section
        v-if="job && run"
        aria-label="Session metrics"
        class="metric-grid"
      >
        <article class="metric-card card">
          <span>Best current offer</span>
          <strong class="mono-number">{{
            formatCurrency(recommendedQuote?.total ?? 0)
          }}</strong>
          <small class="metric-card__positive"
            >{{ formatCurrency(recommendation.savings) }} below opening
            price</small
          >
        </article>
        <article class="metric-card card">
          <span>Calls completed</span>
          <strong class="mono-number"
            >{{ completedCalls }}/{{ negotiations.length }}</strong
          >
          <small>
            {{
              reportReady
                ? "Every call outcome is saved"
                : runComplete
                  ? "Saved outcomes remain available"
                  : callsPaused
                    ? "Active calls are paused"
                    : "Relay is following up live"
            }}
          </small>
        </article>
        <article class="metric-card card">
          <span>Verified evidence</span>
          <strong class="mono-number">{{ verifiedEvidenceCount }}</strong>
          <small>Across transcripts and quotes</small>
        </article>
      </section>

      <div v-if="job && run" class="workspace-content-grid">
        <div class="workspace-primary">
          <details id="brief" class="panel panel--summary card">
            <summary class="panel__header">
              <div>
                <span class="panel__eyebrow">Confirmed intake</span>
                <h2>Move brief</h2>
              </div>
              <span class="panel-summary-status">
                <StatusBadge tone="success">Confirmed</StatusBadge>
                <span aria-hidden="true">⌄</span>
              </span>
            </summary>

            <div class="brief-route">
              <div>
                <span aria-hidden="true" class="route-dot" />
                <small>Pickup</small>
                <strong>{{ moveBrief.pickup }}</strong>
                <span>{{ moveBrief.home }} · {{ moveBrief.access }}</span>
              </div>
              <span aria-hidden="true" class="route-line" />
              <div>
                <span aria-hidden="true" class="route-dot route-dot--end" />
                <small>Drop-off</small>
                <strong>{{ moveBrief.destination }}</strong>
                <span>{{ moveBrief.access }}</span>
              </div>
            </div>

            <dl class="brief-details">
              <div>
                <dt>Move date</dt>
                <dd>{{ moveBrief.date }}</dd>
              </div>
              <div>
                <dt>Preferred arrival</dt>
                <dd>{{ moveBrief.window }}</dd>
              </div>
              <div>
                <dt>Target budget</dt>
                <dd>{{ formatCurrency(moveBrief.budget) }}</dd>
              </div>
              <div>
                <dt>Inventory</dt>
                <dd>{{ moveBrief.inventory }}</dd>
              </div>
            </dl>

            <details class="brief-notes">
              <summary>View confirmed notes and constraints</summary>
              <p>
                {{ moveBrief.notes }} Inventory, access details, crew scope, and
                service date must remain unchanged during negotiation.
              </p>
            </details>
          </details>

          <section id="negotiations" class="panel panel--calls card">
            <header class="panel__header">
              <div>
                <span class="panel__eyebrow">Parallel outreach</span>
                <h2>Negotiations</h2>
              </div>
              <span class="panel__meta">Last updated just now</span>
            </header>

            <div class="calls-layout">
              <div class="call-list" aria-label="Business calls">
                <button
                  v-for="negotiation in negotiations"
                  :key="negotiation.id"
                  :aria-pressed="negotiation.id === activeNegotiationId"
                  class="call-row"
                  type="button"
                  @click="activeNegotiationId = negotiation.id"
                >
                  <span class="call-row__avatar">{{
                    negotiation.initials
                  }}</span>
                  <span class="call-row__main">
                    <span class="call-row__name">{{
                      negotiation.company
                    }}</span>
                    <StatusBadge :tone="badgeTone(negotiation.tone)">
                      {{
                        callsPaused && negotiation.tone === "live"
                          ? "Paused"
                          : negotiation.status
                      }}
                    </StatusBadge>
                  </span>
                  <span class="call-row__offer">
                    <s
                      v-if="
                        negotiation.initialOffer !== negotiation.currentOffer
                      "
                    >
                      {{ formatCurrency(negotiation.initialOffer) }}
                    </s>
                    <strong class="mono-number">
                      {{ formatCurrency(negotiation.currentOffer) }}
                    </strong>
                    <small>{{ negotiation.lastUpdate }}</small>
                  </span>
                </button>
              </div>

              <article v-if="activeNegotiation" class="call-detail">
                <div class="call-detail__topline">
                  <div>
                    <span>Selected call</span>
                    <h3>{{ activeNegotiation.company }}</h3>
                  </div>
                  <StatusBadge :tone="badgeTone(activeNegotiation.tone)">
                    {{
                      callsPaused && activeNegotiation.tone === "live"
                        ? "Paused"
                        : activeNegotiation.status
                    }}
                  </StatusBadge>
                </div>

                <div class="call-progress">
                  <div>
                    <span>Negotiation progress</span>
                    <strong>{{ activeNegotiation.progress }}%</strong>
                  </div>
                  <div
                    :aria-label="`${activeNegotiation.company} negotiation progress`"
                    :aria-valuenow="activeNegotiation.progress"
                    aria-valuemax="100"
                    aria-valuemin="0"
                    class="progress-track"
                    role="progressbar"
                  >
                    <span
                      :style="{ width: `${activeNegotiation.progress}%` }"
                    />
                  </div>
                </div>

                <div class="strategy-note">
                  <span>Strategy</span>
                  <strong>{{ activeNegotiation.strategy }}</strong>
                  <p>{{ activeNegotiation.summary }}</p>
                </div>

                <div class="transcript">
                  <div class="transcript__heading">
                    <h4>Call transcript</h4>
                    <span
                      v-if="activeNegotiation.tone === 'live' && !callsPaused"
                    >
                      <i aria-hidden="true" /> Live
                    </span>
                    <span v-else-if="activeNegotiation.tone === 'live'">
                      Call paused
                    </span>
                    <span v-else>Call complete</span>
                  </div>
                  <ol>
                    <li
                      v-for="entry in activeNegotiation.transcript"
                      :key="`${entry.at}-${entry.speaker}`"
                    >
                      <time>{{ entry.at }}</time>
                      <div>
                        <strong>{{ entry.speaker }}</strong>
                        <p>{{ entry.text }}</p>
                      </div>
                    </li>
                  </ol>
                </div>

                <details class="evidence-drawer" open>
                  <summary>
                    Verified evidence
                    <span>
                      {{ activeNegotiation.evidence.length }}
                      {{
                        activeNegotiation.evidence.length === 1
                          ? "item"
                          : "items"
                      }}
                    </span>
                  </summary>
                  <ul>
                    <li
                      v-for="evidence in activeNegotiation.evidence"
                      :key="evidence.id"
                    >
                      <span aria-hidden="true">✓</span>
                      <div>
                        <strong>{{ evidence.label }}</strong>
                        <p>{{ evidence.detail }}</p>
                        <small>{{ evidence.source }}</small>
                      </div>
                      <button
                        v-if="evidence.accessible"
                        :aria-label="`Open ${evidence.label}`"
                        class="evidence-drawer__open"
                        :disabled="Boolean(evidencePendingId)"
                        type="button"
                        @click="openEvidence(evidence)"
                      >
                        {{
                          evidencePendingId === evidence.id
                            ? "Opening…"
                            : "Open"
                        }}
                      </button>
                    </li>
                  </ul>
                </details>
              </article>
            </div>
          </section>

          <details id="quotes" class="panel panel--summary card">
            <summary class="panel__header">
              <div>
                <span class="panel__eyebrow">Normalized comparison</span>
                <h2>Current offers</h2>
              </div>
              <span class="panel-summary-status">
                <StatusBadge :dot="false"
                  >{{ quotes.length }} comparable</StatusBadge
                >
                <span aria-hidden="true">⌄</span>
              </span>
            </summary>
            <p class="panel__intro">
              Every quote uses the same confirmed moving scope. Select one to
              inspect the recommendation detail.
            </p>
            <WorkspaceQuoteComparison
              :quotes="quotes"
              :selected-id="selectedQuoteId"
              @select="selectQuote"
            />
          </details>
        </div>

        <aside class="workspace-secondary">
          <section
            v-if="quotes.length > 0"
            id="recommendation"
            class="recommendation-card card"
          >
            <div class="recommendation-card__signal">
              <span aria-hidden="true">✓</span>
              {{ reportReady ? "Relay recommendation" : "Current comparison" }}
            </div>
            <h2>{{ recommendation.headline }}</h2>
            <p>
              Best balance of verified price, arrival certainty, deposit terms,
              and customer history.
            </p>

            <div class="recommendation-card__price">
              <div>
                <span>Quoted total</span>
                <strong class="mono-number">
                  {{ formatCurrency(recommendedQuote?.total ?? 0) }}
                </strong>
              </div>
              <StatusBadge :dot="false" tone="success">
                Save {{ formatCurrency(recommendation.savings) }}
              </StatusBadge>
            </div>

            <ul class="recommendation-reasons">
              <li v-for="reason in recommendation.rationale" :key="reason">
                <span aria-hidden="true">✓</span>{{ reason }}
              </li>
            </ul>

            <div class="confidence-block">
              <div>
                <span>Decision confidence</span>
                <strong>{{ recommendation.confidence }}%</strong>
              </div>
              <div
                aria-label="Relay recommendation confidence"
                :aria-valuenow="recommendation.confidence"
                aria-valuemax="100"
                aria-valuemin="0"
                class="confidence-track"
                role="progressbar"
              >
                <span :style="{ width: `${recommendation.confidence}%` }" />
              </div>
            </div>

            <div
              v-if="
                selectedQuote && selectedQuote.id !== recommendation.quoteId
              "
              class="reviewing-note"
            >
              <span>Reviewing alternative</span>
              <strong>{{ selectedQuote.company }}</strong>
              <p>
                {{
                  formatCurrency(
                    selectedQuote.total - (recommendedQuote?.total ?? 0),
                  )
                }}
                more than Relay's recommendation, with a
                {{ selectedQuote.deposit }} deposit.
              </p>
            </div>

            <button
              class="button button--blue recommendation-card__action"
              :disabled="decisionPending || !reportReady"
              type="button"
              @click="saveRecommendedDecision"
            >
              {{
                !reportReady
                  ? "Available when calls finish"
                  : decisionPending
                    ? "Saving decision…"
                    : decisionSaved
                      ? "Decision saved"
                      : `Choose ${recommendedQuote?.company ?? "recommended offer"}`
              }}
              <span aria-hidden="true">{{
                decisionPending ? "" : decisionSaved ? "✓" : "→"
              }}</span>
            </button>
            <p class="recommendation-card__fine-print">
              {{
                reportReady
                  ? "Relay saves your choice. Booking remains under your control."
                  : "The comparison can change until every call outcome is processed."
              }}
            </p>
          </section>

          <section v-else class="recommendation-card card">
            <div class="recommendation-card__signal">
              <span aria-hidden="true">…</span>
              Comparison pending
            </div>
            <h2>No comparable quote yet.</h2>
            <p>
              Relay will show the current evidence-backed comparison here as
              businesses complete their calls.
            </p>
          </section>

          <section class="selected-quote card">
            <div class="selected-quote__header">
              <span>Quote detail</span>
              <strong>{{ selectedQuote?.company }}</strong>
            </div>
            <dl v-if="selectedQuote">
              <div>
                <dt>Rating</dt>
                <dd>
                  {{ selectedQuote.rating }} ·
                  {{ selectedQuote.reviewCount }} reviews
                </dd>
              </div>
              <div>
                <dt>Estimated time</dt>
                <dd>{{ selectedQuote.duration }}</dd>
              </div>
              <div>
                <dt>Arrival window</dt>
                <dd>{{ selectedQuote.arrival }}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {{
                    evidencePointLabel(selectedQuote.evidenceCount, {
                      verified: true,
                    })
                  }}
                </dd>
              </div>
            </dl>
            <details v-if="selectedQuote" class="fee-breakdown">
              <summary>Itemized total</summary>
              <div
                v-for="fee in selectedQuote.fees"
                :key="fee.label"
                class="fee-row"
              >
                <span>{{ fee.label }}</span>
                <strong>{{ formatCurrency(fee.amount) }}</strong>
              </div>
            </details>
          </section>

          <section class="activity-card card">
            <header>
              <h2>Recent activity</h2>
              <span>Local time</span>
            </header>
            <ol>
              <li v-for="activity in sessionActivity" :key="activity.at">
                <time>{{ activity.at }}</time>
                <div>
                  <strong>{{ activity.label }}</strong>
                  <span>{{ activity.company }}</span>
                </div>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.workspace-main {
  margin: 0 auto;
  max-width: var(--relay-width-wide);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}

.session-heading {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 28px;
}

.session-heading__crumbs {
  color: var(--relay-faint);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 7px;
  margin-bottom: 12px;
}

.session-heading h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 530;
  letter-spacing: -0.05em;
  margin-bottom: 7px;
}

.session-heading p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  margin-bottom: 0;
}

.session-heading__actions {
  display: flex;
  gap: 6px;
}

.session-heading__actions .button {
  min-height: 39px;
}

.pause-icon {
  fill: none;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 16px;
}

.stage-card {
  margin-bottom: 12px;
  padding: 22px;
}

.stage-card__topline,
.stage-card__topline > div {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.stage-card__topline > div {
  gap: 10px;
}

.stage-card__topline > div > span,
.stage-card__topline > strong {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  font-weight: 500;
}

.stage-track {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  list-style: none;
  margin: 26px 0 0;
  padding: 0;
}

.stage-track__item {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr;
  position: relative;
}

.stage-track__item::after {
  background: var(--relay-line-strong);
  content: "";
  height: 1px;
  left: 39px;
  position: absolute;
  right: 8px;
  top: 14px;
}

.stage-track__item:last-child::after {
  display: none;
}

.stage-track__item > span {
  align-items: center;
  background: var(--relay-surface-muted);
  border: 1px solid var(--relay-line-strong);
  border-radius: 999px;
  color: var(--relay-faint);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  height: 29px;
  justify-content: center;
  position: relative;
  width: 29px;
  z-index: 1;
}

.stage-track__item--complete > span {
  background: var(--relay-green);
  border-color: var(--relay-green);
  color: #ffffff;
}

.stage-track__item--complete::after {
  background: #b8ddc7;
}

.stage-track__item--current > span {
  background: var(--relay-blue);
  border-color: var(--relay-blue);
  color: #ffffff;
  box-shadow: 0 0 0 4px var(--relay-blue-soft);
}

.stage-track__item > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding-right: 14px;
  position: relative;
  z-index: 1;
}

.stage-track__item strong {
  font-size: var(--relay-text-control);
  font-weight: 570;
}

.stage-track__item small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.metric-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-bottom: 12px;
}

.metric-card {
  display: grid;
  gap: 5px;
  padding: 18px;
}

.metric-card > span,
.metric-card small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
}

.metric-card strong {
  font-size: 1.55rem;
  font-weight: 530;
  letter-spacing: -0.04em;
}

.metric-card .metric-card__positive {
  color: var(--relay-green);
}

.workspace-content-grid {
  align-items: start;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) 318px;
}

.workspace-primary,
.workspace-secondary {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}

.workspace-secondary {
  position: sticky;
  top: 76px;
}

.panel {
  min-width: 0;
  overflow: hidden;
  scroll-margin-top: 78px;
}
.panel--summary > summary {
  cursor: pointer;
  list-style: none;
}
.panel--summary > summary::-webkit-details-marker {
  display: none;
}
.panel-summary-status {
  align-items: center;
  display: flex;
  gap: var(--relay-space-2);
}
.panel-summary-status > span:last-child {
  color: var(--relay-faint);
  display: inline-block;
  font-size: var(--relay-text-meta);
  transition: transform 160ms ease;
}
.panel--summary[open] .panel-summary-status > span:last-child {
  transform: rotate(180deg);
}

.panel__header {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 20px 22px;
}

.panel__eyebrow {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.panel__header h2,
.recommendation-card h2,
.activity-card h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 590;
  letter-spacing: -0.025em;
  margin: 0;
}

.panel__meta {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.brief-route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr);
  padding: 26px 28px;
}

.brief-route > div {
  display: grid;
  gap: 4px;
  padding-left: 20px;
  position: relative;
}

.brief-route small,
.brief-route > div > span:last-child {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.brief-route strong {
  font-size: var(--relay-text-control);
  font-weight: 580;
}

.route-dot {
  background: var(--relay-blue);
  border: 3px solid var(--relay-blue-soft);
  border-radius: 999px;
  height: 12px;
  left: 0;
  position: absolute;
  top: 3px;
  width: 12px;
}

.route-dot--end {
  background: var(--relay-green);
  border-color: var(--relay-green-soft);
}

.route-line {
  align-self: center;
  border-top: 1px dashed var(--relay-line-strong);
  height: 1px;
}

.brief-details {
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.brief-details > div {
  border-bottom: 1px solid var(--relay-line);
  padding: 17px 22px;
}

.brief-details > div:nth-child(odd) {
  border-right: 1px solid var(--relay-line);
}

.brief-details > div:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.brief-details dt {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-bottom: 5px;
}

.brief-details dd {
  font-size: var(--relay-text-control);
  line-height: 1.5;
  margin: 0;
}

.brief-notes {
  padding: 17px 22px;
}

.brief-notes summary,
.evidence-drawer summary,
.fee-breakdown summary {
  color: var(--relay-muted);
  cursor: pointer;
  font-size: var(--relay-text-control);
  font-weight: 560;
}

.brief-notes p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.65;
  margin: 12px 0 3px;
}

.calls-layout {
  display: grid;
  grid-template-columns: minmax(265px, 0.68fr) minmax(0, 1.32fr);
  min-height: 600px;
}

.call-list {
  border-right: 1px solid var(--relay-line);
}

.call-row {
  align-items: center;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 92px;
  padding: 13px 16px;
  text-align: left;
  width: 100%;
}

.call-row:hover,
.call-row[aria-pressed="true"] {
  background: #f8f9ff;
}

.call-row[aria-pressed="true"] {
  box-shadow: inset 3px 0 var(--relay-blue);
}

.call-row__avatar {
  align-items: center;
  background: var(--relay-surface-muted);
  border: 1px solid var(--relay-line);
  border-radius: 10px;
  color: var(--relay-muted);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  font-weight: 600;
  height: 35px;
  justify-content: center;
  width: 35px;
}

.call-row__main,
.call-row__offer {
  display: grid;
  gap: 6px;
}

.call-row__name {
  font-size: var(--relay-text-control);
  font-weight: 580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-row__main :deep(.status-badge) {
  width: fit-content;
}

.call-row__offer {
  justify-items: end;
}

.call-row__offer s,
.call-row__offer small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.call-row__offer strong {
  font-size: var(--relay-text-control);
  font-weight: 600;
}

.call-detail {
  min-width: 0;
  padding: 20px;
}

.call-detail__topline {
  align-items: start;
  display: flex;
  justify-content: space-between;
}

.call-detail__topline span:first-child,
.call-progress span,
.strategy-note > span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.call-detail__topline h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 590;
  margin: 5px 0 0;
}

.call-progress {
  margin: 23px 0;
}

.call-progress > div:first-child {
  display: flex;
  justify-content: space-between;
  margin-bottom: 7px;
}

.call-progress strong {
  font-size: var(--relay-text-meta);
}

.progress-track,
.confidence-track {
  background: var(--relay-surface-muted);
  border-radius: 999px;
  height: 5px;
  overflow: hidden;
}

.progress-track > span,
.confidence-track > span {
  background: var(--relay-blue);
  border-radius: inherit;
  display: block;
  height: 100%;
}

.strategy-note {
  background: var(--relay-blue-soft);
  border: 1px solid #dce5ff;
  border-radius: 11px;
  display: grid;
  gap: 5px;
  padding: 13px;
}

.strategy-note strong {
  font-size: var(--relay-text-control);
  font-weight: 580;
}

.strategy-note p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 0;
}

.transcript {
  margin-top: 25px;
}

.transcript__heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.transcript__heading h4 {
  font-size: var(--relay-text-control);
  font-weight: 590;
  margin: 0;
}

.transcript__heading > span {
  align-items: center;
  color: var(--relay-faint);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  gap: 5px;
}

.transcript__heading i {
  background: var(--relay-blue);
  border-radius: 999px;
  height: 6px;
  width: 6px;
}

.transcript ol {
  list-style: none;
  margin: 15px 0 0;
  max-height: 260px;
  overflow-y: auto;
  padding: 0 4px 0 0;
}

.transcript li {
  border-left: 1px solid var(--relay-line-strong);
  display: grid;
  gap: 10px;
  grid-template-columns: 33px 1fr;
  padding: 0 0 18px 12px;
}

.transcript time {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  padding-top: 2px;
}

.transcript strong {
  font-size: var(--relay-text-meta);
  font-weight: 590;
}

.transcript p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 4px 0 0;
}

.evidence-drawer {
  border-top: 1px solid var(--relay-line);
  padding-top: 15px;
}

.evidence-drawer summary {
  display: flex;
  justify-content: space-between;
  list-style: none;
}

.evidence-drawer summary::-webkit-details-marker {
  display: none;
}

.evidence-drawer summary span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.evidence-drawer ul {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 14px 0 0;
  padding: 0;
}

.evidence-drawer li {
  display: grid;
  gap: 9px;
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.evidence-drawer li > span {
  align-items: center;
  background: var(--relay-green-soft);
  border-radius: 999px;
  color: var(--relay-green);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  height: 19px;
  justify-content: center;
  width: 19px;
}

.evidence-drawer strong,
.evidence-drawer p,
.evidence-drawer small {
  display: block;
}

.evidence-drawer strong {
  font-size: var(--relay-text-control);
  font-weight: 570;
}

.evidence-drawer p,
.evidence-drawer small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.evidence-drawer p {
  line-height: 1.5;
  margin: 3px 0;
}

.evidence-drawer__open {
  align-self: center;
  background: transparent;
  border: 0;
  color: var(--relay-blue);
  cursor: pointer;
  font: inherit;
  font-size: var(--relay-text-meta);
  font-weight: 600;
  padding: 7px 2px 7px 10px;
}

.evidence-drawer__open:disabled {
  color: var(--relay-faint);
  cursor: wait;
}

.panel__intro {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 18px 22px 10px;
}

.panel :deep(.quote-table-wrap) {
  padding: 0 10px 12px;
}

.recommendation-card,
.selected-quote,
.activity-card {
  scroll-margin-top: 78px;
}

.recommendation-card {
  padding: 21px;
}

.recommendation-card__signal {
  align-items: center;
  color: var(--relay-green);
  display: flex;
  font-size: var(--relay-text-meta);
  font-weight: 580;
  gap: 7px;
  margin-bottom: 17px;
}

.recommendation-card__signal > span {
  align-items: center;
  background: var(--relay-mint);
  border-radius: 999px;
  color: #0b3d25;
  display: inline-flex;
  height: 19px;
  justify-content: center;
  width: 19px;
}

.recommendation-card h2 {
  font-size: var(--relay-text-section-title);
  line-height: 1.25;
  margin-bottom: 9px;
}

.recommendation-card > p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
}

.recommendation-card__price {
  align-items: center;
  background: var(--relay-green-soft);
  border: 1px solid #cee9d9;
  border-radius: 11px;
  display: flex;
  justify-content: space-between;
  margin: 18px 0;
  padding: 13px;
}

.recommendation-card__price > div {
  display: grid;
  gap: 3px;
}

.recommendation-card__price > div > span {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
}

.recommendation-card__price strong {
  font-size: 1.25rem;
  font-weight: 590;
  letter-spacing: -0.04em;
}

.recommendation-reasons {
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.recommendation-reasons li {
  align-items: center;
  color: var(--relay-muted);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 8px;
  grid-template-columns: auto 1fr;
}

.recommendation-reasons li span {
  color: var(--relay-green);
  font-size: var(--relay-text-meta);
}

.confidence-block {
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  margin: 19px 0;
  padding: 15px 0;
}

.confidence-block > div:first-child {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.confidence-block span,
.confidence-block strong {
  font-size: var(--relay-text-meta);
}

.confidence-block span {
  color: var(--relay-faint);
}

.confidence-track > span {
  background: var(--relay-green);
}

.reviewing-note {
  background: var(--relay-blue-soft);
  border-radius: 10px;
  display: grid;
  gap: 4px;
  margin-bottom: 15px;
  padding: 12px;
}

.reviewing-note span {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 570;
}

.reviewing-note strong {
  font-size: var(--relay-text-control);
}

.reviewing-note p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.45;
  margin: 0;
}

.recommendation-card__action {
  width: 100%;
}

.recommendation-card .recommendation-card__fine-print {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin: 9px 0 0;
  text-align: center;
}

.selected-quote {
  padding: 20px;
}

.selected-quote__header {
  display: grid;
  gap: 4px;
  margin-bottom: 15px;
}

.selected-quote__header span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  text-transform: uppercase;
}

.selected-quote__header strong {
  font-size: var(--relay-text-card-title);
  font-weight: 590;
}

.selected-quote dl {
  margin: 0;
}

.selected-quote dl > div {
  border-top: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 11px 0;
}

.selected-quote dt,
.selected-quote dd {
  font-size: var(--relay-text-meta);
}

.selected-quote dt {
  color: var(--relay-faint);
}

.selected-quote dd {
  margin: 0;
  text-align: right;
}

.fee-breakdown {
  border-top: 1px solid var(--relay-line);
  padding-top: 13px;
}

.fee-row {
  display: flex;
  justify-content: space-between;
  padding-top: 9px;
}

.fee-row span,
.fee-row strong {
  font-size: var(--relay-text-meta);
}

.fee-row span {
  color: var(--relay-muted);
}

.activity-card {
  padding: 20px;
}

.activity-card header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.activity-card header span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.activity-card ol {
  list-style: none;
  margin: 17px 0 0;
  padding: 0;
}

.activity-card li {
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 10px;
  grid-template-columns: 35px 1fr;
  padding: 12px 0;
}

.activity-card time,
.activity-card li span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.activity-card li div {
  display: grid;
  gap: 3px;
}

.activity-card li strong {
  font-size: var(--relay-text-control);
  font-weight: 570;
}

@media (max-width: 1280px) {
  .workspace-content-grid {
    grid-template-columns: minmax(0, 1fr) 286px;
  }

  .calls-layout {
    grid-template-columns: 1fr;
  }

  .call-list {
    border-bottom: 1px solid var(--relay-line);
    border-right: 0;
  }
}

@media (max-width: 1024px) {
  .workspace-main {
    padding-left: var(--relay-page-gutter-tablet);
    padding-right: var(--relay-page-gutter-tablet);
  }

  .workspace-content-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .workspace-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    position: static;
  }

  .recommendation-card {
    grid-row: span 2;
  }
}

@media (max-width: 768px) {
  .workspace-main {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }

  .session-heading {
    align-items: flex-start;
    display: grid;
    gap: 18px;
  }

  .session-heading__actions .button--quiet {
    display: none;
  }

  .stage-card {
    overflow: hidden;
    padding: 17px;
  }

  .stage-card__topline > strong,
  .stage-card__topline > div > span {
    display: none;
  }

  .stage-track {
    gap: 13px;
    grid-template-columns: 1fr;
  }

  .stage-track__item::after {
    bottom: -13px;
    height: auto;
    left: 14px;
    right: auto;
    top: 29px;
    width: 1px;
  }

  .metric-grid {
    grid-template-columns: repeat(3, minmax(160px, 1fr));
    overflow-x: auto;
  }

  .brief-route {
    gap: 18px;
    grid-template-columns: 1fr;
  }

  .route-line {
    display: none;
  }

  .brief-details {
    grid-template-columns: 1fr;
  }

  .brief-details > div,
  .brief-details > div:nth-child(odd),
  .brief-details > div:nth-last-child(-n + 2) {
    border-bottom: 1px solid var(--relay-line);
    border-right: 0;
  }

  .brief-details > div:last-child {
    border-bottom: 0;
  }

  .panel__header {
    align-items: flex-start;
    gap: 12px;
  }

  .call-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .call-detail {
    padding: 18px 15px;
  }

  .workspace-secondary {
    grid-template-columns: minmax(0, 1fr);
  }

  .recommendation-card {
    grid-row: auto;
  }
}

@media (max-width: 640px) {
  .call-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .call-row__avatar {
    display: none;
  }

  .transcript li {
    grid-template-columns: 28px 1fr;
  }
}
</style>
