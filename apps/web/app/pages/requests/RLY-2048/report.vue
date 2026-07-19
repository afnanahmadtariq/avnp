<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ApiFeedback from "../../../components/app/ApiFeedback.vue";
import WorkspaceQuoteComparison from "../../../components/workspace/QuoteComparison.vue";
import { useDecisionSelection } from "../../../composables/useDecisionSelection";
import { useRelayApi } from "../../../composables/useRelayApi";
import { useRequestContext } from "../../../composables/useRequestContext";
import type { Quote } from "../../../data/demo";
import type { RankedOffer, RunReport } from "../../../types/api";
import { formatCurrency } from "../../../utils/currency";
import { evidencePointLabel } from "../../../utils/evidence";

useSeoMeta({ title: "Final report · Relay" });

const { publicId, runId, setCurrent } = useRequestContext();
const {
  decisionSaved,
  markDecisionSaved,
  selectedQuoteId: selectedId,
  selectQuote,
} = useDecisionSelection();
const exportStatus = ref("");
const apiError = ref("");
const apiPending = ref(true);
const decisionPending = ref(false);
const apiReport = ref<RunReport>();

interface ReportQuote extends Quote {
  rank: number;
  rationale: string;
  riskFlags: string[];
}

function mapRankedOffer(offer: RankedOffer): ReportQuote {
  return {
    id: offer.id,
    company: offer.businessName,
    total: offer.totalCents / 100,
    initialTotal: (offer.originalTotalCents ?? offer.totalCents) / 100,
    rating: offer.rating ?? 0,
    reviewCount: offer.reviewCount ?? 0,
    arrival: offer.arrivalWindow ?? "Not supplied",
    deposit:
      offer.depositCents === undefined
        ? "Not confirmed"
        : `${Math.round((offer.depositCents / offer.totalCents) * 100)}%`,
    duration: offer.estimatedDuration ?? "Not supplied",
    included: offer.inclusions,
    fees: [],
    evidenceCount: offer.evidenceCount,
    rank: offer.rank,
    rationale: offer.rationale,
    riskFlags: offer.riskFlags,
    score: offer.score ?? Math.round(offer.confidence * 100),
    ...(apiReport.value?.recommendation.quoteId === offer.id
      ? { recommended: true }
      : {}),
  };
}

const quotes = computed<ReportQuote[]>(() =>
  apiReport.value?.rankedOffers.length
    ? apiReport.value.rankedOffers.map(mapRankedOffer)
    : [],
);

const recommendation = computed(() => {
  const result = apiReport.value?.recommendation;

  if (!result) {
    return {
      confidence: 0,
      headline: "",
      quoteId: "",
      rationale: [] as string[],
      savings: 0,
    };
  }

  return {
    quoteId: result.quoteId,
    savings: result.savingsCents / 100,
    confidence: Math.round(result.confidence * 100),
    headline:
      apiReport.value?.mode === "live"
        ? `${result.businessName} is the strongest verified value`
        : apiReport.value?.mode === "fixture"
          ? `${result.businessName} leads this sample comparison`
          : `${result.businessName} leads this report comparison`,
    rationale: [
      apiReport.value?.mode === "live"
        ? result.rationale
        : result.rationale.replaceAll(/verified/gi, "reported"),
    ],
  };
});

const evidenceIsVerified = computed(() => apiReport.value?.mode === "live");
const reportModeLabel = computed(() =>
  apiReport.value?.mode === "fixture"
    ? "Demonstration report"
    : apiReport.value?.mode === "live"
      ? "Live report"
      : "Negotiation report",
);

function reportEvidenceLabel(count: number): string {
  return evidencePointLabel(count, { verified: evidenceIsVerified.value });
}

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
    if (apiReport.value?.mode === "live") {
      return `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This is Relay's recommended offer because its price, terms, and evidence produce the strongest verified value.`;
    }

    return apiReport.value?.mode === "fixture"
      ? `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This is the recommendation produced by the demonstration report; review its sample terms and evidence before continuing.`
      : `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This is the recommendation returned by the current report; review its terms and evidence before continuing.`;
  }

  const difference = offer.total - (recommended?.total ?? offer.total);
  const priceComparison =
    difference === 0
      ? "the same price as"
      : `${formatCurrency(Math.abs(difference))} ${difference > 0 ? "above" : "below"}`;
  return `Ranked ${selectedOfferRank.value} of ${quotes.value.length}. This offer is ${priceComparison} Relay's recommendation; compare its timing, deposit, and included scope before deciding.`;
});

const evidenceCount = computed(() =>
  quotes.value.reduce((total, quote) => total + quote.evidenceCount, 0),
);
const selectedSavings = computed(() => {
  const offer = selectedOffer.value;
  return offer ? Math.max(0, offer.initialTotal - offer.total) : 0;
});
const riskFlags = computed(() =>
  quotes.value.flatMap((quote) =>
    quote.riskFlags.map((flag) => ({
      business: quote.company,
      flag: flag.replaceAll("_", " "),
      id: `${quote.id}-${flag}`,
    })),
  ),
);
const recommendedPriceComparison = computed(() => {
  const recommended = recommendedOffer.value;
  const runnerUp = quotes.value.find((quote) => quote.id !== recommended?.id);

  if (!recommended || !runnerUp) return "No next-ranked offer is available.";

  const difference = recommended.total - runnerUp.total;
  if (difference === 0) {
    return "The recommended and next-ranked offers have the same total.";
  }

  return `The recommended total is ${formatCurrency(Math.abs(difference))} ${
    difference > 0 ? "higher" : "lower"
  } than the next-ranked offer.`;
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
    included: quote.included,
    initialTotal: quote.initialTotal,
    rank: quote.rank,
    rationale: quote.rationale,
    riskFlags: quote.riskFlags,
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
  apiReport.value = undefined;

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
    } else {
      selectQuote(loadedReport.recommendation.quoteId);
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

async function saveSelectedDecision(): Promise<void> {
  const report = apiReport.value;
  const offer = selectedOffer.value;
  if (!report || !offer || decisionPending.value) return;

  decisionPending.value = true;
  apiError.value = "";
  try {
    await useRelayApi().saveDecision(report.runId, offer.id);
    markDecisionSaved(offer.id);
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
      <ApiFeedback
        :message="apiError"
        :pending="apiPending"
        @retry="loadReport"
      />

      <header v-if="apiReport" class="report-header">
        <div>
          <div class="report-crumbs">
            <NuxtLink to="/dashboard">Requests</NuxtLink><span>/</span
            ><span>{{ publicId }}</span
            ><span>/</span><span>Report</span>
          </div>
          <h1>Your comparison is ready.</h1>
          <p>
            {{ quotes.length }} businesses returned comparable offers from the
            same confirmed brief. The ranked results below preserve the terms,
            evidence counts, and risk flags returned by the report.
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

      <section v-if="apiReport" class="recommendation-hero">
        <div class="recommendation-hero__main">
          <div class="verified-label">
            <span aria-hidden="true">✓</span> {{ reportModeLabel }} · Relay
            recommendation
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
              @click="saveSelectedDecision"
            >
              {{
                decisionPending
                  ? "Saving decision…"
                  : decisionSaved
                    ? "Decision saved"
                    : `Save ${selectedOffer?.company ?? "selected offer"}`
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
            <span>Selected total</span
            ><strong v-if="selectedOffer">{{
              formatCurrency(selectedOffer.total)
            }}</strong
            ><strong v-else>No ranked offer</strong
            ><small v-if="selectedOffer"
              >{{ formatCurrency(selectedSavings) }} below its opening
              offer</small
            >
          </div>
          <div>
            <span>Recommendation confidence</span
            ><strong>{{ recommendation.confidence }}%</strong
            ><small>{{ reportEvidenceLabel(evidenceCount) }}</small>
          </div>
        </div>
      </section>

      <div v-if="apiReport" class="report-layout">
        <div class="report-primary">
          <section class="report-card">
            <header>
              <div>
                <span>Ranked comparison</span>
                <h2>Comparable offers</h2>
              </div>
              <StatusBadge :dot="false" tone="neutral">
                {{ quotes.length }} ranked offers
              </StatusBadge>
            </header>
            <p class="report-card__intro">
              All totals use the same confirmed moving scope. Missing terms
              remain visible instead of being treated as zero.
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
                  <dt>Rating</dt>
                  <dd>
                    {{ selectedOffer.rating }} ·
                    {{ selectedOffer.reviewCount }} reviews
                  </dd>
                </div>
                <div>
                  <dt>Arrival</dt>
                  <dd>{{ selectedOffer.arrival }}</dd>
                </div>
                <div>
                  <dt>Estimated time</dt>
                  <dd>{{ selectedOffer.duration }}</dd>
                </div>
                <div>
                  <dt>Deposit</dt>
                  <dd>{{ selectedOffer.deposit }}</dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>
                    {{ reportEvidenceLabel(selectedOffer.evidenceCount) }}
                  </dd>
                </div>
              </dl>
              <div class="selected-offer-review__scope">
                <strong>Included scope</strong>
                <span>
                  {{
                    selectedOffer.included.length > 0
                      ? selectedOffer.included.join(" · ")
                      : "Scope/itemization not supplied"
                  }}
                </span>
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
                  <h3>Reported all-in price</h3>
                  <p>{{ recommendedPriceComparison }}</p>
                </div>
                <strong>Rank 1</strong>
              </article>
              <article>
                <span class="factor-score">02</span>
                <div>
                  <h3>Report rationale</h3>
                  <p>
                    {{ recommendation.rationale[0] }}
                  </p>
                </div>
                <strong>{{ recommendedOffer?.score ?? 0 }}/100</strong>
              </article>
              <article>
                <span class="factor-score">03</span>
                <div>
                  <h3>Included scope</h3>
                  <p>
                    {{
                      recommendedOffer?.included.length
                        ? recommendedOffer.included.join(" · ")
                        : "Scope/itemization was not supplied for this offer."
                    }}
                  </p>
                </div>
                <strong
                  >{{ recommendedOffer?.included.length ?? 0 }} items</strong
                >
              </article>
              <article>
                <span class="factor-score">04</span>
                <div>
                  <h3>Evidence quality</h3>
                  <p>
                    The report includes
                    {{
                      reportEvidenceLabel(recommendedOffer?.evidenceCount ?? 0)
                    }}
                    for the recommended offer.
                  </p>
                </div>
                <strong
                  >{{ recommendedOffer?.evidenceCount ?? 0 }} points</strong
                >
              </article>
            </div>
          </section>

          <section class="risk-card">
            <span class="risk-card__icon" aria-hidden="true">
              {{ riskFlags.length > 0 ? "!" : "✓" }}
            </span>
            <div>
              <span>Reported risk flags</span>
              <h2>
                {{
                  riskFlags.length > 0
                    ? `${riskFlags.length} flags need review.`
                    : "No risk flags were returned for these offers."
                }}
              </h2>
              <ul v-if="riskFlags.length > 0">
                <li v-for="risk in riskFlags" :key="risk.id">
                  <strong>{{ risk.business }}:</strong> {{ risk.flag }}
                </li>
              </ul>
              <p v-else>
                This reflects the current API report only; review the quote and
                call evidence before acting on a saved decision.
              </p>
            </div>
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
                <dt>Selected business</dt>
                <dd>{{ selectedOffer?.company }}</dd>
              </div>
              <div>
                <dt>Arrival window</dt>
                <dd>{{ selectedOffer?.arrival }}</dd>
              </div>
              <div>
                <dt>Deposit</dt>
                <dd>{{ selectedOffer?.deposit }}</dd>
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
                <h2>{{ reportEvidenceLabel(evidenceCount) }}</h2>
              </div>
            </header>
            <ul>
              <li v-for="quote in quotes" :key="quote.id">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{{ quote.company }}</strong>
                  <small>
                    {{ reportEvidenceLabel(quote.evidenceCount) }}
                  </small>
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
.risk-card ul {
  margin: var(--relay-space-2) 0 0;
  padding-left: var(--relay-space-5);
}
.risk-card li {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
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
  .report-aside {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
