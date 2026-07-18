<script setup lang="ts">
import { computed, ref } from "vue";

import WorkspaceQuoteComparison from "../components/workspace/QuoteComparison.vue";
import {
  moveBrief,
  negotiations,
  quotes,
  recommendation,
  sessionActivity,
  type NegotiationTone,
} from "../data/demo";
import { formatCurrency } from "../utils/currency";

useSeoMeta({
  description:
    "Explore a realistic Relay negotiation session from confirmed brief to evidence-backed recommendation.",
  robots: "noindex, nofollow",
  title: "Charlotte move · Relay workspace",
});

const activeNegotiationId = ref(negotiations[0]?.id ?? "");
const selectedQuoteId = ref<string>(recommendation.quoteId);
const callsPaused = ref(false);
const decisionSaved = ref(false);

const activeNegotiation = computed(
  () =>
    negotiations.find(
      (negotiation) => negotiation.id === activeNegotiationId.value,
    ) ?? negotiations[0],
);

const recommendedQuote = computed(
  () =>
    quotes.find((quote) => quote.id === recommendation.quoteId) ?? quotes[0],
);

const selectedQuote = computed(
  () =>
    quotes.find((quote) => quote.id === selectedQuoteId.value) ??
    recommendedQuote.value,
);

const completedCalls = computed(
  () =>
    negotiations.filter((negotiation) => negotiation.progress === 100).length,
);

function badgeTone(
  tone: NegotiationTone,
): "success" | "live" | "neutral" | "warning" {
  if (tone === "complete") return "success";
  if (tone === "live") return callsPaused.value ? "warning" : "live";
  return "neutral";
}

function selectQuote(quoteId: string): void {
  selectedQuoteId.value = quoteId;
  decisionSaved.value = false;
}
</script>

<template>
  <div class="workspace-shell">
    <header class="workspace-header">
      <NuxtLink aria-label="Relay home" class="workspace-header__brand" to="/">
        <RelayLogo />
      </NuxtLink>

      <div class="workspace-header__session">
        <span class="workspace-header__divider" />
        <span>Charlotte move</span>
        <StatusBadge :dot="false" tone="blue">Demo</StatusBadge>
      </div>

      <div class="workspace-header__actions">
        <span class="workspace-header__saved">All changes saved</span>
        <span aria-label="Demo account" class="avatar-button" role="img">
          AT
        </span>
      </div>
    </header>

    <aside class="workspace-rail">
      <nav aria-label="Workspace sections">
        <a class="rail-link rail-link--active" href="#overview">
          <span aria-hidden="true">01</span> Overview
        </a>
        <a class="rail-link" href="#brief">
          <span aria-hidden="true">02</span> Move brief
        </a>
        <a class="rail-link" href="#negotiations">
          <span aria-hidden="true">03</span> Negotiations
          <small>{{ callsPaused ? "paused" : "1 live" }}</small>
        </a>
        <a class="rail-link" href="#quotes">
          <span aria-hidden="true">04</span> Quotes
        </a>
        <a class="rail-link" href="#recommendation">
          <span aria-hidden="true">05</span> Decision
        </a>
      </nav>

      <div class="rail-session">
        <span>Session</span>
        <strong>{{ moveBrief.id }}</strong>
        <p>Local demonstration data</p>
      </div>

      <NuxtLink class="rail-back" to="/">
        <span aria-hidden="true">←</span> Back to Relay
      </NuxtLink>
    </aside>

    <main id="main-content" class="workspace-main">
      <section id="overview" class="session-heading">
        <div>
          <div class="session-heading__crumbs">
            <span>Moves</span><span aria-hidden="true">/</span>
            <span>{{ moveBrief.id }}</span>
          </div>
          <h1>{{ moveBrief.title }}</h1>
          <p>{{ moveBrief.route }} · {{ moveBrief.date }}</p>
        </div>
        <div class="session-heading__actions">
          <button
            :aria-pressed="callsPaused"
            class="button button--secondary"
            type="button"
            @click="callsPaused = !callsPaused"
          >
            <span aria-hidden="true">{{ callsPaused ? "▶" : "Ⅱ" }}</span>
            {{ callsPaused ? "Resume calls" : "Pause calls" }}
          </button>
        </div>
      </section>

      <div class="mobile-section-nav" aria-label="Jump to workspace section">
        <a href="#brief">Brief</a>
        <a href="#negotiations">Calls</a>
        <a href="#quotes">Quotes</a>
        <a href="#recommendation">Decision</a>
      </div>

      <section aria-label="Negotiation progress" class="stage-card card">
        <div class="stage-card__topline">
          <div>
            <StatusBadge :tone="callsPaused ? 'warning' : 'live'">
              {{ callsPaused ? "Calls paused" : "Negotiating now" }}
            </StatusBadge>
            <span>Started 18 minutes ago</span>
          </div>
          <strong>3 of 4 stages complete</strong>
        </div>
        <ol class="stage-track">
          <li class="stage-track__item stage-track__item--complete">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Brief confirmed</strong>
              <small>12:18 PM</small>
            </div>
          </li>
          <li class="stage-track__item stage-track__item--complete">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Businesses found</strong>
              <small>12:24 PM</small>
            </div>
          </li>
          <li class="stage-track__item stage-track__item--current">
            <span aria-hidden="true">3</span>
            <div>
              <strong>Negotiating</strong>
              <small>{{
                callsPaused ? "Calls paused" : "1 call active"
              }}</small>
            </div>
          </li>
          <li class="stage-track__item">
            <span aria-hidden="true">4</span>
            <div>
              <strong>Decision ready</strong>
              <small>Updating</small>
            </div>
          </li>
        </ol>
      </section>

      <section aria-label="Session metrics" class="metric-grid">
        <article class="metric-card card">
          <span>Best current offer</span>
          <strong class="mono-number">{{ formatCurrency(1840) }}</strong>
          <small class="metric-card__positive">$370 below opening price</small>
        </article>
        <article class="metric-card card">
          <span>Calls completed</span>
          <strong class="mono-number">{{ completedCalls }}/3</strong>
          <small>
            {{
              callsPaused
                ? "Carolina Transit is paused"
                : "Carolina Transit is still live"
            }}
          </small>
        </article>
        <article class="metric-card card">
          <span>Verified evidence</span>
          <strong class="mono-number">7</strong>
          <small>Across transcripts and quotes</small>
        </article>
        <article class="metric-card card">
          <span>Decision confidence</span>
          <strong class="mono-number">94%</strong>
          <small class="metric-card__positive">High confidence</small>
        </article>
      </section>

      <div class="workspace-content-grid">
        <div class="workspace-primary">
          <section id="brief" class="panel card">
            <header class="panel__header">
              <div>
                <span class="panel__eyebrow">Confirmed intake</span>
                <h2>Move brief</h2>
              </div>
              <StatusBadge tone="success">Ready for every call</StatusBadge>
            </header>

            <div class="brief-route">
              <div>
                <span aria-hidden="true" class="route-dot" />
                <small>Pickup</small>
                <strong>Rock Hill, SC</strong>
                <span>2-bedroom apartment · one flight</span>
              </div>
              <span aria-hidden="true" class="route-line" />
              <div>
                <span aria-hidden="true" class="route-dot route-dot--end" />
                <small>Drop-off</small>
                <strong>Charlotte, NC</strong>
                <span>Elevator reserved · loading bay</span>
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
          </section>

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
                    <span>{{ activeNegotiation.evidence.length }} items</span>
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
                    </li>
                  </ul>
                </details>
              </article>
            </div>
          </section>

          <section id="quotes" class="panel card">
            <header class="panel__header">
              <div>
                <span class="panel__eyebrow">Normalized comparison</span>
                <h2>Quotes</h2>
              </div>
              <StatusBadge :dot="false">Same scope · USD</StatusBadge>
            </header>
            <p class="panel__intro">
              Every quote uses the confirmed three-person crew and inventory.
              Select one to inspect the recommendation detail.
            </p>
            <WorkspaceQuoteComparison
              :quotes="quotes"
              :selected-id="selectedQuoteId"
              @select="selectQuote"
            />
          </section>
        </div>

        <aside class="workspace-secondary">
          <section id="recommendation" class="recommendation-card card">
            <div class="recommendation-card__signal">
              <span aria-hidden="true">✓</span>
              Relay recommendation
            </div>
            <h2>{{ recommendation.headline }}</h2>
            <p>
              Best balance of verified price, arrival certainty, deposit terms,
              and customer history.
            </p>

            <div class="recommendation-card__price">
              <div>
                <span>Guaranteed total</span>
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
              type="button"
              @click="decisionSaved = true"
            >
              {{ decisionSaved ? "Decision saved" : "Choose Pine & Co." }}
              <span aria-hidden="true">{{ decisionSaved ? "✓" : "→" }}</span>
            </button>
            <p class="recommendation-card__fine-print">
              Demo only. Relay never books without your confirmation.
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
                <dd>{{ selectedQuote.evidenceCount }} verified points</dd>
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
  </div>
</template>

<style scoped>
.workspace-shell {
  background: var(--relay-page);
  min-height: 100vh;
  padding-left: 214px;
  padding-top: 64px;
}

.workspace-header {
  align-items: center;
  background: rgb(255 255 255 / 96%);
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  grid-template-columns: 214px 1fr auto;
  height: 64px;
  left: 0;
  padding: 0 22px;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 50;
}

.workspace-header__brand {
  width: fit-content;
}

.workspace-header__session {
  align-items: center;
  color: var(--relay-muted);
  display: flex;
  font-size: 0.74rem;
  gap: 10px;
}

.workspace-header__divider {
  background: var(--relay-line-strong);
  height: 22px;
  margin-right: 4px;
  width: 1px;
}

.workspace-header__actions {
  align-items: center;
  display: flex;
  gap: 14px;
}

.workspace-header__saved {
  color: var(--relay-faint);
  font-size: 0.66rem;
}

.avatar-button {
  align-items: center;
  background: var(--relay-ink);
  border: 0;
  border-radius: 9px;
  color: #ffffff;
  display: inline-flex;
  font-size: 0.62rem;
  font-weight: 590;
  height: 31px;
  justify-content: center;
  width: 31px;
}

.workspace-rail {
  background: #fbfbf9;
  border-right: 1px solid var(--relay-line);
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  padding: 28px 14px 18px;
  position: fixed;
  top: 64px;
  width: 214px;
  z-index: 30;
}

.workspace-rail nav {
  display: grid;
  gap: 3px;
}

.rail-link {
  align-items: center;
  border-radius: 9px;
  color: var(--relay-muted);
  display: grid;
  font-size: 0.73rem;
  gap: 9px;
  grid-template-columns: 20px 1fr auto;
  min-height: 38px;
  padding: 0 10px;
}

.rail-link > span {
  color: var(--relay-faint);
  font-size: 0.57rem;
  font-variant-numeric: tabular-nums;
}

.rail-link small {
  background: var(--relay-blue-soft);
  border-radius: 999px;
  color: var(--relay-blue);
  font-size: 0.56rem;
  padding: 4px 6px;
}

.rail-link:hover,
.rail-link--active {
  background: var(--relay-surface-muted);
  color: var(--relay-ink);
}

.rail-session {
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 4px;
  margin-top: auto;
  padding: 20px 10px;
}

.rail-session span,
.rail-session p {
  color: var(--relay-faint);
  font-size: 0.6rem;
}

.rail-session strong {
  font-size: 0.7rem;
  font-weight: 590;
}

.rail-session p {
  margin: 0;
}

.rail-back {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  color: var(--relay-muted);
  display: flex;
  font-size: 0.69rem;
  gap: 8px;
  padding: 18px 10px 2px;
}

.workspace-main {
  margin: 0 auto;
  max-width: 1450px;
  padding: 38px 34px 90px;
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
  font-size: 0.65rem;
  gap: 7px;
  margin-bottom: 12px;
}

.session-heading h1 {
  font-size: clamp(1.75rem, 3vw, 2.45rem);
  font-weight: 530;
  letter-spacing: -0.05em;
  margin-bottom: 7px;
}

.session-heading p {
  color: var(--relay-muted);
  font-size: 0.76rem;
  margin-bottom: 0;
}

.session-heading__actions {
  display: flex;
  gap: 6px;
}

.session-heading__actions .button {
  min-height: 39px;
}

.mobile-section-nav {
  display: none;
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
  font-size: 0.64rem;
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
  font-size: 0.62rem;
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
  font-size: 0.68rem;
  font-weight: 570;
}

.stage-track__item small {
  color: var(--relay-faint);
  font-size: 0.58rem;
}

.metric-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  font-size: 0.62rem;
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
  min-width: 0;
}

.workspace-secondary {
  position: sticky;
  top: 76px;
}

.panel {
  scroll-margin-top: 78px;
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
  font-size: 0.58rem;
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.panel__header h2,
.recommendation-card h2,
.activity-card h2 {
  font-size: 0.95rem;
  font-weight: 590;
  letter-spacing: -0.025em;
  margin: 0;
}

.panel__meta {
  color: var(--relay-faint);
  font-size: 0.62rem;
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
  font-size: 0.62rem;
}

.brief-route strong {
  font-size: 0.82rem;
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
  font-size: 0.6rem;
  margin-bottom: 5px;
}

.brief-details dd {
  font-size: 0.72rem;
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
  font-size: 0.68rem;
  font-weight: 560;
}

.brief-notes p {
  color: var(--relay-muted);
  font-size: 0.7rem;
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
  font-size: 0.59rem;
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
  font-size: 0.69rem;
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
  font-size: 0.57rem;
}

.call-row__offer strong {
  font-size: 0.76rem;
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
  font-size: 0.58rem;
}

.call-detail__topline h3 {
  font-size: 0.9rem;
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
  font-size: 0.62rem;
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
  font-size: 0.7rem;
  font-weight: 580;
}

.strategy-note p {
  color: var(--relay-muted);
  font-size: 0.64rem;
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
  font-size: 0.7rem;
  font-weight: 590;
  margin: 0;
}

.transcript__heading > span {
  align-items: center;
  color: var(--relay-faint);
  display: inline-flex;
  font-size: 0.58rem;
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
  font-size: 0.55rem;
  padding-top: 2px;
}

.transcript strong {
  font-size: 0.62rem;
  font-weight: 590;
}

.transcript p {
  color: var(--relay-muted);
  font-size: 0.64rem;
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
  font-size: 0.58rem;
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
  grid-template-columns: auto 1fr;
}

.evidence-drawer li > span {
  align-items: center;
  background: var(--relay-green-soft);
  border-radius: 999px;
  color: var(--relay-green);
  display: inline-flex;
  font-size: 0.55rem;
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
  font-size: 0.65rem;
  font-weight: 570;
}

.evidence-drawer p,
.evidence-drawer small {
  color: var(--relay-faint);
  font-size: 0.58rem;
}

.evidence-drawer p {
  line-height: 1.5;
  margin: 3px 0;
}

.panel__intro {
  color: var(--relay-muted);
  font-size: 0.68rem;
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
  font-size: 0.62rem;
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
  font-size: 1.15rem;
  line-height: 1.25;
  margin-bottom: 9px;
}

.recommendation-card > p {
  color: var(--relay-muted);
  font-size: 0.66rem;
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
  font-size: 0.58rem;
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
  font-size: 0.64rem;
  gap: 8px;
  grid-template-columns: auto 1fr;
}

.recommendation-reasons li span {
  color: var(--relay-green);
  font-size: 0.6rem;
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
  font-size: 0.61rem;
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
  font-size: 0.57rem;
  font-weight: 570;
}

.reviewing-note strong {
  font-size: 0.68rem;
}

.reviewing-note p {
  color: var(--relay-muted);
  font-size: 0.6rem;
  line-height: 1.45;
  margin: 0;
}

.recommendation-card__action {
  width: 100%;
}

.recommendation-card .recommendation-card__fine-print {
  color: var(--relay-faint);
  font-size: 0.56rem;
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
  font-size: 0.57rem;
  text-transform: uppercase;
}

.selected-quote__header strong {
  font-size: 0.76rem;
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
  font-size: 0.6rem;
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
  font-size: 0.59rem;
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
  font-size: 0.56rem;
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
  font-size: 0.56rem;
}

.activity-card li div {
  display: grid;
  gap: 3px;
}

.activity-card li strong {
  font-size: 0.62rem;
  font-weight: 570;
}

@media (max-width: 1180px) {
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

@media (max-width: 980px) {
  .workspace-shell {
    padding-left: 0;
  }

  .workspace-header {
    grid-template-columns: auto 1fr auto;
  }

  .workspace-header__session {
    margin-left: 24px;
  }

  .workspace-rail {
    display: none;
  }

  .workspace-main {
    padding-left: 22px;
    padding-right: 22px;
  }

  .mobile-section-nav {
    display: flex;
    gap: 6px;
    margin: 0 0 12px;
    overflow-x: auto;
  }

  .mobile-section-nav a {
    background: var(--relay-surface);
    border: 1px solid var(--relay-line);
    border-radius: 9px;
    color: var(--relay-muted);
    flex: 0 0 auto;
    font-size: 0.65rem;
    padding: 9px 12px;
  }

  .workspace-content-grid {
    grid-template-columns: 1fr;
  }

  .workspace-secondary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    position: static;
  }

  .recommendation-card {
    grid-row: span 2;
  }
}

@media (max-width: 720px) {
  .workspace-header {
    grid-template-columns: 1fr auto;
    padding: 0 16px;
  }

  .workspace-header__session,
  .workspace-header__saved {
    display: none;
  }

  .workspace-main {
    padding: 26px 14px 70px;
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .panel__header > :deep(.status-badge),
  .panel__meta {
    display: none;
  }

  .call-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .call-detail {
    padding: 18px 15px;
  }

  .workspace-secondary {
    grid-template-columns: 1fr;
  }

  .recommendation-card {
    grid-row: auto;
  }
}

@media (max-width: 430px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }

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
