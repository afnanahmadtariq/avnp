<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

import ApiFeedback from "../app/ApiFeedback.vue";
import { useAccountIdentity } from "../../composables/useAccountIdentity";
import type { CandidateBusiness } from "../../types/api";

useSeoMeta({ title: "Approve businesses · Relay" });

const router = useRouter();
const api = useRelayApi();
const { representedAs } = useAccountIdentity();
const { publicId, setCurrent } = useRequestContext();
const sortBy = ref<"match" | "rating" | "distance">("match");
const expandedBusiness = ref<string | null>(null);
const businesses = ref<CandidateBusiness[]>([]);
const loading = ref(true);
const discovering = ref(false);
const starting = ref(false);
const loadError = ref("");
const startError = ref("");
const discoveryMode = ref("");
const discoveryStatus = ref("");
let discoveryPollTimer: number | undefined;
let discoveryPollPending = false;

interface CandidateResponse {
  items: CandidateBusiness[];
  mode?: string;
  status?: string;
}

const selectedCount = computed(
  () =>
    businesses.value.filter(
      (business) => business.selected && isCandidateSelectable(business),
    ).length,
);

const eligibleCount = computed(
  () => businesses.value.filter(isCandidateSelectable).length,
);

const discoveryModeLabel = computed(() => {
  if (discoveryMode.value === "fixture") return "Demonstration listings";
  if (discoveryMode.value === "live") return "Live business discovery";
  return "Business discovery";
});

const discoveryModeCopy = computed(() => {
  if (discoveryMode.value === "fixture") {
    return "These deterministic sample listings exercise the complete approval and calling flow. They are not live provider results.";
  }

  if (discoveryMode.value === "live") {
    return "Listings were returned by the configured discovery provider. Phone availability and candidate status determine whether a business can be called.";
  }

  return "Only businesses with an eligible status and a callable phone number can be selected.";
});

const sortedBusinesses = computed(() => {
  const result = [...businesses.value];

  if (sortBy.value === "rating") {
    return result.sort(
      (left, right) => (right.rating ?? 0) - (left.rating ?? 0),
    );
  }

  if (sortBy.value === "distance") {
    return result.sort(
      (left, right) =>
        (left.distanceMiles ?? Number.POSITIVE_INFINITY) -
        (right.distanceMiles ?? Number.POSITIVE_INFINITY),
    );
  }

  return result;
});

function toggleDetails(id: string): void {
  expandedBusiness.value = expandedBusiness.value === id ? null : id;
}

function selectionStorageKey(): string {
  return `relay-business-selection:${publicId.value}`;
}

function storedSelection(): Set<string> | null {
  if (!import.meta.client) return null;

  const stored = window.localStorage.getItem(selectionStorageKey());
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed)
      ? new Set(
          parsed.filter((value): value is string => typeof value === "string"),
        )
      : null;
  } catch {
    window.localStorage.removeItem(selectionStorageKey());
    return null;
  }
}

function persistSelection(): void {
  if (!import.meta.client) return;

  window.localStorage.setItem(
    selectionStorageKey(),
    JSON.stringify(
      businesses.value
        .filter(
          (business) => business.selected && isCandidateSelectable(business),
        )
        .map((business) => business.id),
    ),
  );
}

function applyCandidates(candidates: CandidateBusiness[]): void {
  const saved = storedSelection();
  businesses.value = candidates.map((business) => ({
    ...business,
    selected:
      isCandidateSelectable(business) &&
      (saved ? saved.has(business.id) : business.selected),
  }));
}

function applyDiscoveryMetadata(response: CandidateResponse): void {
  if (response.mode) discoveryMode.value = response.mode.toLowerCase();
  if (response.status) discoveryStatus.value = response.status.toLowerCase();
}

function isCandidateSelectable(business: CandidateBusiness): boolean {
  const status = business.status.toLowerCase();
  const callablePhone = /^\+[1-9]\d{7,14}$/.test(business.phone ?? "");

  return callablePhone && ["discovered", "shortlisted"].includes(status);
}

function clearDiscoveryTimer(): void {
  if (discoveryPollTimer !== undefined) {
    window.clearTimeout(discoveryPollTimer);
    discoveryPollTimer = undefined;
  }
}

function finishDiscovery(): void {
  clearDiscoveryTimer();
  discovering.value = false;
}

function discoveryFinished(response: CandidateResponse): boolean {
  const status = response.status?.toLowerCase();
  if (status) return status !== "discovering";

  return response.items.length > 0;
}

function scheduleDiscoveryPoll(): void {
  clearDiscoveryTimer();
  if (!discovering.value || document.visibilityState === "hidden") {
    return;
  }

  discoveryPollTimer = window.setTimeout(() => {
    void pollDiscovery();
  }, 2_500);
}

async function pollDiscovery(): Promise<void> {
  if (!discovering.value || discoveryPollPending) return;

  discoveryPollPending = true;
  try {
    const response = await api.getCandidates(publicId.value);
    applyDiscoveryMetadata(response);
    applyCandidates(response.items);

    if (discoveryFinished(response)) {
      finishDiscovery();
    } else {
      scheduleDiscoveryPoll();
    }
  } catch (error: unknown) {
    loadError.value =
      error instanceof Error
        ? error.message
        : "Live discovery updates were interrupted. Retry to refresh the current results.";
    scheduleDiscoveryPoll();
  } finally {
    discoveryPollPending = false;
  }
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "hidden") {
    clearDiscoveryTimer();
  } else if (discovering.value) {
    void pollDiscovery();
  }
}

async function loadBusinesses(forceDiscovery = false): Promise<void> {
  finishDiscovery();
  loading.value = true;
  loadError.value = "";

  try {
    await nextTick();
    let response: CandidateResponse = await api.getCandidates(publicId.value);
    applyDiscoveryMetadata(response);

    if (forceDiscovery || response.items.length === 0) {
      discovering.value = true;
      if (forceDiscovery || response.status?.toLowerCase() !== "discovering") {
        response = await api.discoverBusinesses(publicId.value);
        applyDiscoveryMetadata(response);
      }
    }

    applyCandidates(response.items);
    if (discovering.value) {
      if (discoveryFinished(response)) finishDiscovery();
      else scheduleDiscoveryPoll();
    }
  } catch (error: unknown) {
    finishDiscovery();
    loadError.value =
      error instanceof Error
        ? error.message
        : "Relay could not load matched businesses.";
  } finally {
    loading.value = false;
  }
}

function candidateTone(status: string): "neutral" | "success" | "warning" {
  if (["discovered", "shortlisted"].includes(status.toLowerCase())) {
    return "success";
  }
  if (["declined", "excluded"].includes(status.toLowerCase())) return "warning";
  return "neutral";
}

function candidateStatus(status: string): string {
  const normalized = status.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function candidateNote(business: CandidateBusiness): string {
  if (!business.phone) return "No callable phone number was returned";
  if (!isCandidateSelectable(business)) {
    return `${candidateStatus(business.status)} candidates cannot be added to a new run`;
  }

  return typeof business.distanceMiles === "number"
    ? `${business.distanceMiles.toFixed(1)} miles from the route`
    : "Matched to this moving request";
}

function candidateSource(source: string): string {
  if (source.toLowerCase().includes("fixture")) return "Relay fixture data";
  return source.replaceAll("-", " ");
}

async function startCalls(): Promise<void> {
  if (selectedCount.value < 3 || starting.value) return;

  starting.value = true;
  startError.value = "";

  try {
    const selectedIds = businesses.value
      .filter(
        (business) => business.selected && isCandidateSelectable(business),
      )
      .map((business) => business.id);
    const run = await api.startRun(publicId.value, selectedIds);

    persistSelection();
    setCurrent(publicId.value, run.id);
    await router.push({
      path: `/requests/${encodeURIComponent(publicId.value)}/workspace`,
      query: { run: run.id },
    });
  } catch (error: unknown) {
    startError.value =
      error instanceof Error
        ? error.message
        : "Relay could not start these calls.";
  } finally {
    starting.value = false;
  }
}

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void loadBusinesses();
});

onBeforeUnmount(() => {
  clearDiscoveryTimer();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <AppShell>
    <main id="main-content" class="business-page flow-page">
      <header class="flow-header">
        <div>
          <div class="flow-crumbs">
            <NuxtLink to="/dashboard">Requests</NuxtLink><span>/</span
            ><NuxtLink
              :to="`/requests/${encodeURIComponent(publicId)}/review`"
              >{{ publicId }}</NuxtLink
            ><span>/</span><span>Businesses</span>
          </div>
          <h1>Approve businesses to call</h1>
          <p>
            Relay found businesses that match the confirmed route, date, and
            service scope. Select at least three for a useful comparison.
          </p>
        </div>
        <StatusBadge :dot="false" tone="blue"
          >{{ selectedCount }} selected</StatusBadge
        >
      </header>

      <ApiFeedback
        :message="loadError"
        :pending="loading || discovering"
        @retry="loadBusinesses"
      />
      <ApiFeedback
        v-if="startError"
        :message="startError"
        @retry="startCalls"
      />

      <section v-if="!loading" class="discovery-source" role="status">
        <div>
          <StatusBadge
            :dot="discoveryStatus === 'discovering'"
            :tone="discoveryMode === 'fixture' ? 'warning' : 'neutral'"
          >
            {{ discoveryModeLabel }}
          </StatusBadge>
          <strong>{{ discoveryModeCopy }}</strong>
        </div>
        <span v-if="discoveryStatus">{{
          candidateStatus(discoveryStatus)
        }}</span>
      </section>

      <div v-if="!loading" class="business-layout">
        <section class="business-list-card">
          <div class="list-toolbar">
            <div>
              <strong>{{ eligibleCount }} callable businesses</strong
              ><span
                >{{ businesses.length }} total candidates matched to the
                confirmed brief</span
              >
            </div>
            <label class="sort-control">
              <span class="sr-only">Sort businesses</span>
              <select
                v-model="sortBy"
                aria-label="Sort businesses"
                :disabled="starting"
              >
                <option value="match">Sort: Best match</option>
                <option value="rating">Sort: Rating</option>
                <option value="distance">Sort: Distance</option>
              </select>
            </label>
          </div>
          <article
            v-for="business in sortedBusinesses"
            :key="business.id"
            class="business-row"
            :class="{
              'business-row--selected': business.selected,
              'business-row--unavailable': !isCandidateSelectable(business),
            }"
          >
            <label class="business-check"
              ><input
                v-model="business.selected"
                :disabled="starting || !isCandidateSelectable(business)"
                type="checkbox"
                @change="persistSelection"
              /><span aria-hidden="true">✓</span
              ><span class="sr-only">Select {{ business.name }}</span></label
            >
            <span class="business-monogram" aria-hidden="true">{{
              business.name
                .split(" ")
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
            }}</span>
            <div class="business-identity">
              <div>
                <h2>{{ business.name }}</h2>
                <StatusBadge
                  :dot="false"
                  :tone="candidateTone(business.status)"
                  >{{ candidateStatus(business.status) }}</StatusBadge
                >
              </div>
              <p>{{ business.location }}</p>
              <small>{{ candidateNote(business) }}</small>
            </div>
            <dl class="business-facts">
              <div>
                <dt>Rating</dt>
                <dd>
                  <span aria-hidden="true">★</span>
                  {{ business.rating ?? "Not rated" }}
                  <small>({{ business.reviewCount ?? 0 }})</small>
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{{ business.phone ?? "Not provided" }}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{{ candidateSource(business.source) }}</dd>
              </div>
            </dl>
            <button
              :aria-expanded="expandedBusiness === business.id"
              :aria-label="`View details for ${business.name}`"
              class="details-button"
              type="button"
              @click="toggleDetails(business.id)"
            >
              <svg
                aria-hidden="true"
                :class="{
                  'details-button__icon--expanded':
                    expandedBusiness === business.id,
                }"
                viewBox="0 0 20 20"
              >
                <path d="m7 4 6 6-6 6" />
              </svg>
            </button>
            <dl
              v-if="expandedBusiness === business.id"
              class="business-details"
            >
              <div>
                <dt>Why it matches</dt>
                <dd>{{ candidateNote(business) }}.</dd>
              </div>
              <div>
                <dt>Coverage check</dt>
                <dd>
                  {{
                    isCandidateSelectable(business)
                      ? "Eligible for this call plan."
                      : "Not eligible for a new call from its current listing state."
                  }}
                </dd>
              </div>
              <div>
                <dt>Discovery source</dt>
                <dd>{{ candidateSource(business.source) }}</dd>
              </div>
            </dl>
          </article>
          <section
            v-if="businesses.length > 0 && eligibleCount < 3"
            class="business-recovery"
            role="status"
          >
            <div>
              <h2>
                {{
                  discovering
                    ? "Still searching for callable businesses…"
                    : "More callable businesses are needed"
                }}
              </h2>
              <p>
                {{
                  discovering
                    ? `Relay has ${eligibleCount} eligible ${eligibleCount === 1 ? "business" : "businesses"} so far and will keep this list updated.`
                    : `Only ${eligibleCount} eligible ${eligibleCount === 1 ? "business is" : "businesses are"} available. A call run needs at least three.`
                }}
              </p>
            </div>
            <div class="business-recovery__actions">
              <button
                class="button button--secondary"
                :disabled="discovering"
                type="button"
                @click="loadBusinesses(true)"
              >
                {{ discovering ? "Searching…" : "Discover again" }}
              </button>
              <NuxtLink
                class="button button--secondary"
                :to="`/requests/${encodeURIComponent(publicId)}/review`"
              >
                Review brief
              </NuxtLink>
            </div>
          </section>
          <div v-if="businesses.length === 0" class="business-empty">
            <h2>
              {{
                discovering
                  ? "Finding matched businesses…"
                  : "No eligible businesses yet"
              }}
            </h2>
            <p>
              {{
                discovering
                  ? "Relay is checking service coverage and listing evidence. You can leave this tab and return while it continues."
                  : "Run discovery again to find businesses for this confirmed brief."
              }}
            </p>
            <button
              class="button button--secondary"
              :disabled="discovering"
              type="button"
              @click="loadBusinesses(true)"
            >
              {{ discovering ? "Searching…" : "Discover businesses" }}
            </button>
          </div>
        </section>

        <aside class="launch-panel">
          <div class="launch-panel__top">
            <span>Call plan</span>
            <h2>Ready to contact {{ selectedCount }} businesses</h2>
            <p>
              Each business receives the same confirmed specification, and every
              outcome remains visible.
            </p>
          </div>
          <details class="launch-policy">
            <summary>Review calling safeguards</summary>
            <ol>
              <li>
                <span aria-hidden="true">1</span>
                <div>
                  <strong>Confirm identity</strong
                  ><small
                    >Relay states it represents {{ representedAs }}.</small
                  >
                </div>
              </li>
              <li>
                <span aria-hidden="true">2</span>
                <div>
                  <strong>Introduce Relay and the call’s purpose</strong
                  ><small
                    >Sara states her name, Relay role, and reason for calling.
                    If asked whether she is automated, she answers
                    plainly.</small
                  >
                </div>
              </li>
              <li>
                <span aria-hidden="true">3</span>
                <div>
                  <strong>Request itemization</strong
                  ><small>Unknown fees stay marked unconfirmed.</small>
                </div>
              </li>
            </ol>
          </details>
          <div class="consent-note">
            <span aria-hidden="true">✓</span>
            <p>
              Calling and recording consent is recorded on the confirmed brief.
            </p>
          </div>
          <button
            class="button button--blue"
            :disabled="selectedCount < 3 || starting || discovering"
            type="button"
            @click="startCalls"
          >
            {{
              starting
                ? "Starting calls…"
                : eligibleCount < 3
                  ? `${3 - eligibleCount} more callable ${3 - eligibleCount === 1 ? "business" : "businesses"} required`
                  : selectedCount < 3
                    ? `Select ${3 - selectedCount} more`
                    : `Start ${selectedCount} calls`
            }}
            <span v-if="!starting" aria-hidden="true">→</span>
          </button>
          <small>
            Nothing is booked automatically. You review every quote and choose
            the final decision.
          </small>
        </aside>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.flow-page {
  margin: 0 auto;
  max-width: var(--relay-width-wide);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.flow-header {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 25px;
}
.flow-crumbs {
  color: var(--relay-faint);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 7px;
  margin-bottom: 10px;
}
.flow-crumbs a:hover {
  color: var(--relay-blue);
}
.flow-header h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 560;
  letter-spacing: -0.05em;
  margin-bottom: 8px;
}
.flow-header p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: 1.55;
  margin: 0;
  max-width: 680px;
}
.business-layout {
  align-items: start;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) 310px;
}
.discovery-source {
  align-items: center;
  background: var(--relay-surface-soft, #f7f8fb);
  border: 1px solid var(--relay-line);
  border-radius: 12px;
  display: flex;
  gap: var(--relay-space-4);
  justify-content: space-between;
  margin-bottom: var(--relay-space-4);
  padding: var(--relay-space-3) var(--relay-space-4);
}
.discovery-source > div {
  align-items: center;
  display: flex;
  gap: var(--relay-space-3);
}
.discovery-source strong {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  font-weight: 500;
  line-height: var(--relay-leading-meta);
}
.discovery-source > span {
  color: var(--relay-faint);
  flex: 0 0 auto;
  font-size: var(--relay-text-meta);
}
.business-list-card,
.launch-panel {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
}
.list-toolbar {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
}
.list-toolbar > div {
  display: grid;
  gap: 3px;
}
.list-toolbar strong {
  font-size: var(--relay-text-control);
  font-weight: 620;
}
.list-toolbar span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.sort-control select {
  appearance: none;
  background: white;
  border: 1px solid var(--relay-line-strong);
  border-radius: 8px;
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 0 28px 0 10px;
}
.sort-control {
  position: relative;
}
.sort-control::after {
  color: var(--relay-faint);
  content: "⌄";
  font-size: var(--relay-text-meta);
  pointer-events: none;
  position: absolute;
  right: 10px;
  top: 12px;
}
.business-row {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  gap: 12px;
  grid-template-columns: auto auto minmax(190px, 1fr) minmax(290px, 0.9fr) auto;
  padding: 18px 20px;
  transition: background 0.15s ease;
}
.business-row:last-child {
  border-bottom: 0;
}
.business-row--selected {
  background: #fafbff;
}
.business-row--unavailable {
  background: #fbfbfa;
}
.business-row--unavailable .business-identity,
.business-row--unavailable .business-facts {
  opacity: 0.72;
}
.business-check {
  cursor: pointer;
}
.business-check input {
  clip: rect(0 0 0 0);
  position: absolute;
}
.business-check > span:not(.sr-only) {
  align-items: center;
  border: 1px solid var(--relay-line-strong);
  border-radius: 6px;
  color: transparent;
  display: flex;
  font-size: var(--relay-text-meta);
  height: 19px;
  justify-content: center;
  width: 19px;
}
.business-check input:checked + span {
  background: var(--relay-blue);
  border-color: var(--relay-blue);
  color: white;
}
.business-check input:focus-visible + span {
  outline: 3px solid var(--relay-blue-soft);
}
.business-check input:disabled + span {
  cursor: not-allowed;
  opacity: 0.6;
}
.business-monogram {
  align-items: center;
  background: #f1f2f4;
  border-radius: 9px;
  color: var(--relay-muted);
  display: flex;
  font-size: var(--relay-text-meta);
  font-weight: 650;
  height: 38px;
  justify-content: center;
  width: 38px;
}
.business-identity > div {
  align-items: center;
  display: flex;
  gap: 8px;
}
.business-identity h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0;
}
.business-identity p,
.business-identity small {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  margin: 6px 0 0;
}
.business-identity small {
  color: var(--relay-faint);
  display: block;
  margin-top: 4px;
}
.business-facts {
  display: grid;
  grid-template-columns: 0.7fr 1.1fr 1fr;
  margin: 0;
}
.business-facts dt {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-bottom: 5px;
}
.business-facts dd {
  color: var(--relay-ink-soft);
  font-size: var(--relay-text-meta);
  margin: 0;
}
.business-facts dd > span {
  color: #df9d17;
}
.business-facts dd small {
  color: var(--relay-faint);
}
.details-button {
  background: transparent;
  border: 0;
  color: var(--relay-faint);
  padding: 6px;
}
.details-button svg {
  fill: none;
  height: 18px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.6;
  width: 18px;
}
.details-button__icon--expanded {
  transform: rotate(90deg);
}
.business-details {
  background: #f7f8fb;
  border-radius: 10px;
  display: grid;
  gap: 18px;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 2px 0 0;
  padding: 14px 16px;
}
.business-details dt {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-bottom: 5px;
}
.business-details dd {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.launch-panel {
  padding: 21px;
  position: sticky;
  top: 84px;
}
.launch-panel__top > span {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.launch-panel h2 {
  font-size: var(--relay-text-section-title);
  font-weight: 620;
  line-height: 1.35;
  margin: 8px 0;
}
.launch-panel__top p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
}
.launch-panel ol {
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 15px;
  list-style: none;
  margin: var(--relay-space-3) 0 0;
  padding: 18px 0;
}
.launch-panel li {
  display: grid;
  gap: 9px;
  grid-template-columns: auto 1fr;
}
.launch-panel li > span {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 99px;
  color: var(--relay-blue);
  display: flex;
  font-size: var(--relay-text-meta);
  height: 20px;
  justify-content: center;
  width: 20px;
}
.launch-panel li strong {
  display: block;
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.launch-panel li small {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin-top: 3px;
}
.consent-note {
  align-items: flex-start;
  background: #f2faf5;
  border: 1px solid #dceee3;
  border-radius: 10px;
  display: flex;
  gap: 8px;
  margin-bottom: 14px;
  padding: 11px;
}
.consent-note span {
  color: var(--relay-green);
}
.consent-note p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.launch-panel .button {
  width: 100%;
}
.launch-panel .button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
  transform: none;
}
.launch-panel > small {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin-top: 10px;
  text-align: center;
}
.launch-policy {
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  margin: var(--relay-space-4) 0;
  padding: var(--relay-space-3) 0;
}
.launch-policy summary {
  color: var(--relay-blue);
  cursor: pointer;
  font-size: var(--relay-text-meta);
  font-weight: 620;
}
.business-empty {
  display: grid;
  justify-items: start;
  padding: var(--relay-space-10) var(--relay-space-5);
}
.business-recovery {
  align-items: center;
  background: #fff9ed;
  border-top: 1px solid #f0dfba;
  display: flex;
  gap: var(--relay-space-4);
  justify-content: space-between;
  padding: var(--relay-space-5);
}
.business-recovery h2 {
  font-size: var(--relay-text-card-title);
  margin: 0 0 var(--relay-space-1);
}
.business-recovery p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.business-recovery__actions {
  display: flex;
  flex: 0 0 auto;
  gap: var(--relay-space-2);
}
.business-empty h2 {
  font-size: var(--relay-text-card-title);
  margin: 0 0 var(--relay-space-2);
}
.business-empty p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  margin: 0 0 var(--relay-space-5);
}
@media (max-width: 1024px) {
  .business-layout {
    grid-template-columns: 1fr;
  }
  .launch-panel {
    position: static;
  }
  .business-row {
    grid-template-columns: auto auto 1fr auto;
  }
  .business-facts {
    grid-column: 3 / span 2;
  }
  .details-button {
    grid-column: 4;
    grid-row: 1;
  }
}
@media (max-width: 640px) {
  .flow-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .flow-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .discovery-source,
  .discovery-source > div {
    align-items: flex-start;
    flex-direction: column;
  }
  .list-toolbar {
    align-items: flex-start;
    flex-direction: column;
    gap: var(--relay-space-3);
  }
  .business-row {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
  }
  .business-facts {
    grid-column: 2 / span 3;
    gap: 12px;
    grid-template-columns: 1fr 1fr;
  }
  .details-button {
    grid-column: 4;
    grid-row: 1;
    justify-self: end;
  }
  .business-details {
    gap: 13px;
    grid-template-columns: 1fr;
  }
  .business-recovery {
    align-items: flex-start;
    flex-direction: column;
  }
  .business-recovery__actions {
    flex-wrap: wrap;
  }
}
</style>
