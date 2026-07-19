<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ApiFeedback from "../../../components/app/ApiFeedback.vue";
import WorkspaceQuoteComparison from "../../../components/workspace/QuoteComparison.vue";
import { useDecisionSelection } from "../../../composables/useDecisionSelection";
import { useRelayApi } from "../../../composables/useRelayApi";
import { useRequestContext } from "../../../composables/useRequestContext";
import {
  quotes as demoQuotes,
  recommendation as demoRecommendation,
  type Quote,
} from "../../../data/demo";
import type { RankedOffer, RunReport } from "../../../types/api";
import { formatCurrency } from "../../../utils/currency";

useSeoMeta({ title: "Final report · Relay" });

const { publicId, runId, setCurrent } = useRequestContext();
const {
  decisionSaved,
  markDecisionSaved,
  selectedQuoteId: selectedId,
  selectQuote,
} = useDecisionSelection();
const exportStatus = ref("");
const scoringPolicyOpen = ref(false);
const apiError = ref("");
const apiPending = ref(false);
const decisionPending = ref(false);
const apiReport = ref<RunReport>();

function mapRankedOffer(offer: RankedOffer): Quote {
  return {
    id: offer.id,
    company: offer.businessName,
    total: offer.totalCents / 100,
    initialTotal: (offer.originalTotalCents ?? offer.totalCents) / 100,
    rating: 0,
    reviewCount: 0,
    arrival: offer.arrivalWindow ?? "Confirmed with business",
    deposit:
      offer.depositCents === undefined
        ? "Not confirmed"
        : `${Math.round((offer.depositCents / offer.totalCents) * 100)}%`,
    duration: "Confirmed scope",
    included:
      offer.inclusions.length > 0
        ? offer.inclusions
        : ["Confirmed moving scope"],
    fees: [{ label: "All-in quoted total", amount: offer.totalCents / 100 }],
    evidenceCount: offer.evidenceCount,
    score: offer.score ?? Math.round(offer.confidence * 100),
    ...(apiReport.value?.recommendation.quoteId === offer.id
      ? { recommended: true }
      : {}),
  };
}

const quotes = computed<Quote[]>(() =>
  apiReport.value?.rankedOffers.length
    ? apiReport.value.rankedOffers.map(mapRankedOffer)
    : demoQuotes,
);

const recommendation = computed(() => {
  const result = apiReport.value?.recommendation;

  if (!result) return demoRecommendation;

  return {
    quoteId: result.quoteId,
    savings: result.savingsCents / 100,
    confidence: Math.round(result.confidence * 100),
    headline: `${result.businessName} is the strongest verified value`,
    rationale: [
      result.rationale,
      "The same confirmed scope was used across completed calls",
      "Unknown charges remain visible instead of becoming zero",
      "The recommendation balances price, completeness, confidence, and risk",
    ],
  };
});

const selectedOffer = computed(
  () =>
    quotes.value.find((quote) => quote.id === selectedId.value) ??
    quotes.value[0],
);
const recommendedOffer = computed(
  () =>
    quotes.value.find((quote) => quote.id === recommendation.value.quoteId) ??
    quotes.value[0],
);
const selectedOfferRank = computed(
  () =>
    quotes.value.findIndex((quote) => quote.id === selectedOffer.value?.id) + 1,
);
const selectedOfferSummary = computed(() => {
  const offer = selectedOffer.value;
  const recommended = recommendedOffer.value;

  if (!offer) return "No offer is selected.";

  if (offer.recommended) {
    return `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This is Relay's recommended offer because its price, terms, and evidence produce the strongest verified value.`;
  }

  const difference = offer.total - (recommended?.total ?? offer.total);
  return `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This offer is ${formatCurrency(difference)} above Relay's recommendation; compare its timing, deposit, and included scope before deciding.`;
});

const evidenceCount = computed(() =>
  quotes.value.reduce((total, quote) => total + quote.evidenceCount, 0),
);
const runnerUpDifference = computed(() => {
  const recommended = recommendedOffer.value;
  const runnerUp = quotes.value.find((quote) => quote.id !== recommended?.id);

  return recommended && runnerUp ? runnerUp.total - recommended.total : 0;
});
const callsHandled = computed(
  () => apiReport.value?.metrics.callsHandled ?? quotes.value.length,
);
const workspaceLink = computed(() => {
  const resolvedRunId = apiReport.value?.runId ?? runId.value;
  const query = resolvedRunId
    ? `?run=${encodeURIComponent(resolvedRunId)}`
    : "";

  return `/requests/${encodeURIComponent(publicId.value)}/workspace${query}#negotiations`;
});

const reportExport = computed(() => ({
  format: "relay-negotiation-report",
  generatedAt: new Date().toISOString(),
  offers: quotes.value.map((quote) => ({
    arrival: quote.arrival,
    company: quote.company,
    deposit: quote.deposit,
    evidenceCount: quote.evidenceCount,
    fees: quote.fees,
    initialTotal: quote.initialTotal,
    score: quote.score,
    total: quote.total,
  })),
  recommendation: {
    company: recommendedOffer.value?.company,
    confidence: recommendation.value.confidence,
    rationale: recommendation.value.rationale,
    savings: recommendation.value.savings,
    total: recommendedOffer.value?.total,
  },
  requestId: publicId.value,
  runId: apiReport.value?.runId ?? runId.value,
  version: 1,
}));

async function loadReport(): Promise<void> {
  apiPending.value = true;
  apiError.value = "";

  try {
    const api = useRelayApi();
    const job = await api.getJob(publicId.value);
    const resolvedRunId = runId.value ?? job.latestRunId;

    if (!resolvedRunId) {
      apiError.value = "This request does not have a completed report yet.";
      return;
    }

    const [loadedRun, loadedReport] = await Promise.all([
      api.getRun(resolvedRunId),
      api.getReport(resolvedRunId),
    ]);

    if (loadedRun.jobPublicId !== job.publicId) {
      throw new Error(
        "This negotiation report belongs to a different request. Open the request from the dashboard and try again.",
      );
    }

    apiReport.value = loadedReport;
    if (loadedReport.decision?.quoteId) {
      markDecisionSaved(loadedReport.decision.quoteId);
    }
    setCurrent(job.publicId, resolvedRunId);
  } catch (error: unknown) {
    apiError.value =
      error instanceof Error
        ? error.message
        : "Relay could not load the final report.";
  } finally {
    apiPending.value = false;
  }
}

async function saveRecommendedDecision(): Promise<void> {
  const report = apiReport.value;
  if (!report || decisionPending.value) return;

  decisionPending.value = true;
  apiError.value = "";
  try {
    await useRelayApi().saveDecision(
      report.runId,
      report.recommendation.quoteId,
    );
    markDecisionSaved(report.recommendation.quoteId);
  } catch (error: unknown) {
    apiError.value =
      error instanceof Error
        ? error.message
        : "Relay could not save this decision.";
  } finally {
    decisionPending.value = false;
  }
}

function exportReport(): void {
  try {
    const report = new Blob([JSON.stringify(reportExport.value, null, 2)], {
      type: "application/json",
    });
    const reportUrl = URL.createObjectURL(report);
    const download = document.createElement("a");

    const fileName = `relay-${publicId.value.toLowerCase()}-report.json`;
    download.download = fileName;
    download.href = reportUrl;
    document.body.append(download);
    download.click();
    download.remove();
    URL.revokeObjectURL(reportUrl);

    exportStatus.value = `Downloaded ${fileName}`;
  } catch {
    exportStatus.value =
      "The report could not be downloaded. Please try again.";
  }
}

onMounted(() => void loadReport());
</script>

<template>
  <AppShell>
    <main id="main-content" class="report-page">
      <header class="report-header">
        <div>
          <div class="report-crumbs">
            <NuxtLink to="/dashboard">Requests</NuxtLink><span>/</span
            ><span>{{ publicId }}</span
            ><span>/</span><span>Report</span>
          </div>
          <h1>Your comparison is ready.</h1>
          <p>
            {{ quotes.length }} businesses returned comparable offers from the
            same confirmed brief. Relay ranked each outcome using price, fee
            completeness, timing, reputation, and evidence quality.
          </p>
        </div>
        <div class="report-export">
          <button
            aria-describedby="report-export-status"
            class="button button--secondary"
            type="button"
            @click="exportReport"
          >
            {{
              exportStatus.startsWith("Downloaded")
                ? "Export again"
                : "Export report"
            }}
            <span aria-hidden="true">↓</span>
          </button>
          <p id="report-export-status" aria-live="polite">
            {{ exportStatus }}
          </p>
        </div>
      </header>

      <ApiFeedback
        :message="apiError"
        :pending="apiPending"
        @retry="loadReport"
      />

      <section class="recommendation-hero">
        <div class="recommendation-hero__main">
          <div class="verified-label">
            <span aria-hidden="true">✓</span> Relay recommendation
          </div>
          <h2>{{ recommendation.headline }}.</h2>
          <p>
            {{ recommendation.rationale[0] }}
          </p>
          <div class="recommendation-actions">
            <button
              class="button button--blue"
              :disabled="decisionPending"
              type="button"
              @click="saveRecommendedDecision"
            >
              {{
                decisionPending
                  ? "Saving decision…"
                  : decisionSaved
                    ? "Decision saved"
                    : "Save this decision"
              }}
              <span aria-hidden="true">{{
                decisionPending ? "" : decisionSaved ? "✓" : "→"
              }}</span></button
            ><NuxtLink class="button button--secondary" :to="workspaceLink"
              >Review call evidence</NuxtLink
            >
          </div>
        </div>
        <div class="recommendation-hero__metrics">
          <div>
            <span>Guaranteed total</span
            ><strong>{{ formatCurrency(recommendedOffer?.total ?? 0) }}</strong
            ><small
              >{{ formatCurrency(recommendation.savings) }} below opening
              offer</small
            >
          </div>
          <div>
            <span>Confidence</span
            ><strong>{{ recommendation.confidence }}%</strong
            ><small>{{ evidenceCount }} verified evidence points</small>
          </div>
        </div>
      </section>

      <div class="report-layout">
        <div class="report-primary">
          <section class="report-card">
            <header>
              <div>
                <span>Ranked comparison</span>
                <h2>Comparable offers</h2>
              </div>
              <StatusBadge :dot="false" tone="success"
                >Scope verified</StatusBadge
              >
            </header>
            <p class="report-card__intro">
              All totals use the confirmed three-person crew and inventory.
              Missing terms remain visible instead of being treated as zero.
            </p>
            <WorkspaceQuoteComparison
              :quotes="quotes"
              :selected-id="selectedId"
              @select="selectQuote"
            />
            <section
              v-if="selectedOffer"
              aria-atomic="true"
              aria-live="polite"
              class="selected-offer-review"
            >
              <div class="selected-offer-review__header">
                <div>
                  <span>Selected offer review</span>
                  <h3>{{ selectedOffer.company }}</h3>
                </div>
                <StatusBadge
                  :dot="false"
                  :tone="selectedOffer.recommended ? 'success' : 'neutral'"
                >
                  {{
                    selectedOffer.recommended
                      ? "Relay recommendation"
                      : `Rank ${selectedOfferRank}`
                  }}
                </StatusBadge>
              </div>
              <p>{{ selectedOfferSummary }}</p>
              <dl>
                <div>
                  <dt>All-in price</dt>
                  <dd>{{ formatCurrency(selectedOffer.total) }}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{{ selectedOffer.score }}/100</dd>
                </div>
                <div>
                  <dt>Arrival</dt>
                  <dd>{{ selectedOffer.arrival }}</dd>
                </div>
                <div>
                  <dt>Deposit</dt>
                  <dd>{{ selectedOffer.deposit }}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>{{ selectedOffer.evidenceCount }} verified points</dd>
                </div>
              </dl>
              <div class="selected-offer-review__scope">
                <strong>Included scope</strong>
                <span>{{ selectedOffer.included.join(" · ") }}</span>
              </div>
            </section>
          </section>

          <section class="report-card">
            <header>
              <div>
                <span>Why this won</span>
                <h2>Decision factors</h2>
              </div>
            </header>
            <div class="factor-grid">
              <article>
                <span class="factor-score">01</span>
                <div>
                  <h3>Verified all-in price</h3>
                  <p>
                    {{ formatCurrency(runnerUpDifference) }} lower than the
                    next-best offer, with unresolved charges kept visible.
                  </p>
                </div>
                <strong>Best</strong>
              </article>
              <article>
                <span class="factor-score">02</span>
                <div>
                  <h3>Arrival certainty</h3>
                  <p>
                    {{ recommendedOffer?.arrival }} is recorded alongside the
                    offer instead of being separated from the price.
                  </p>
                </div>
                <strong>Best</strong>
              </article>
              <article>
                <span class="factor-score">03</span>
                <div>
                  <h3>Deposit terms</h3>
                  <p>
                    The {{ recommendedOffer?.deposit }} deposit is included in
                    the comparison before the decision is saved.
                  </p>
                </div>
                <strong>Best</strong>
              </article>
              <article>
                <span class="factor-score">04</span>
                <div>
                  <h3>Evidence quality</h3>
                  <p>
                    {{ recommendedOffer?.evidenceCount }} verified evidence
                    points support the recommended terms.
                  </p>
                </div>
                <strong>High</strong>
              </article>
            </div>
          </section>

          <section class="risk-card">
            <span class="risk-card__icon" aria-hidden="true">!</span>
            <div>
              <span>Risk policy applied</span>
              <h2>Low prices are reviewed before ranking.</h2>
              <p>
                Relay flags any offer 30% below the comparable market baseline.
                No current offer crossed that threshold. Unknown fees would
                remain “Not confirmed.”
              </p>
            </div>
            <button
              aria-controls="scoring-policy"
              :aria-expanded="scoringPolicyOpen"
              type="button"
              @click="scoringPolicyOpen = !scoringPolicyOpen"
            >
              {{
                scoringPolicyOpen
                  ? "Hide scoring policy"
                  : "View scoring policy"
              }}
            </button>
            <section
              v-if="scoringPolicyOpen"
              id="scoring-policy"
              aria-labelledby="scoring-policy-title"
              class="scoring-policy"
            >
              <div>
                <span>How Relay ranks comparable offers</span>
                <h3 id="scoring-policy-title">Scoring policy</h3>
                <p>
                  Scores explain the recommendation; they never replace the
                  underlying quote or evidence.
                </p>
              </div>
              <dl>
                <div>
                  <dt>Verified price</dt>
                  <dd>35%</dd>
                </div>
                <div>
                  <dt>Fee completeness</dt>
                  <dd>25%</dd>
                </div>
                <div>
                  <dt>Timing and service fit</dt>
                  <dd>15%</dd>
                </div>
                <div>
                  <dt>Evidence quality</dt>
                  <dd>15%</dd>
                </div>
                <div>
                  <dt>Business reputation</dt>
                  <dd>10%</dd>
                </div>
              </dl>
              <ul>
                <li>
                  Offers 30% below the comparable baseline are held for review.
                </li>
                <li>
                  Unknown fees stay unconfirmed; they are never treated as zero.
                </li>
                <li>
                  Callbacks and declines remain visible but are not ranked as
                  completed quotes.
                </li>
              </ul>
            </section>
          </section>
        </div>

        <aside class="report-aside">
          <section class="report-card report-summary">
            <header>
              <div>
                <span>Decision details</span>
                <h2>Terms at a glance</h2>
              </div>
            </header>
            <dl>
              <div>
                <dt>Arrival window</dt>
                <dd>{{ recommendedOffer?.arrival }}</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd>{{ recommendedOffer?.deposit }}</dd>
              </div>
              <div>
                <dt>Verified savings</dt>
                <dd>{{ formatCurrency(recommendation.savings) }}</dd>
              </div>
              <div>
                <dt>Calls handled</dt>
                <dd>{{ callsHandled }}</dd>
              </div>
            </dl>
          </section>
          <section class="report-card evidence-summary">
            <header>
              <div>
                <span>Evidence</span>
                <h2>{{ evidenceCount }} verified points</h2>
              </div>
            </header>
            <ul>
              <li>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>Guaranteed total</strong
                  ><small>Transcript · 12:42</small>
                </div>
              </li>
              <li>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>No fuel surcharge</strong
                  ><small>Revised quote · line 8</small>
                </div>
              </li>
              <li>
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>One-hour arrival</strong
                  ><small>Transcript · 12:39</small>
                </div>
              </li>
            </ul>
            <NuxtLink :to="workspaceLink">Open all evidence →</NuxtLink>
          </section>
          <p class="report-boundary">
            Relay does not book, pay, or sign a contract. Your saved decision is
            a record for you to act on.
          </p>
        </aside>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.report-page {
  margin: 0 auto;
  max-width: var(--relay-width-wide);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.report-header {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 25px;
}
.report-crumbs {
  color: var(--relay-faint);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 7px;
  margin-bottom: 10px;
}
.report-header h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 560;
  letter-spacing: -0.05em;
  margin-bottom: 8px;
}
.report-header p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: 1.55;
  margin: 0;
  max-width: 740px;
}
.report-export {
  display: grid;
  gap: 7px;
  justify-items: end;
}
.report-export p {
  color: var(--relay-green);
  font-size: var(--relay-text-meta);
  margin: 0;
  min-height: 0.9rem;
}
.recommendation-hero {
  background: var(--relay-ink);
  border-radius: 18px;
  color: white;
  display: grid;
  gap: 45px;
  grid-template-columns: 1.25fr 0.75fr;
  margin-bottom: 14px;
  overflow: hidden;
  padding: 31px;
}
.verified-label {
  align-items: center;
  color: var(--relay-mint);
  display: flex;
  font-size: var(--relay-text-meta);
  font-weight: 620;
  gap: 7px;
}
.verified-label span {
  align-items: center;
  background: var(--relay-green);
  border-radius: 99px;
  color: white;
  display: flex;
  height: 20px;
  justify-content: center;
  width: 20px;
}
.recommendation-hero h2 {
  font-size: clamp(1.65rem, 3vw, 2.45rem);
  font-weight: 520;
  letter-spacing: -0.045em;
  line-height: 1.08;
  margin: 17px 0 12px;
  max-width: 600px;
}
.recommendation-hero__main > p {
  color: rgb(255 255 255 / 62%);
  font-size: var(--relay-text-control);
  line-height: 1.6;
  max-width: 590px;
}
.recommendation-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 21px;
}
.recommendation-hero .button--secondary {
  background: transparent;
  border-color: rgb(255 255 255 / 22%);
  color: white;
}
.recommendation-hero__metrics {
  border-left: 1px solid rgb(255 255 255 / 14%);
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding-left: 31px;
}
.recommendation-hero__metrics > div {
  align-content: center;
  display: grid;
  gap: 7px;
}
.recommendation-hero__metrics span,
.recommendation-hero__metrics small {
  color: rgb(255 255 255 / 48%);
  font-size: var(--relay-text-meta);
}
.recommendation-hero__metrics strong {
  font-size: 1.9rem;
  font-weight: 550;
  letter-spacing: -0.04em;
}
.recommendation-hero__metrics small {
  color: var(--relay-mint);
}
.report-layout {
  align-items: start;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) 300px;
}
.report-primary,
.report-aside {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
}
.report-aside {
  position: sticky;
  top: 84px;
}
.report-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
  min-width: 0;
  overflow: hidden;
}
.report-card > header {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 19px 21px;
}
.report-card header span {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}
.report-card h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0;
}
.report-card__intro {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.5;
  margin: 15px 21px 8px;
}
.report-card :deep(.quote-table-wrap) {
  padding: 0 10px 10px;
}
.selected-offer-review {
  background: #f8f9ff;
  border-top: 1px solid var(--relay-line);
  padding: 18px 21px 20px;
}
.selected-offer-review__header {
  align-items: center;
  display: flex;
  justify-content: space-between;
}
.selected-offer-review__header > div > span {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}
.selected-offer-review h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0;
}
.selected-offer-review > p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 12px 0 15px;
  max-width: 720px;
}
.selected-offer-review dl {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin: 0;
}
.selected-offer-review dl > div {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 9px;
  min-width: 0;
  padding: 10px;
}
.selected-offer-review dt {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-bottom: 5px;
}
.selected-offer-review dd {
  font-size: var(--relay-text-meta);
  font-weight: 610;
  line-height: 1.35;
  margin: 0;
}
.selected-offer-review__scope {
  display: grid;
  gap: 5px;
  margin-top: 13px;
}
.selected-offer-review__scope strong {
  font-size: var(--relay-text-control);
  font-weight: 620;
}
.selected-offer-review__scope span {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.45;
}
.factor-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}
.factor-grid article {
  align-items: flex-start;
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  gap: 11px;
  grid-template-columns: auto 1fr auto;
  padding: 19px 21px;
}
.factor-grid article:nth-child(odd) {
  border-right: 1px solid var(--relay-line);
}
.factor-grid article:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.factor-score {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 99px;
  color: var(--relay-blue);
  display: flex;
  font-size: var(--relay-text-meta);
  height: 22px;
  justify-content: center;
  width: 22px;
}
.factor-grid h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 2px 0 5px;
}
.factor-grid p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.factor-grid article > strong {
  color: var(--relay-green);
  font-size: var(--relay-text-meta);
}
.risk-card {
  align-items: center;
  background: #fff9ed;
  border: 1px solid #f0dfba;
  border-radius: 15px;
  display: grid;
  gap: 13px;
  grid-template-columns: auto 1fr auto;
  padding: 17px;
}
.risk-card__icon {
  align-items: center;
  background: var(--relay-amber);
  border-radius: 99px;
  color: white;
  display: flex;
  height: 28px;
  justify-content: center;
  width: 28px;
}
.risk-card > div > span {
  color: var(--relay-amber);
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.risk-card h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 5px 0;
}
.risk-card p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.risk-card button {
  background: white;
  border: 1px solid #e4cfa3;
  border-radius: 8px;
  color: var(--relay-amber);
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 0 10px;
}
.scoring-policy {
  background: rgb(255 255 255 / 72%);
  border: 1px solid #ead8b1;
  border-radius: 11px;
  display: grid;
  gap: 16px;
  grid-column: 1 / -1;
  grid-template-columns: minmax(170px, 0.72fr) minmax(0, 1.28fr);
  padding: 17px;
}
.scoring-policy > div > span {
  color: var(--relay-amber);
  display: block;
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}
.scoring-policy h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 630;
  margin: 0 0 6px;
}
.scoring-policy p,
.scoring-policy li,
.scoring-policy dt,
.scoring-policy dd {
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
}
.scoring-policy p {
  color: var(--relay-muted);
  margin: 0;
}
.scoring-policy dl {
  display: grid;
  gap: 0 13px;
  grid-template-columns: 1fr 1fr;
  margin: 0;
}
.scoring-policy dl > div {
  border-bottom: 1px solid #eadfc6;
  display: flex;
  justify-content: space-between;
  padding: 7px 0;
}
.scoring-policy dt {
  color: var(--relay-muted);
}
.scoring-policy dd {
  font-weight: 650;
  margin: 0;
}
.scoring-policy ul {
  border-top: 1px solid #eadfc6;
  display: grid;
  gap: 5px;
  grid-column: 1 / -1;
  margin: 0;
  padding: 13px 0 0 18px;
}
.scoring-policy li {
  color: var(--relay-muted);
}
.report-summary dl {
  margin: 0;
  padding: 8px 19px;
}
.report-summary dl div {
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 11px 0;
}
.report-summary dl div:last-child {
  border-bottom: 0;
}
.report-summary dt,
.report-summary dd {
  font-size: var(--relay-text-meta);
}
.report-summary dt {
  color: var(--relay-muted);
}
.report-summary dd {
  font-weight: 610;
  margin: 0;
}
.report-summary__positive {
  color: var(--relay-green);
}
.evidence-summary ul {
  display: grid;
  gap: 14px;
  list-style: none;
  margin: 0;
  padding: 17px 19px;
}
.evidence-summary li {
  display: grid;
  gap: 9px;
  grid-template-columns: auto 1fr;
}
.evidence-summary li > span {
  color: var(--relay-green);
}
.evidence-summary strong {
  display: block;
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.evidence-summary small {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  margin-top: 4px;
}
.evidence-summary > a {
  border-top: 1px solid var(--relay-line);
  color: var(--relay-blue);
  display: block;
  font-size: var(--relay-text-control);
  font-weight: 610;
  padding: 14px 19px;
}
.report-boundary {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: 1.5;
  margin: 0;
  padding: 0 5px;
}
@media (max-width: 1024px) {
  .report-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .report-aside {
    grid-template-columns: 1fr 1fr;
    position: static;
  }
  .report-boundary {
    align-self: center;
  }
}
@media (max-width: 768px) {
  .report-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .report-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }
  .report-export {
    justify-items: start;
  }
  .recommendation-hero {
    grid-template-columns: 1fr;
  }
  .recommendation-hero__metrics {
    border-left: 0;
    border-top: 1px solid rgb(255 255 255 / 14%);
    min-height: 100px;
    padding-left: 0;
    padding-top: 20px;
  }
  .factor-grid {
    grid-template-columns: 1fr;
  }
  .selected-offer-review dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .factor-grid article:nth-child(odd) {
    border-right: 0;
  }
  .factor-grid article:nth-last-child(2) {
    border-bottom: 1px solid var(--relay-line);
  }
  .risk-card {
    grid-template-columns: auto 1fr;
  }
  .risk-card button {
    grid-column: span 2;
  }
  .scoring-policy {
    grid-template-columns: 1fr;
  }
  .scoring-policy dl,
  .scoring-policy ul {
    grid-column: auto;
  }
  .report-aside {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
