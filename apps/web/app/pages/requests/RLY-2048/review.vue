<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";

import type { JobDetail } from "~/types/api";
import { formatCurrency } from "~/utils/currency";
import {
  accessSummary,
  createMovingSpecification,
  homeSizeLabel,
  inventorySummary,
} from "~/utils/job-specification";

useSeoMeta({ title: "Review brief · Relay" });

const api = useRelayApi();
const { publicId, setCurrent } = useRequestContext();
const editing = ref(false);
const job = ref<JobDetail | null>(null);
const loading = ref(true);
const loadError = ref("");
const actionError = ref("");
const saving = ref(false);
const confirming = ref(false);
const lastAction = ref<"confirm" | "save">("save");
const callingConsent = ref(false);
const recordingConsent = ref(false);
const briefForm = ref<HTMLFormElement | null>(null);
const form = ref({
  access: "",
  budget: "Best value, not a fixed cap",
  date: "",
  destination: "",
  home: "",
  inventory: "",
  notes: "",
  pickup: "",
  window: "Flexible timing",
});

const confirmed = computed(
  () =>
    Boolean(job.value?.confirmedVersion) &&
    job.value?.status.toLowerCase() !== "draft",
);
const version = computed(() => {
  const confirmedVersion = job.value?.confirmedVersion?.version ?? 0;
  return Math.max(1, confirmedVersion + (confirmed.value ? 0 : 1));
});
const nextVersion = computed(() =>
  confirmed.value ? version.value + 1 : version.value,
);
const businessesRoute = computed(
  () => `/requests/${encodeURIComponent(publicId.value)}/businesses`,
);
const draftLocked = computed(() =>
  ["calling", "comparing", "paused", "queued"].includes(
    job.value?.stage.toLowerCase() ?? "",
  ),
);

function timingPreference(notes?: string): string {
  const match = notes?.match(/Timing preference:\s*([^.]*)/i);
  return match?.[1]?.trim() || "Flexible timing";
}

function confirmedNotes(notes?: string): string {
  return (notes ?? "")
    .replace(/(?:^|\.\s*)Timing preference:\s*[^.]*(?:\.|$)/gi, "")
    .trim();
}

function applyJob(detail: JobDetail): void {
  job.value = detail;
  form.value = {
    access: accessSummary(detail.draft),
    budget: detail.draft.budget
      ? formatCurrency(detail.draft.budget.amountMinor / 100)
      : "Best value, not a fixed cap",
    date: detail.draft.movingDate,
    destination: detail.draft.dropoffAddress.formattedAddress,
    home: homeSizeLabel(detail.draft),
    inventory: inventorySummary(detail.draft),
    notes: confirmedNotes(detail.draft.notes),
    pickup: detail.draft.pickupAddress.formattedAddress,
    window: timingPreference(detail.draft.notes),
  };
  callingConsent.value = detail.consent.calling;
  recordingConsent.value = detail.consent.recording;
  setCurrent(detail.publicId, detail.latestRunId ?? undefined);
}

async function loadJob(): Promise<void> {
  loading.value = true;
  loadError.value = "";

  try {
    await nextTick();
    applyJob(await api.getJob(publicId.value));
  } catch (error: unknown) {
    loadError.value =
      error instanceof Error
        ? error.message
        : "Relay could not load this moving brief.";
  } finally {
    loading.value = false;
  }
}

function startEditing(): void {
  if (draftLocked.value) return;

  editing.value = true;
  actionError.value = "";
}

async function saveChanges(): Promise<void> {
  if (!editing.value || saving.value) return;

  if (!briefForm.value?.checkValidity()) {
    briefForm.value?.reportValidity();
    return;
  }

  saving.value = true;
  actionError.value = "";
  lastAction.value = "save";

  try {
    const specification = createMovingSpecification({
      access: form.value.access,
      budget: form.value.budget,
      destination: form.value.destination,
      flexibility: form.value.window,
      homeSize: form.value.home,
      inventory: form.value.inventory,
      moveDate: form.value.date,
      origin: form.value.pickup,
    });
    const notes = form.value.notes.trim();
    const updated = await api.updateJobDraft(publicId.value, {
      ...specification,
      notes: [notes, `Timing preference: ${form.value.window}`]
        .filter(Boolean)
        .join(". "),
      packingPreference:
        job.value?.draft.packingPreference ?? specification.packingPreference,
      ...(job.value?.draft.specialItems
        ? { specialItems: job.value.draft.specialItems }
        : {}),
    });

    applyJob(updated);
    editing.value = false;
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error
        ? error.message
        : "Relay could not save this draft.";
  } finally {
    saving.value = false;
  }
}

async function confirmVersion(): Promise<void> {
  if (
    editing.value ||
    confirming.value ||
    !callingConsent.value ||
    !recordingConsent.value
  ) {
    return;
  }

  confirming.value = true;
  actionError.value = "";
  lastAction.value = "confirm";

  try {
    applyJob(
      await api.confirmJob(publicId.value, {
        callingConsent: true,
        recordingConsent: true,
      }),
    );
  } catch (error: unknown) {
    actionError.value =
      error instanceof Error
        ? error.message
        : "Relay could not confirm this brief.";
  } finally {
    confirming.value = false;
  }
}

function retryAction(): void {
  if (lastAction.value === "confirm") {
    void confirmVersion();
    return;
  }

  void saveChanges();
}

onMounted(loadJob);
</script>

<template>
  <AppShell>
    <main id="main-content" class="review-page flow-page">
      <header class="flow-header">
        <div>
          <div class="flow-crumbs">
            <NuxtLink to="/dashboard">Requests</NuxtLink><span>/</span
            ><span>{{ publicId }}</span>
          </div>
          <h1>Review the moving brief</h1>
          <p>
            This exact version is shared with every business. Nothing changes
            during calls unless you approve a new version.
          </p>
        </div>
        <StatusBadge
          v-if="job"
          :tone="confirmed && !editing ? 'success' : 'warning'"
        >
          {{
            editing
              ? `Editing version ${nextVersion}`
              : confirmed
                ? `Version ${version} confirmed`
                : `Version ${version} needs confirmation`
          }}
        </StatusBadge>
      </header>

      <ApiFeedback :message="loadError" :pending="loading" @retry="loadJob" />
      <ApiFeedback
        v-if="actionError"
        :message="actionError"
        @retry="retryAction"
      />

      <div v-if="job && !loading" class="flow-layout">
        <section class="flow-card brief-form-card">
          <header class="flow-card__header">
            <div>
              <span
                >Specification · Version
                {{ editing ? nextVersion : version }}</span
              >
              <h2>{{ job.title }}</h2>
            </div>
            <button
              v-if="editing"
              class="text-button"
              :disabled="saving"
              form="moving-brief-form"
              type="submit"
            >
              {{ saving ? "Saving…" : "Save changes" }}
            </button>
            <button
              v-else
              class="text-button"
              :disabled="confirming || draftLocked"
              type="button"
              @click="startEditing"
            >
              {{ draftLocked ? "Locked during calls" : "Edit brief" }}
            </button>
          </header>

          <form
            id="moving-brief-form"
            ref="briefForm"
            class="brief-form"
            @submit.prevent="saveChanges"
          >
            <div class="form-section">
              <div class="form-section__heading">
                <span>01</span>
                <div>
                  <h3>Route and schedule</h3>
                  <p>Where and when the job takes place.</p>
                </div>
              </div>
              <div class="field-grid">
                <label
                  >Pickup<input
                    v-model="form.pickup"
                    :disabled="!editing || saving"
                    required /></label
                ><label
                  >Destination<input
                    v-model="form.destination"
                    :disabled="!editing || saving"
                    required /></label
                ><label
                  >Move date<input
                    v-model="form.date"
                    :disabled="!editing || saving"
                    required
                    type="date" /></label
                ><label
                  >Arrival window<input
                    v-model="form.window"
                    :disabled="!editing || saving"
                    required
                /></label>
              </div>
            </div>
            <div class="form-section">
              <div class="form-section__heading">
                <span>02</span>
                <div>
                  <h3>Property and inventory</h3>
                  <p>The scope businesses must price consistently.</p>
                </div>
              </div>
              <div class="field-grid">
                <label
                  >Home size<input
                    v-model="form.home"
                    :disabled="!editing || saving"
                    required /></label
                ><label
                  >Target budget<input
                    v-model="form.budget"
                    :disabled="!editing || saving"
                    required /></label
                ><label class="field-grid__wide"
                  >Inventory<input
                    v-model="form.inventory"
                    :disabled="!editing || saving"
                    required /></label
                ><label class="field-grid__wide"
                  >Access constraints<input
                    v-model="form.access"
                    :disabled="!editing || saving"
                    required
                /></label>
              </div>
            </div>
            <div class="form-section">
              <div class="form-section__heading">
                <span>03</span>
                <div>
                  <h3>Notes and leverage</h3>
                  <p>Preferences Relay can use without changing scope.</p>
                </div>
              </div>
              <label
                >Confirmed notes<textarea
                  v-model="form.notes"
                  :disabled="!editing || saving"
                  rows="3"
                />
              </label>
            </div>
          </form>
        </section>

        <aside class="flow-aside">
          <section class="flow-card source-card">
            <span class="source-card__label">Input sources</span>
            <h2>One unified brief</h2>
            <div class="source-item">
              <span class="source-icon source-icon--voice" aria-hidden="true"
                ><svg viewBox="0 0 20 20">
                  <path
                    d="M10 2.5a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0v-4a3 3 0 0 0-3-3Z"
                  />
                  <path
                    d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5M7.5 17.5h5"
                  /></svg
              ></span>
              <div>
                <strong>Guided brief</strong
                ><small>Structured moving details</small>
              </div>
              <StatusBadge :dot="false" tone="success">Loaded</StatusBadge>
            </div>
            <div class="source-item">
              <span class="source-icon" aria-hidden="true"
                ><svg viewBox="0 0 20 20">
                  <path d="M5 2.5h7l3 3v12H5v-15Z" />
                  <path d="M12 2.5v3h3M7.5 9h5M7.5 12h5" /></svg
              ></span>
              <div>
                <strong>Relay specification</strong
                ><small
                  >{{ job.draft.inventory.length }} normalized items</small
                >
              </div>
              <StatusBadge :dot="false">API synced</StatusBadge>
            </div>
            <p class="source-card__fine">
              Fields with lower confidence remain visible for review and are
              never silently assumed.
            </p>
          </section>

          <section class="flow-card confirmation-card">
            <div
              class="confirmation-card__title"
              :class="{
                'confirmation-card__title--pending': editing || !confirmed,
              }"
            >
              <span aria-hidden="true">{{
                confirmed && !editing ? "✓" : "!"
              }}</span>
              <div>
                <h2>
                  {{
                    editing
                      ? "Finish editing"
                      : confirmed
                        ? "Ready for business review"
                        : `Confirm version ${version}`
                  }}
                </h2>
                <p>
                  {{
                    editing
                      ? "Save this draft before confirming its replacement version."
                      : confirmed
                        ? `Version ${version} is the exact brief businesses will receive.`
                        : `Version ${version} replaces the prior brief only after you confirm it.`
                  }}
                </p>
              </div>
            </div>
            <ul>
              <li
                :class="{
                  'confirmation-card__pending-item': editing || !confirmed,
                }"
              >
                <span aria-hidden="true">{{
                  confirmed && !editing ? "✓" : "!"
                }}</span>
                {{
                  editing
                    ? "Draft edits must be saved and confirmed"
                    : confirmed
                      ? `Version ${version} explicitly confirmed`
                      : `Version ${version} awaits your confirmation`
                }}
              </li>
              <li>
                <span aria-hidden="true">✓</span> Exact inventory confirmed
              </li>
              <li>
                <span aria-hidden="true">✓</span> Access constraints included
              </li>
            </ul>
            <div class="consent-controls">
              <label>
                <input
                  v-model="callingConsent"
                  :disabled="confirmed || confirming || editing"
                  type="checkbox"
                />
                <span>
                  <strong>AI-assisted calling consent</strong>
                  <small
                    >Relay may call the approved businesses as your disclosed
                    representative.</small
                  >
                </span>
              </label>
              <label>
                <input
                  v-model="recordingConsent"
                  :disabled="confirmed || confirming || editing"
                  type="checkbox"
                />
                <span>
                  <strong>Recording and evidence consent</strong>
                  <small
                    >Relay may retain recordings and transcripts for this
                    request.</small
                  >
                </span>
              </label>
            </div>
            <button
              v-if="editing"
              class="button button--secondary"
              disabled
              type="button"
            >
              {{ saving ? "Saving changes…" : "Save changes first" }}
            </button>
            <button
              v-else-if="!confirmed"
              class="button button--blue"
              :disabled="confirming || !callingConsent || !recordingConsent"
              type="button"
              @click="confirmVersion"
            >
              {{
                confirming
                  ? "Confirming version…"
                  : `Confirm version ${version}`
              }}
              <span aria-hidden="true">✓</span>
            </button>
            <NuxtLink v-else class="button button--blue" :to="businessesRoute"
              >Review businesses <span aria-hidden="true">→</span></NuxtLink
            >
            <small v-if="editing">
              Business approval stays locked while this draft is being edited.
            </small>
            <small v-else-if="!confirmed">
              Accept both consent items to confirm version {{ version }} and
              unlock business approval.
            </small>
            <small v-else>
              Calls cannot start until you approve the business list.
            </small>
          </section>
        </aside>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.flow-page {
  margin: 0 auto;
  max-width: var(--relay-width-standard);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.flow-header {
  align-items: flex-end;
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
  max-width: 660px;
}
.flow-layout {
  align-items: start;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) 320px;
}
.flow-aside {
  display: grid;
  gap: 14px;
}
.flow-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
}
.flow-card__header {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 20px 22px;
}
.flow-card__header span,
.source-card__label {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  letter-spacing: 0.07em;
  margin-bottom: 5px;
  text-transform: uppercase;
}
.flow-card__header h2,
.source-card h2,
.confirmation-card h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0;
}
.text-button {
  background: transparent;
  border: 0;
  color: var(--relay-blue);
  font-size: var(--relay-text-control);
  font-weight: 610;
  min-height: 40px;
  padding: 0 var(--relay-space-2);
}
.text-button:disabled {
  cursor: wait;
  opacity: 0.6;
}
.form-section {
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  gap: 28px;
  grid-template-columns: 185px 1fr;
  padding: 24px 22px;
}
.form-section:last-child {
  border-bottom: 0;
}
.form-section__heading {
  display: flex;
  gap: 10px;
}
.form-section__heading > span {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 99px;
  color: var(--relay-blue);
  display: flex;
  flex: 0 0 auto;
  font-size: var(--relay-text-meta);
  height: 24px;
  justify-content: center;
  width: 24px;
}
.form-section h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 2px 0 5px;
}
.form-section p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.field-grid {
  display: grid;
  gap: 16px 12px;
  grid-template-columns: 1fr 1fr;
}
.field-grid__wide {
  grid-column: span 2;
}
.brief-form label {
  color: var(--relay-faint);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 7px;
}
.brief-form input,
.brief-form textarea {
  background: #fbfbfc;
  border: 1px solid var(--relay-line);
  border-radius: 9px;
  color: var(--relay-ink);
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 9px 11px;
  resize: vertical;
}
.brief-form input:disabled,
.brief-form textarea:disabled {
  background: transparent;
  border-color: transparent;
  color: var(--relay-ink-soft);
  opacity: 1;
  padding-left: 0;
}
.brief-form input:focus,
.brief-form textarea:focus {
  border-color: var(--relay-blue);
  outline: 3px solid var(--relay-blue-soft);
}
.source-card,
.confirmation-card {
  padding: 20px;
}
.source-card h2 {
  margin-bottom: 18px;
}
.source-item {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 9px;
  grid-template-columns: auto 1fr auto;
  padding: 14px 0;
}
.source-icon {
  align-items: center;
  background: #f2f3f5;
  border-radius: 8px;
  display: flex;
  height: 31px;
  justify-content: center;
  width: 31px;
}
.source-icon--voice {
  background: var(--relay-blue-soft);
  color: var(--relay-blue);
}
.source-icon svg {
  fill: none;
  height: 16px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  width: 16px;
}
.source-item strong {
  display: block;
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.source-item small,
.source-card__fine {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.source-card__fine {
  line-height: 1.55;
  margin: 9px 0 0;
}
.confirmation-card__title {
  align-items: flex-start;
  display: flex;
  gap: 10px;
}
.confirmation-card__title > span {
  align-items: center;
  background: var(--relay-green);
  border-radius: 99px;
  color: white;
  display: flex;
  flex: 0 0 auto;
  font-size: var(--relay-text-meta);
  height: 22px;
  justify-content: center;
  width: 22px;
}
.confirmation-card__title--pending > span {
  background: var(--relay-amber);
}
.confirmation-card__title p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 5px 0 0;
}
.confirmation-card ul {
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 10px;
  list-style: none;
  margin: 18px 0;
  padding: 16px 0;
}
.confirmation-card li {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
}
.confirmation-card li span {
  color: var(--relay-green);
  margin-right: 7px;
}
.consent-controls {
  display: grid;
  gap: var(--relay-space-2);
  margin-bottom: var(--relay-space-4);
}
.consent-controls label {
  align-items: flex-start;
  border: 1px solid var(--relay-line);
  border-radius: 10px;
  cursor: pointer;
  display: grid;
  gap: var(--relay-space-2);
  grid-template-columns: auto 1fr;
  padding: var(--relay-space-3);
}
.consent-controls input {
  accent-color: var(--relay-blue);
  height: 18px;
  margin: 1px 0 0;
  width: 18px;
}
.consent-controls strong,
.consent-controls small {
  display: block;
}
.consent-controls strong {
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.consent-controls small {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin-top: var(--relay-space-1);
}
.confirmation-card .confirmation-card__pending-item,
.confirmation-card .confirmation-card__pending-item span {
  color: var(--relay-amber);
}
.confirmation-card .button {
  width: 100%;
}
.confirmation-card .button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
  transform: none;
}
.confirmation-card > small {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  line-height: 1.5;
  margin-top: 10px;
  text-align: center;
}
@media (max-width: 1024px) {
  .flow-layout {
    grid-template-columns: 1fr;
  }
  .flow-aside {
    grid-template-columns: 1fr 1fr;
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
    gap: 14px;
  }
  .form-section {
    grid-template-columns: 1fr;
  }
  .field-grid {
    grid-template-columns: 1fr;
  }
  .field-grid__wide {
    grid-column: auto;
  }
  .flow-aside {
    grid-template-columns: 1fr;
  }
}
</style>
