<script setup lang="ts">
import type { RelaySettings, RelaySettingsUpdate } from "~/types/api";

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import { onBeforeRouteLeave } from "vue-router";

import { useRelayApi } from "../composables/useRelayApi";

useSeoMeta({ title: "Settings and privacy · Relay" });

const api = useRelayApi();
const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const clerkEnabled = computed(
  () => runtimeConfig.public.authProvider === "clerk",
);
const activeSettingsHash = computed(() => route.hash || "#notifications");
const exportError = ref(false);
const exportPending = ref(false);
const exportStatus = ref("");
const isLoaded = ref(false);
const isLoading = ref(true);
const loadError = ref("");
const saveError = ref(false);
const settingsFeedback = ref("Loading settings…");
const settings = reactive<RelaySettings>({
  aiDisclosure: true,
  callbackAlerts: true,
  callMilestones: true,
  emailUpdates: true,
  evidenceRetentionDays: 30,
  recordingConsentDefault: false,
  updatedAt: "",
});
let allowAutosave = false;
let pendingSettings: RelaySettingsUpdate | undefined;
let saveInFlight = false;
let saveTimer: number | undefined;
let settingsFeedbackTimeout: number | undefined;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function currentSettings(): RelaySettingsUpdate {
  return {
    aiDisclosure: true,
    callbackAlerts: settings.callbackAlerts,
    callMilestones: settings.callMilestones,
    emailUpdates: settings.emailUpdates,
    evidenceRetentionDays: settings.evidenceRetentionDays,
    recordingConsentDefault: settings.recordingConsentDefault,
  };
}

function normalizeSettings(value: RelaySettings): RelaySettings {
  return {
    aiDisclosure: true,
    callbackAlerts: value.callbackAlerts,
    callMilestones: value.callMilestones,
    emailUpdates: value.emailUpdates,
    evidenceRetentionDays: value.evidenceRetentionDays,
    recordingConsentDefault: value.recordingConsentDefault,
    updatedAt: value.updatedAt,
  };
}

async function loadSettings(): Promise<void> {
  allowAutosave = false;
  isLoading.value = true;
  loadError.value = "";

  try {
    Object.assign(settings, normalizeSettings(await api.getSettings()));
    isLoaded.value = true;
    settingsFeedback.value = "Changes save automatically to Relay.";
    allowAutosave = true;
  } catch (error: unknown) {
    isLoaded.value = false;
    loadError.value = errorMessage(
      error,
      "Your settings could not be loaded. Please try again.",
    );
    settingsFeedback.value = "Settings are unavailable.";
  } finally {
    isLoading.value = false;
  }
}

function scheduleSettingsSave(): void {
  if (!allowAutosave || !isLoaded.value) {
    return;
  }

  pendingSettings = currentSettings();
  saveError.value = false;
  settingsFeedback.value = saveInFlight
    ? "Saving the latest changes…"
    : "Changes waiting to save…";

  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }

  if (!saveInFlight) {
    saveTimer = window.setTimeout(() => {
      void flushSettingsSave();
    }, 600);
  }
}

async function flushSettingsSave(): Promise<void> {
  if (saveInFlight || !pendingSettings) {
    return;
  }

  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }

  saveInFlight = true;

  while (pendingSettings) {
    const snapshot = pendingSettings;
    pendingSettings = undefined;
    settingsFeedback.value = "Saving changes…";

    try {
      await api.updateSettings(snapshot);
      settingsFeedback.value = pendingSettings
        ? "Saving the latest changes…"
        : "Changes saved to Relay.";
    } catch (error: unknown) {
      pendingSettings = currentSettings();
      saveError.value = true;
      settingsFeedback.value = errorMessage(
        error,
        "Changes could not be saved. Try again.",
      );
      break;
    }
  }

  saveInFlight = false;

  if (!saveError.value) {
    if (settingsFeedbackTimeout) {
      window.clearTimeout(settingsFeedbackTimeout);
    }
    settingsFeedbackTimeout = window.setTimeout(() => {
      settingsFeedback.value = "Changes save automatically to Relay.";
    }, 2400);
  }
}

function retrySettingsSave(): void {
  saveError.value = false;
  pendingSettings = currentSettings();
  void flushSettingsSave();
}

watch(settings, scheduleSettingsSave, { deep: true, flush: "sync" });

onMounted(() => {
  void loadSettings();
});

onBeforeRouteLeave(async () => {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = undefined;
  }

  if (pendingSettings && !saveInFlight) {
    await flushSettingsSave();
  }

  return saveError.value ? false : undefined;
});

onBeforeUnmount(() => {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
  }
  if (settingsFeedbackTimeout) {
    window.clearTimeout(settingsFeedbackTimeout);
  }
});

async function downloadDataExport(): Promise<void> {
  exportPending.value = true;
  exportError.value = false;
  exportStatus.value = "Preparing your export…";

  try {
    const exportPayload = await api.exportAccount();
    const generatedAt = new Date(exportPayload.generatedAt);
    const dateLabel = Number.isNaN(generatedAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : generatedAt.toISOString().slice(0, 10);
    const fileName = `relay-data-export-${dateLabel}.json`;
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = downloadUrl;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    exportStatus.value = `${fileName} downloaded.`;
  } catch (error: unknown) {
    exportError.value = true;
    exportStatus.value = errorMessage(
      error,
      "Your export could not be prepared. Please try again.",
    );
  } finally {
    exportPending.value = false;
  }
}
</script>

<template>
  <AppShell>
    <main id="main-content" :aria-busy="isLoading" class="settings-page">
      <header class="settings-header">
        <p>Account</p>
        <h1>Settings and privacy</h1>
        <span
          >Control notifications, calling expectations, and how long Relay keeps
          supporting evidence.</span
        >
        <div
          aria-live="polite"
          class="settings-feedback"
          :class="{ 'settings-feedback--error': saveError }"
          role="status"
        >
          <span aria-hidden="true">{{ saveError ? "!" : "✓" }}</span
          >{{ settingsFeedback }}
          <button v-if="saveError" type="button" @click="retrySettingsSave">
            Retry save
          </button>
        </div>
      </header>
      <section
        v-if="isLoading"
        aria-live="polite"
        class="settings-card settings-state"
        role="status"
      >
        <strong>Loading your settings…</strong>
        <p>Relay is retrieving your notification and privacy preferences.</p>
      </section>
      <section
        v-else-if="loadError"
        class="settings-card settings-state settings-state--error"
        role="alert"
      >
        <strong>Settings unavailable</strong>
        <p>{{ loadError }}</p>
        <button type="button" @click="loadSettings">Try again</button>
      </section>
      <div v-else-if="isLoaded" class="settings-layout">
        <nav aria-label="Settings sections" class="settings-nav">
          <a
            :class="{
              'settings-nav__active': activeSettingsHash === '#notifications',
            }"
            href="#notifications"
            >Notifications</a
          ><a
            :class="{
              'settings-nav__active': activeSettingsHash === '#calling',
            }"
            href="#calling"
            >Calling and consent</a
          ><a
            :class="{
              'settings-nav__active': activeSettingsHash === '#privacy',
            }"
            href="#privacy"
            >Data and privacy</a
          ><a
            :class="{
              'settings-nav__active': activeSettingsHash === '#access',
            }"
            href="#access"
            >Workspace access</a
          >
        </nav>
        <div class="settings-content">
          <section id="notifications" class="settings-card">
            <header>
              <div>
                <h2>Notifications</h2>
                <p>Choose when Relay should contact you about a request.</p>
              </div>
            </header>
            <div class="setting-row">
              <div>
                <strong>Email updates</strong>
                <p>Receive a concise summary when a request changes stage.</p>
              </div>
              <label class="switch"
                ><input
                  v-model="settings.emailUpdates"
                  type="checkbox"
                /><span /><span class="sr-only">Email updates</span></label
              >
            </div>
            <div class="setting-row">
              <div>
                <strong>Call milestones</strong>
                <p>Notify me when calls start and when the report is ready.</p>
              </div>
              <label class="switch"
                ><input
                  v-model="settings.callMilestones"
                  type="checkbox"
                /><span /><span class="sr-only">Call milestones</span></label
              >
            </div>
            <div class="setting-row">
              <div>
                <strong>Callback alerts</strong>
                <p>Tell me when a business promises or misses a callback.</p>
              </div>
              <label class="switch"
                ><input
                  v-model="settings.callbackAlerts"
                  type="checkbox"
                /><span /><span class="sr-only">Callback alerts</span></label
              >
            </div>
          </section>

          <section id="calling" class="settings-card">
            <header>
              <div>
                <h2>Calling and consent</h2>
                <p>These choices are confirmed again for each new request.</p>
              </div>
              <StatusBadge :dot="false" tone="success"
                >Required for calls</StatusBadge
              >
            </header>
            <div class="setting-row">
              <div>
                <strong>Recording consent</strong>
                <p>
                  Allow Relay to retain call recordings as evidence for the
                  selected period.
                </p>
              </div>
              <label class="switch"
                ><input
                  v-model="settings.recordingConsentDefault"
                  type="checkbox"
                /><span /><span class="sr-only">Recording consent</span></label
              >
            </div>
            <div class="setting-row">
              <div>
                <strong>Identity disclosure</strong>
                <p>
                  Sara introduces herself by name. If someone asks, she plainly
                  explains that Relay uses an automated voice service.
                </p>
              </div>
              <label class="switch"
                ><input
                  :checked="settings.aiDisclosure"
                  disabled
                  type="checkbox"
                /><span /><span class="sr-only"
                  >Truthful identity disclosure is always enabled</span
                ></label
              >
            </div>
            <div class="setting-callout">
              <span aria-hidden="true">i</span>
              <p>
                Relay never fabricates competing bids, changes the confirmed
                scope, or claims authority to book and pay.
              </p>
            </div>
          </section>

          <section id="privacy" class="settings-card">
            <header>
              <div>
                <h2>Data and privacy</h2>
                <p>
                  Manage evidence retention and account-level data requests.
                </p>
              </div>
            </header>
            <div class="setting-row setting-row--select">
              <div>
                <label for="evidence-retention">
                  <strong>Evidence retention</strong>
                </label>
                <p id="evidence-retention-description">
                  Recordings, transcripts, and uploaded documents expire
                  separately from quote summaries.
                </p>
              </div>
              <select
                id="evidence-retention"
                v-model="settings.evidenceRetentionDays"
                aria-describedby="evidence-retention-description"
              >
                <option :value="7">7 days</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
              </select>
            </div>
            <div class="setting-action">
              <div>
                <strong>Export your data</strong>
                <p>
                  Prepare a copy of your profile, requests, quotes, and evidence
                  references.
                </p>
                <p
                  v-if="exportStatus"
                  id="export-status"
                  aria-live="polite"
                  class="action-feedback"
                  :class="{ 'action-feedback--error': exportError }"
                  role="status"
                >
                  {{ exportStatus }}
                </p>
              </div>
              <button
                :aria-describedby="exportStatus ? 'export-status' : undefined"
                :disabled="exportPending"
                type="button"
                @click="downloadDataExport"
              >
                {{ exportPending ? "Preparing export" : "Download export" }}
              </button>
            </div>
            <div class="setting-action setting-action--danger">
              <div>
                <strong>Delete account data</strong>
                <p id="deletion-status">
                  Account deletion is unavailable because this service does not
                  yet expose a verified deletion endpoint. No data will be
                  changed here.
                </p>
              </div>
              <button aria-describedby="deletion-status" disabled type="button">
                Unavailable
              </button>
            </div>
          </section>

          <section id="access" class="settings-card">
            <header>
              <div>
                <h2>Workspace access</h2>
                <p>
                  {{
                    clerkEnabled
                      ? "Manage the account and sessions that protect Relay."
                      : "Understand access in this local workspace."
                  }}
                </p>
              </div>
            </header>
            <div class="session-row">
              <span class="session-icon" aria-hidden="true"
                ><svg viewBox="0 0 20 20">
                  <rect x="3" y="4" width="14" height="10" rx="1.5" />
                  <path d="M7 17h6M10 14v3" /></svg
              ></span>
              <div>
                <strong>{{
                  clerkEnabled ? "Clerk-secured account" : "Local workspace"
                }}</strong>
                <p v-if="clerkEnabled">
                  Your email, connected Google account, password, and active
                  sessions are managed in Sign-in and security.
                </p>
                <p v-else>
                  Authentication and remote session management are not enabled
                  in this local environment.
                </p>
              </div>
              <div class="session-actions">
                <StatusBadge
                  :dot="false"
                  :tone="clerkEnabled ? 'success' : 'warning'"
                >
                  {{ clerkEnabled ? "Protected" : "Local only" }}
                </StatusBadge>
                <NuxtLink v-if="clerkEnabled" to="/account">Manage</NuxtLink>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.settings-page {
  margin: 0 auto;
  max-width: var(--relay-width-narrow);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.settings-header {
  margin-bottom: 30px;
}
.settings-header > p {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.settings-header h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 560;
  letter-spacing: -0.05em;
  margin-bottom: 7px;
}
.settings-header > span {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
}
.settings-feedback {
  align-items: center;
  color: var(--relay-faint);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 6px;
  margin-top: 12px;
}
.settings-feedback > span {
  align-items: center;
  background: var(--relay-green-soft);
  border-radius: 99px;
  color: var(--relay-green);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  height: 16px;
  justify-content: center;
  width: 16px;
}
.settings-feedback--error {
  color: var(--relay-red);
}
.settings-feedback--error > span {
  background: #fff0ef;
  color: var(--relay-red);
}
.settings-feedback button {
  background: none;
  border: 0;
  color: var(--relay-blue);
  font: inherit;
  font-weight: 650;
  padding: 0;
  text-decoration: underline;
}
.settings-state {
  display: grid;
  gap: var(--relay-space-2);
  padding: var(--relay-space-6);
}
.settings-state strong {
  font-size: var(--relay-text-card-title);
}
.settings-state p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: var(--relay-leading-control);
  margin: 0;
}
.settings-state button {
  background: white;
  border: 1px solid var(--relay-line-strong);
  border-radius: 8px;
  justify-self: start;
  margin-top: var(--relay-space-2);
  min-height: 44px;
  padding: 0 var(--relay-space-3);
}
.settings-state--error {
  border-color: #e8c8c6;
}
.settings-layout {
  align-items: start;
  display: grid;
  gap: 24px;
  grid-template-columns: 180px minmax(0, 1fr);
}
.settings-nav {
  display: grid;
  gap: 3px;
  position: sticky;
  top: 88px;
}
.settings-nav a {
  border-radius: 8px;
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  padding: 10px 11px;
}
.settings-nav a:hover,
.settings-nav__active {
  background: white;
  color: var(--relay-ink);
}
.settings-nav__active {
  box-shadow: inset 2px 0 var(--relay-blue);
}
.settings-content {
  display: grid;
  gap: 14px;
}
.settings-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
  scroll-margin-top: 86px;
}
.settings-card > header {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 19px 21px;
}
.settings-card h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0 0 5px;
}
.settings-card header p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin: 0;
}
.setting-row,
.setting-action,
.session-row {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 17px 21px;
}
.settings-card > :last-child {
  border-bottom: 0;
}
.setting-row strong,
.setting-action strong,
.session-row strong {
  display: block;
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.setting-row p,
.setting-action p,
.session-row p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 5px 0 0;
  max-width: 520px;
}
.switch {
  cursor: pointer;
  flex: 0 0 auto;
  margin-left: 20px;
  padding: 9px 0;
}
.switch input {
  clip: rect(0 0 0 0);
  position: absolute;
}
.switch > span:first-of-type {
  background: #d8dbe1;
  border-radius: 99px;
  display: block;
  height: 26px;
  padding: 3px;
  transition: background 0.15s ease;
  width: 44px;
}
.switch > span:first-of-type::after {
  background: white;
  border-radius: 99px;
  box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
  content: "";
  display: block;
  height: 20px;
  transition: transform 0.15s ease;
  width: 20px;
}
.switch input:checked + span {
  background: var(--relay-blue);
}
.switch input:checked + span::after {
  transform: translateX(18px);
}
.switch input:focus-visible + span {
  outline: 3px solid var(--relay-blue-soft);
}
.switch input:disabled + span {
  opacity: 0.65;
}
.setting-callout {
  align-items: flex-start;
  background: var(--relay-blue-soft);
  display: flex;
  gap: 9px;
  margin: 15px 20px 20px;
  padding: 12px;
  border-radius: 9px;
}
.setting-callout span {
  align-items: center;
  background: white;
  border-radius: 99px;
  color: var(--relay-blue);
  display: flex;
  flex: 0 0 auto;
  font-size: var(--relay-text-meta);
  font-weight: 700;
  height: 19px;
  justify-content: center;
  width: 19px;
}
.setting-callout p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.setting-row select {
  background: white;
  border: 1px solid var(--relay-line-strong);
  border-radius: 8px;
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 0 9px;
}
.setting-action button {
  background: white;
  border: 1px solid var(--relay-line-strong);
  border-radius: 8px;
  color: var(--relay-ink-soft);
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 0 10px;
}
.setting-action button:focus-visible,
.deletion-confirmation button:focus-visible {
  outline: 3px solid var(--relay-blue-soft);
  outline-offset: 2px;
}
.setting-action--danger button {
  border-color: #e8c8c6;
  color: var(--relay-red);
}
.setting-action .action-feedback {
  color: var(--relay-green);
  font-weight: 580;
}
.setting-action .action-feedback--error {
  color: var(--relay-red);
}
.setting-action button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.deletion-confirmation {
  align-items: center;
  background: #fff8f7;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  gap: 24px;
  justify-content: space-between;
  padding: 17px 21px;
}
.deletion-confirmation h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0;
}
.deletion-confirmation p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 5px 0 0;
}
.deletion-confirmation__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.deletion-confirmation button {
  background: white;
  border: 1px solid var(--relay-line-strong);
  border-radius: 8px;
  color: var(--relay-ink-soft);
  font-size: var(--relay-text-control);
  min-height: 44px;
  padding: 0 10px;
}
.deletion-confirmation .deletion-confirmation__confirm {
  background: var(--relay-red);
  border-color: var(--relay-red);
  color: white;
}
.deletion-status {
  color: var(--relay-green);
  font-size: var(--relay-text-meta);
  margin: 0;
  padding: 13px 21px;
}
.session-row {
  justify-content: start;
  gap: 11px;
}
.session-actions {
  align-items: center;
  display: flex;
  gap: var(--relay-space-3);
  margin-left: auto;
}
.session-actions a {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 650;
}
.session-icon {
  align-items: center;
  background: #f1f2f4;
  border-radius: 8px;
  display: flex;
  height: 32px;
  justify-content: center;
  width: 32px;
}
.session-icon svg {
  fill: none;
  height: 17px;
  stroke: var(--relay-muted);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  width: 17px;
}
@media (max-width: 768px) {
  .settings-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .settings-nav {
    display: flex;
    overflow-x: auto;
    position: static;
  }
  .settings-nav a {
    flex: 0 0 auto;
  }
  .setting-row,
  .setting-action {
    align-items: flex-start;
    gap: 14px;
  }
  .setting-row--select,
  .setting-action,
  .deletion-confirmation {
    flex-direction: column;
  }
  .session-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .session-actions {
    margin-left: 43px;
  }
  .deletion-confirmation {
    align-items: stretch;
  }
  .deletion-confirmation__actions {
    flex-wrap: wrap;
  }
}
</style>
