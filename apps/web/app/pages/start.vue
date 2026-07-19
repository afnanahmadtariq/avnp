<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import ApiFeedback from "~/components/app/ApiFeedback.vue";
import type { JobSpecification } from "~/types/api";
import {
  extractionConfidenceLabel,
  intakeFileError,
  mergeIntakeExtraction,
  type MovingIntakeFields,
} from "~/utils/intake";
import { createMovingSpecification } from "~/utils/job-specification";

useSeoMeta({
  description: "Create a clear, comparable brief for Relay to negotiate.",
  title: "Start a brief · Relay",
});

const router = useRouter();
const { setCurrent } = useRequestContext();
const intake = useLiveIntake();
const step = ref(1);
type IntakeMethod = "Guided form" | "Upload estimate" | "Voice interview";
const intakeMethod = ref<IntakeMethod>("Guided form");
const budget = ref("Under $2,000");
const flexibility = ref("I can be flexible");
const origin = ref("");
const destination = ref("");
const moveDate = ref("");
const homeSize = ref("2-bedroom apartment");
const inventory = ref("");
const access = ref("");
const stepHeading = ref<HTMLElement | null>(null);
const creating = ref(false);
const createError = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const fileError = ref("");

const progress = computed(() => `${(step.value / 4) * 100}%`);
const intakeBusy = computed(
  () =>
    intake.documentPending.value ||
    intake.voiceActive.value ||
    intake.voiceStatus.value === "processing",
);
const voiceStatusCopy = computed(() => {
  const labels = {
    complete: "Interview processed — review the extracted details next.",
    connecting: "Connecting your private interview…",
    error: "The interview needs your attention.",
    idle: "Your microphone stays off until you start.",
    listening:
      intake.voiceMode.value === "speaking"
        ? "Relay is speaking"
        : "Relay is listening",
    permission: "Waiting for microphone permission…",
    processing: "Securing the transcript and extracting the move details…",
  } as const;

  return labels[intake.voiceStatus.value];
});
const extractionSummary = computed(() =>
  extractionConfidenceLabel(intake.extraction.value),
);

function currentFields(): MovingIntakeFields {
  return {
    access: access.value,
    budget: budget.value,
    destination: destination.value,
    flexibility: flexibility.value,
    homeSize: homeSize.value,
    inventory: inventory.value,
    moveDate: moveDate.value,
    origin: origin.value,
  };
}

function currentSpecification(): JobSpecification {
  return createMovingSpecification(currentFields());
}

function requestTitle(): string {
  const destinationName = destination.value.split(",")[0]?.trim();
  return destinationName ? `${destinationName} move` : "Moving request";
}

function applyExtractedFacts(): void {
  const merged = mergeIntakeExtraction(
    currentFields(),
    intake.extraction.value,
  );
  access.value = merged.access;
  budget.value = merged.budget;
  destination.value = merged.destination;
  flexibility.value = merged.flexibility;
  homeSize.value = merged.homeSize;
  inventory.value = merged.inventory;
  moveDate.value = merged.moveDate;
  origin.value = merged.origin;
}

watch(() => intake.extraction.value, applyExtractedFacts);
watch(
  () => intake.draftPublicId.value,
  (publicId) => {
    if (publicId) setCurrent(publicId);
  },
);
watch(intakeMethod, () => {
  fileError.value = "";
  intake.clearError();
});

async function focusCurrentStep(): Promise<void> {
  await nextTick();
  stepHeading.value?.focus();
}

async function next(): Promise<void> {
  step.value = Math.min(step.value + 1, 4);
  await focusCurrentStep();
}

async function previous(): Promise<void> {
  step.value = Math.max(step.value - 1, 1);
  await focusCurrentStep();
}

async function processDocument(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  fileError.value = intakeFileError(file) ?? "";
  if (fileError.value) {
    input.value = "";
    return;
  }

  await intake.uploadDocument(file, requestTitle());
  input.value = "";
}

async function startVoiceInterview(): Promise<void> {
  await intake.startVoiceInterview(requestTitle());
}

async function finishVoiceInterview(): Promise<void> {
  await intake.finishVoiceInterview();
}

async function createRequest(): Promise<void> {
  if (creating.value) return;

  creating.value = true;
  createError.value = "";

  try {
    const job = await intake.saveDraft(currentSpecification(), requestTitle());

    setCurrent(job.publicId);
    await router.push(`/requests/${encodeURIComponent(job.publicId)}/review`);
  } catch (error: unknown) {
    createError.value =
      error instanceof Error
        ? error.message
        : "Relay could not create this request. Please try again.";
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="brief-page">
    <header class="brief-header container">
      <NuxtLink aria-label="Relay home" to="/">
        <RelayLogo />
      </NuxtLink>
      <NuxtLink class="brief-header__demo" to="/dashboard">
        Already have a request? <span>Open workspace →</span>
      </NuxtLink>
    </header>

    <main id="main-content" class="brief-main container">
      <section class="brief-intro">
        <p class="eyebrow">Your negotiation brief</p>
        <h1>Start with the facts that matter.</h1>
        <p>
          Relay keeps these details fixed across every conversation, so each
          offer comes back genuinely comparable.
        </p>
        <div class="brief-intro__note">
          <span aria-hidden="true">✓</span>
          You always review the final recommendation before anything is booked.
        </div>
      </section>

      <section aria-label="Create your Relay brief" class="brief-card">
        <ApiFeedback
          :message="createError"
          :pending="creating"
          @retry="createRequest"
        />
        <div class="brief-card__progress">
          <div aria-live="polite" role="status">
            <span>Step {{ step }} of 4</span>
            <strong>{{
              step === 1
                ? "Choose an input"
                : step === 2
                  ? "Moving details"
                  : step === 3
                    ? "Priorities"
                    : "Review draft"
            }}</strong>
          </div>
          <div aria-hidden="true" class="progress-line">
            <span :style="{ width: progress }" />
          </div>
        </div>

        <form @submit.prevent="step === 4 ? createRequest() : next()">
          <fieldset v-if="step === 1" class="brief-step">
            <legend ref="stepHeading" tabindex="-1">
              How would you like to build the brief?
            </legend>
            <p class="brief-step__help">
              Every input method produces the same moving specification for your
              review.
            </p>
            <div class="choice-grid choice-grid--three">
              <label
                v-for="option in [
                  'Guided form',
                  'Voice interview',
                  'Upload estimate',
                ]"
                :key="option"
                class="choice-card"
                :class="{
                  'choice-card--disabled': intakeBusy,
                  'choice-card--selected': intakeMethod === option,
                }"
              >
                <input
                  v-model="intakeMethod"
                  :disabled="intakeBusy"
                  :value="option"
                  name="input-method"
                  type="radio"
                />
                <span class="choice-card__dot" aria-hidden="true" />
                <strong>{{ option }}</strong>
                <small>{{
                  option === "Guided form"
                    ? "Enter details step by step"
                    : option === "Voice interview"
                      ? "Talk through your move"
                      : "Extract a quote or inventory"
                }}</small>
              </label>
            </div>

            <div v-if="intakeMethod === 'Guided form'" class="brief-tip">
              <span aria-hidden="true">i</span>
              <p>
                Best when you know the route, date, inventory, and access
                details. You can revise every field before calls begin.
              </p>
            </div>

            <section
              v-else-if="intakeMethod === 'Upload estimate'"
              aria-labelledby="upload-heading"
              class="intake-panel"
            >
              <div class="intake-panel__copy">
                <span aria-hidden="true" class="intake-panel__icon">↑</span>
                <div>
                  <h2 id="upload-heading">Extract the facts from a document</h2>
                  <p>
                    Add an estimate, inventory, or scope sheet. Relay reads the
                    facts, then you verify them in the guided form.
                  </p>
                </div>
              </div>
              <input
                ref="fileInput"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                class="sr-only"
                type="file"
                @change="processDocument"
              />
              <div class="intake-panel__actions">
                <button
                  class="button button--secondary"
                  :disabled="intakeBusy"
                  type="button"
                  @click="fileInput?.click()"
                >
                  {{
                    intake.documentPending.value
                      ? "Reading document…"
                      : "Choose a document"
                  }}
                </button>
                <small>PDF, JPG, PNG, or WebP · up to 20 MB</small>
              </div>
              <p
                v-if="fileError || intake.error.value"
                class="intake-panel__error"
                role="alert"
              >
                {{ fileError || intake.error.value }}
              </p>
              <div
                v-if="intake.processedFileName.value"
                class="intake-result"
                role="status"
              >
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{{ intake.processedFileName.value }}</strong>
                  <small>{{ extractionSummary }} · Details added below</small>
                </div>
              </div>
              <ul
                v-if="intake.extraction.value?.warnings?.length"
                aria-label="Document details needing review"
                class="intake-warnings"
              >
                <li
                  v-for="warning in intake.extraction.value.warnings"
                  :key="warning"
                >
                  {{ warning }}
                </li>
              </ul>
            </section>

            <section
              v-else
              aria-labelledby="voice-heading"
              class="intake-panel"
            >
              <div class="intake-panel__copy">
                <span aria-hidden="true" class="intake-panel__icon">◉</span>
                <div>
                  <h2 id="voice-heading">Talk through the move naturally</h2>
                  <p>
                    Relay asks only the missing questions. End the interview
                    when you are ready, then verify the secured transcript’s
                    extracted facts.
                  </p>
                </div>
              </div>
              <div class="voice-status" aria-live="polite" role="status">
                <span
                  aria-hidden="true"
                  :class="{
                    'voice-status__pulse--active': intake.voiceActive.value,
                  }"
                  class="voice-status__pulse"
                />
                <div>
                  <strong>{{ voiceStatusCopy }}</strong>
                  <small v-if="intake.voiceStatus.value === 'complete'">
                    {{ extractionSummary }}
                  </small>
                  <small v-else-if="intake.voiceStatus.value === 'listening'">
                    {{
                      intake.voiceMode.value === "speaking"
                        ? "You can interrupt at any time."
                        : "Speak normally — pauses are okay."
                    }}
                  </small>
                  <small v-else>
                    Microphone audio is used only for this interview.
                  </small>
                </div>
              </div>
              <p
                v-if="intake.error.value"
                class="intake-panel__error"
                role="alert"
              >
                {{ intake.error.value }}
              </p>
              <div class="intake-panel__actions">
                <button
                  v-if="
                    !intake.voiceActive.value &&
                    intake.voiceStatus.value !== 'processing'
                  "
                  class="button button--secondary"
                  :disabled="intake.documentPending.value"
                  type="button"
                  @click="
                    intake.voiceStatus.value === 'error' &&
                    intake.voiceConversationId.value
                      ? intake.retryVoiceProcessing()
                      : startVoiceInterview()
                  "
                >
                  {{
                    intake.voiceStatus.value === "error" &&
                    intake.voiceConversationId.value
                      ? "Retry processing"
                      : intake.voiceStatus.value === "complete"
                        ? "Start another interview"
                        : "Start voice interview"
                  }}
                </button>
                <button
                  v-else-if="intake.voiceStatus.value !== 'processing'"
                  class="button button--blue"
                  type="button"
                  @click="finishVoiceInterview"
                >
                  Finish and extract details
                </button>
                <small v-if="intake.voiceConversationId.value">
                  Private session connected
                </small>
              </div>
              <ul
                v-if="
                  intake.voiceStatus.value === 'complete' &&
                  intake.extraction.value?.warnings?.length
                "
                aria-label="Interview details needing review"
                class="intake-warnings"
              >
                <li
                  v-for="warning in intake.extraction.value.warnings"
                  :key="warning"
                >
                  {{ warning }}
                </li>
              </ul>
            </section>
          </fieldset>

          <fieldset v-else-if="step === 2" class="brief-step">
            <legend ref="stepHeading" tabindex="-1">
              Tell us about the move.
            </legend>
            <p class="brief-step__help">
              These facts define the scope every business must quote.
            </p>
            <div class="location-grid">
              <label
                >From<input
                  v-model="origin"
                  autocomplete="address-level2"
                  placeholder="Pickup city or full address"
                  required
              /></label>
              <span aria-hidden="true" class="location-grid__arrow">→</span>
              <label
                >To<input
                  v-model="destination"
                  autocomplete="address-level2"
                  placeholder="Destination city or full address"
                  required
              /></label>
            </div>
            <div class="details-grid">
              <label
                ><span>Move date</span
                ><input v-model="moveDate" required type="date"
              /></label>
              <label
                ><span>Home size</span
                ><select v-model="homeSize">
                  <option>Studio apartment</option>
                  <option>1-bedroom apartment</option>
                  <option>2-bedroom apartment</option>
                  <option>3-bedroom home</option>
                </select></label
              >
              <label class="details-grid__wide"
                ><span>Inventory summary</span
                ><input
                  v-model="inventory"
                  placeholder="Example: 20 boxes, sofa, queen bed"
                  required
              /></label>
              <label class="details-grid__wide"
                ><span>Access constraints</span
                ><input
                  v-model="access"
                  placeholder="Stairs, elevators, loading access, parking"
                  required
              /></label>
            </div>
          </fieldset>

          <fieldset v-else-if="step === 3" class="brief-step">
            <legend ref="stepHeading" tabindex="-1">
              Where should Relay focus?
            </legend>
            <p class="brief-step__help">
              We’ll use these preferences to negotiate terms, not just the
              lowest number.
            </p>
            <div class="preference-stack">
              <label>
                <span>Target budget</span>
                <select v-model="budget">
                  <option>Under $2,000</option>
                  <option>$2,000–$2,500</option>
                  <option>Best value, not a fixed cap</option>
                </select>
              </label>
              <label>
                <span>Timing flexibility</span>
                <select v-model="flexibility">
                  <option>I can be flexible</option>
                  <option>I need a specific date</option>
                  <option>I need a specific time window</option>
                </select>
              </label>
            </div>
            <div class="brief-tip">
              <span aria-hidden="true">i</span>
              <p>
                Flexibility can be useful leverage. Relay will never change your
                timing without showing you the trade-off first.
              </p>
            </div>
            <div class="brief-tip">
              <span aria-hidden="true">✓</span>
              <p>
                No business is called from this page. On the next screen you
                will review the exact brief, the recording notice, and the
                evidence-retention terms before giving consent.
                <NuxtLink to="/privacy">Privacy details</NuxtLink>
              </p>
            </div>
          </fieldset>

          <fieldset v-else class="brief-step">
            <legend ref="stepHeading" tabindex="-1">
              Review the draft before confirmation.
            </legend>
            <p class="brief-step__help">
              Review the scope before Relay begins its calls.
            </p>
            <dl class="brief-review">
              <div>
                <dt>Input</dt>
                <dd>{{ intakeMethod }}</dd>
              </div>
              <div>
                <dt>Route</dt>
                <dd>
                  {{ origin }} <span aria-hidden="true">→</span>
                  {{ destination }}
                </dd>
              </div>
              <div>
                <dt>Date and home</dt>
                <dd>{{ moveDate }} · {{ homeSize }}</dd>
              </div>
              <div>
                <dt>Budget and timing</dt>
                <dd>{{ budget }} · {{ flexibility }}</dd>
              </div>
              <div>
                <dt>Inventory</dt>
                <dd>{{ inventory }}</dd>
              </div>
              <div>
                <dt>Access</dt>
                <dd>{{ access }}</dd>
              </div>
            </dl>
            <p class="brief-review__assurance">
              <span aria-hidden="true">✓</span> Next, review source confidence
              and explicitly confirm the exact version used for every call.
            </p>
          </fieldset>

          <div class="brief-actions">
            <button
              v-if="step > 1"
              class="button button--quiet"
              :disabled="creating"
              type="button"
              @click="previous"
            >
              Back
            </button>
            <span v-else />
            <button
              class="button button--blue"
              :disabled="creating || (step === 1 && intakeBusy)"
              type="submit"
            >
              {{
                creating
                  ? "Creating request…"
                  : step === 4
                    ? "Create request"
                    : "Continue"
              }}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.brief-page {
  background: var(--relay-canvas-app);
  min-height: 100vh;
}
.brief-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  min-height: 82px;
}
.brief-header__demo {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
}
.brief-header__demo span {
  color: var(--relay-blue);
  font-weight: 600;
}
.brief-main {
  align-items: center;
  display: grid;
  gap: clamp(42px, 7vw, 92px);
  grid-template-columns: minmax(0, 0.72fr) minmax(500px, 1fr);
  min-height: calc(100vh - 82px);
  padding-bottom: 76px;
  padding-top: 42px;
}
.brief-intro h1 {
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 520;
  letter-spacing: -0.065em;
  line-height: 0.96;
  margin-bottom: 24px;
  max-width: 580px;
}
.brief-intro > p:not(.eyebrow) {
  color: var(--relay-muted);
  font-size: var(--relay-text-body);
  line-height: var(--relay-leading-body);
  max-width: 460px;
}
.brief-intro__note {
  align-items: center;
  color: var(--relay-muted);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 8px;
  line-height: 1.5;
  margin-top: 28px;
  max-width: 420px;
}
.brief-intro__note span,
.brief-review__assurance span {
  color: var(--relay-green);
  font-weight: 700;
}
.brief-card {
  background: rgb(255 255 255 / 88%);
  border: 1px solid rgb(212 209 200 / 85%);
  border-radius: 24px;
  box-shadow: var(--relay-shadow-md);
  overflow: hidden;
}
.brief-card__progress {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 22px 26px;
}
.brief-card__progress > div:first-child {
  display: grid;
  gap: 5px;
}
.brief-card__progress span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.brief-card__progress strong {
  font-size: var(--relay-text-card-title);
  font-weight: 600;
}
.progress-line {
  background: var(--relay-surface-muted);
  border-radius: 99px;
  height: 5px;
  overflow: hidden;
  width: 92px;
}
.progress-line span {
  background: var(--relay-blue);
  border-radius: inherit;
  display: block;
  height: 100%;
  transition: width 260ms ease;
}
.brief-step {
  animation: enter 0.26s ease both;
  border: 0;
  margin: 0;
  min-height: 390px;
  padding: 30px 26px 22px;
}
.brief-step legend {
  font-size: 1.25rem;
  font-weight: 610;
  letter-spacing: -0.035em;
  padding: 0;
}
.brief-step__help {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: 1.6;
  margin: 10px 0 25px;
}
.choice-grid {
  display: grid;
  gap: 9px;
}
.choice-grid--three {
  grid-template-columns: repeat(3, 1fr);
}
.choice-card {
  border: 1px solid var(--relay-line);
  border-radius: 13px;
  cursor: pointer;
  display: grid;
  gap: 13px;
  min-height: 114px;
  padding: 15px;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.choice-card:hover {
  transform: translateY(-2px);
}
.choice-card:focus-within {
  outline: 3px solid rgb(49 87 246 / 24%);
  outline-offset: 2px;
}
.choice-card--selected {
  border-color: var(--relay-blue);
  box-shadow:
    inset 0 0 0 1px var(--relay-blue),
    0 8px 20px rgb(49 87 246 / 9%);
}
.choice-card--disabled {
  cursor: wait;
  opacity: 0.64;
  transform: none;
}
.choice-card input {
  clip: rect(0 0 0 0);
  height: 1px;
  position: absolute;
  width: 1px;
}
.choice-card__dot {
  border: 1px solid var(--relay-line-strong);
  border-radius: 99px;
  height: 13px;
  width: 13px;
}
.choice-card--selected .choice-card__dot {
  background: var(--relay-blue);
  border: 3px solid var(--relay-blue-soft);
}
.choice-card strong {
  font-size: var(--relay-text-control);
  font-weight: 600;
  line-height: 1.3;
}
.choice-card small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
}
.location-grid {
  align-items: end;
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr auto 1fr;
  margin-top: 25px;
}
.location-grid label,
.preference-stack label {
  color: var(--relay-faint);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 7px;
}
.location-grid input,
.preference-stack select {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line-strong);
  border-radius: 10px;
  font-size: var(--relay-text-control);
  min-height: 44px;
  outline: none;
  padding: 0 12px;
}
.location-grid input:focus,
.preference-stack select:focus {
  border-color: var(--relay-blue);
  box-shadow: 0 0 0 3px var(--relay-blue-soft);
}
.location-grid__arrow {
  color: var(--relay-faint);
  padding-bottom: 13px;
}
.preference-stack {
  display: grid;
  gap: 17px;
}
.details-grid {
  display: grid;
  gap: 14px 12px;
  grid-template-columns: 1fr 1fr;
  margin-top: 17px;
}
.details-grid label {
  color: var(--relay-faint);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 7px;
}
.details-grid__wide {
  grid-column: span 2;
}
.details-grid input,
.details-grid select {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line-strong);
  border-radius: 10px;
  font-size: var(--relay-text-control);
  min-height: 44px;
  outline: none;
  padding: 0 12px;
}
.details-grid input:focus,
.details-grid select:focus {
  border-color: var(--relay-blue);
  box-shadow: 0 0 0 3px var(--relay-blue-soft);
}
.preference-stack select {
  color: var(--relay-ink);
}
.brief-tip {
  align-items: flex-start;
  background: var(--relay-blue-soft);
  border: 1px solid #dce5ff;
  border-radius: 12px;
  display: flex;
  gap: 10px;
  margin-top: 26px;
  padding: 14px;
}
.brief-tip span {
  color: var(--relay-blue);
}
.brief-tip p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 0;
}
.intake-panel {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line);
  border-radius: 14px;
  display: grid;
  gap: 16px;
  margin-top: 18px;
  padding: 18px;
}
.intake-panel__copy {
  align-items: flex-start;
  display: grid;
  gap: 12px;
  grid-template-columns: auto 1fr;
}
.intake-panel__icon {
  align-items: center;
  background: var(--relay-blue-soft);
  border-radius: 10px;
  color: var(--relay-blue);
  display: inline-flex;
  font-size: 1rem;
  font-weight: 700;
  height: 34px;
  justify-content: center;
  width: 34px;
}
.intake-panel h2 {
  font-size: var(--relay-text-control);
  font-weight: 650;
  letter-spacing: -0.015em;
  margin: 1px 0 4px;
}
.intake-panel p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 0;
}
.intake-panel__actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.intake-panel__actions small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.intake-panel .intake-panel__error {
  background: #fff5f3;
  border: 1px solid #f1d4ce;
  border-radius: 9px;
  color: #9a3525;
  padding: 10px 12px;
}
.intake-result,
.voice-status {
  align-items: center;
  border-radius: 11px;
  display: flex;
  gap: 11px;
  padding: 12px 13px;
}
.intake-result {
  background: var(--relay-green-soft);
  color: var(--relay-green);
}
.intake-result > span {
  font-weight: 750;
}
.intake-result div,
.voice-status div {
  display: grid;
  gap: 2px;
}
.intake-result strong,
.voice-status strong {
  color: var(--relay-ink);
  font-size: var(--relay-text-meta);
  font-weight: 650;
}
.intake-result small,
.voice-status small {
  color: var(--relay-muted);
  font-size: 0.75rem;
  line-height: 1.45;
}
.voice-status {
  background: var(--relay-blue-soft);
}
.voice-status__pulse {
  background: var(--relay-faint);
  border: 4px solid white;
  border-radius: 999px;
  box-shadow: 0 0 0 1px var(--relay-line);
  flex: 0 0 auto;
  height: 16px;
  width: 16px;
}
.voice-status__pulse--active {
  animation: voice-pulse 1.5s ease-in-out infinite;
  background: var(--relay-green);
  box-shadow: 0 0 0 1px rgb(25 145 103 / 28%);
}
.intake-warnings {
  color: var(--relay-muted);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 5px;
  line-height: 1.5;
  margin: 0;
  padding-left: 19px;
}
.brief-review {
  border: 1px solid var(--relay-line);
  border-radius: 14px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 0;
  overflow: hidden;
}
.brief-review > div {
  border-bottom: 1px solid var(--relay-line);
  padding: 17px;
}
.brief-review > div:nth-child(odd) {
  border-right: 1px solid var(--relay-line);
}
.brief-review > div:nth-last-child(-n + 2) {
  border-bottom: 0;
}
.brief-review dt {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-bottom: 7px;
}
.brief-review dd {
  font-size: var(--relay-text-control);
  font-weight: 570;
  line-height: 1.45;
  margin: 0;
}
.brief-review dd span {
  color: var(--relay-blue);
}
.brief-review__assurance {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.6;
  margin: 20px 0 0;
}
.brief-actions {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 18px 26px;
}
.brief-actions .button--quiet {
  font-size: var(--relay-text-control);
  min-height: 42px;
}
@keyframes enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes voice-pulse {
  50% {
    box-shadow: 0 0 0 6px rgb(25 145 103 / 12%);
  }
}
@media (prefers-reduced-motion: reduce) {
  .voice-status__pulse--active {
    animation: none;
  }
}
@media (max-width: 1024px) {
  .brief-main {
    grid-template-columns: 1fr;
    padding-top: 30px;
  }
  .brief-intro {
    max-width: 580px;
  }
  .brief-step {
    min-height: auto;
  }
  .brief-card {
    max-width: 620px;
    width: 100%;
  }
}
@media (max-width: 640px) {
  .brief-header {
    min-height: 68px;
  }
  .brief-header__demo {
    font-size: var(--relay-text-meta);
  }
  .brief-main {
    padding-top: 26px;
  }
  .brief-intro h1 {
    font-size: 2rem;
    letter-spacing: -0.045em;
  }
  .choice-grid--three {
    grid-template-columns: 1fr;
  }
  .choice-card {
    min-height: 68px;
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .choice-card__dot {
    grid-row: 1;
  }
  .choice-card strong {
    grid-column: 2;
  }
  .intake-panel__actions {
    align-items: stretch;
    flex-direction: column;
  }
  .intake-panel__actions .button {
    justify-content: center;
    width: 100%;
  }
  .brief-review {
    grid-template-columns: 1fr;
  }
  .details-grid {
    grid-template-columns: 1fr;
  }
  .details-grid__wide {
    grid-column: auto;
  }
  .brief-review > div:nth-child(odd) {
    border-right: 0;
  }
  .brief-review > div:nth-last-child(2) {
    border-bottom: 1px solid var(--relay-line);
  }
  .location-grid {
    grid-template-columns: 1fr;
  }
  .location-grid__arrow {
    display: none;
  }
}
</style>
