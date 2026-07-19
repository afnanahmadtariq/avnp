<script setup lang="ts">
import type { RelayProfile, RelayProfileUpdate } from "~/types/api";

import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import { useAccountIdentity } from "../composables/useAccountIdentity";
import { useRelayApi } from "../composables/useRelayApi";

useSeoMeta({ title: "Profile · Relay" });

const supportedTimezones = [
  "Asia/Karachi",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
] as const;

const api = useRelayApi();
const { syncAccountIdentity } = useAccountIdentity();
const isLoaded = ref(false);
const isLoading = ref(true);
const isSaving = ref(false);
const loadError = ref("");
const profileForm = ref<HTMLFormElement | null>(null);
const profilePhotoName = ref("");
const profilePhotoPreview = ref("");
const saveError = ref(false);
const saved = ref(false);
const saveFeedback = ref("");
const profile = ref<RelayProfile>({
  displayName: "",
  email: "",
  id: "",
  location: "",
  phone: null,
  representedAs: "",
  timezone: "America/New_York",
  updatedAt: "",
});
let saveFeedbackTimeout: number | undefined;

const profileInitials = computed(() => {
  const initials = profile.value.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return initials || "R";
});

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function normalizeProfile(value: RelayProfile): RelayProfile {
  return {
    displayName: value.displayName.trim(),
    email: value.email.trim(),
    id: value.id,
    location: value.location.trim(),
    phone: value.phone?.replace(/[\s()-]/g, "") || null,
    representedAs: value.representedAs.trim(),
    timezone: value.timezone,
    updatedAt: value.updatedAt,
  };
}

function profileUpdate(value: RelayProfile): RelayProfileUpdate {
  const normalized = normalizeProfile(value);

  return {
    displayName: normalized.displayName,
    location: normalized.location,
    phone: normalized.phone,
    representedAs: normalized.representedAs,
    timezone: normalized.timezone,
  };
}

function validateProfile(value: RelayProfileUpdate): string | undefined {
  if (!value.displayName || !value.location || !value.representedAs) {
    return "Complete every required profile field.";
  }

  if (value.phone !== null && !/^\+[1-9]\d{7,14}$/.test(value.phone)) {
    return "Use an international phone number such as +17045550100.";
  }

  if (!(supportedTimezones as readonly string[]).includes(value.timezone)) {
    return "Choose a supported time zone.";
  }

  return undefined;
}

async function loadProfile(): Promise<void> {
  isLoading.value = true;
  loadError.value = "";

  try {
    profile.value = normalizeProfile(await api.getProfile());
    syncAccountIdentity(profile.value);
    isLoaded.value = true;
  } catch (error: unknown) {
    isLoaded.value = false;
    loadError.value = errorMessage(
      error,
      "Your profile could not be loaded. Please try again.",
    );
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  void loadProfile();
});

onBeforeUnmount(() => {
  if (saveFeedbackTimeout) {
    window.clearTimeout(saveFeedbackTimeout);
  }
});

function selectProfilePhoto(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (!file) {
    return;
  }

  profilePhotoName.value = file.name;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    if (typeof reader.result === "string") {
      profilePhotoPreview.value = reader.result;
    }
  });
  reader.readAsDataURL(file);
}

async function saveProfile(): Promise<void> {
  if (!profileForm.value?.reportValidity()) {
    return;
  }

  const normalizedProfile = profileUpdate(profile.value);
  const validationError = validateProfile(normalizedProfile);

  if (validationError) {
    saved.value = false;
    saveError.value = true;
    saveFeedback.value = validationError;
    return;
  }

  if (saveFeedbackTimeout) {
    window.clearTimeout(saveFeedbackTimeout);
  }

  isSaving.value = true;
  saved.value = false;
  saveError.value = false;
  saveFeedback.value = "Saving profile…";

  try {
    profile.value = normalizeProfile(
      await api.updateProfile(normalizedProfile),
    );
    syncAccountIdentity(profile.value);
    saved.value = true;
    saveFeedback.value = "Profile saved to Relay.";
    saveFeedbackTimeout = window.setTimeout(() => {
      saved.value = false;
      saveFeedback.value = "";
    }, 2400);
  } catch (error: unknown) {
    saveError.value = true;
    saveFeedback.value = errorMessage(
      error,
      "Your profile could not be saved. Please try again.",
    );
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <AppShell>
    <main
      id="main-content"
      :aria-busy="isLoading || isSaving"
      class="account-page"
    >
      <header class="account-header">
        <div>
          <p>Account</p>
          <h1>Your profile</h1>
          <span
            >Manage the identity and contact details Relay uses for your
            requests.</span
          >
        </div>
        <div class="account-header__actions">
          <button
            class="button button--blue"
            :disabled="!isLoaded || isLoading || isSaving"
            form="profile-form"
            type="submit"
          >
            {{
              isLoading
                ? "Loading profile"
                : isSaving
                  ? "Saving changes"
                  : saved
                    ? "Changes saved"
                    : "Save changes"
            }}<span aria-hidden="true">{{ saved ? "✓" : "→" }}</span>
          </button>
          <span
            v-if="saveFeedback"
            aria-live="polite"
            class="profile-save-feedback"
            :class="{ 'profile-save-feedback--error': saveError }"
            role="status"
          >
            {{ saveFeedback }}
          </span>
        </div>
      </header>
      <section
        v-if="isLoading"
        aria-live="polite"
        class="account-card account-state"
        role="status"
      >
        <strong>Loading your profile…</strong>
        <p>Relay is retrieving the account details used for your requests.</p>
      </section>
      <section
        v-else-if="loadError"
        class="account-card account-state account-state--error"
        role="alert"
      >
        <strong>Profile unavailable</strong>
        <p>{{ loadError }}</p>
        <button class="button" type="button" @click="loadProfile">
          Try again
        </button>
      </section>
      <div v-else-if="isLoaded" class="account-layout">
        <section class="account-card profile-card">
          <div class="profile-identity">
            <span class="profile-avatar" aria-hidden="true">
              <img
                v-if="profilePhotoPreview"
                alt=""
                :src="profilePhotoPreview"
              />
              <template v-else>{{ profileInitials }}</template>
            </span>
            <div>
              <h2>{{ profile.displayName }}</h2>
              <p>Personal account · Relay member since July 2026</p>
              <input
                id="profile-photo"
                accept="image/jpeg,image/png,image/webp"
                aria-describedby="profile-photo-feedback"
                class="profile-photo-input"
                form="profile-form"
                type="file"
                @change="selectProfilePhoto"
              />
              <label class="profile-photo-action" for="profile-photo">
                {{ profilePhotoName ? "Choose another photo" : "Choose photo" }}
              </label>
              <span
                id="profile-photo-feedback"
                aria-live="polite"
                class="profile-photo-feedback"
                role="status"
              >
                {{
                  profilePhotoName
                    ? `${profilePhotoName} is a local preview only and is not uploaded.`
                    : "Preview only — photos are not uploaded or saved. JPG, PNG, or WebP."
                }}
              </span>
            </div>
          </div>
          <form
            id="profile-form"
            ref="profileForm"
            @submit.prevent="saveProfile"
          >
            <div class="settings-section">
              <div>
                <h3>Personal details</h3>
                <p>Used in your account and saved reports.</p>
              </div>
              <div class="settings-fields">
                <label
                  >Full name<input
                    v-model="profile.displayName"
                    autocomplete="name"
                    :disabled="isSaving"
                    maxlength="120"
                    required /></label
                ><label
                  >Email address<input
                    v-model="profile.email"
                    aria-describedby="profile-email-help"
                    autocomplete="email"
                    :disabled="isSaving"
                    maxlength="254"
                    readonly
                    required
                    type="email"
                  />
                  <span id="profile-email-help" class="managed-field-help">
                    Used for sign-in and account recovery.
                    <NuxtLink to="/account">Manage sign-in details</NuxtLink>
                  </span></label
                ><label
                  >Phone number (optional)<input
                    v-model="profile.phone"
                    autocomplete="tel"
                    :disabled="isSaving"
                    maxlength="40"
                    pattern="\+[1-9][0-9]{7,14}"
                    title="Use international format, for example +17045550100"
                    type="tel" /></label
                ><label
                  >Home location<input
                    v-model="profile.location"
                    autocomplete="address-level2"
                    :disabled="isSaving"
                    maxlength="120"
                    required
                /></label>
              </div>
            </div>
            <div class="settings-section">
              <div>
                <h3>Calling identity</h3>
                <p>How Relay introduces who it represents.</p>
              </div>
              <div class="settings-fields">
                <label
                  >Relay represents<input
                    v-model="profile.representedAs"
                    :disabled="isSaving"
                    maxlength="120"
                    required /></label
                ><label
                  >Time zone<select
                    v-model="profile.timezone"
                    :disabled="isSaving"
                    required
                  >
                    <option>Asia/Karachi</option>
                    <option>America/New_York</option>
                    <option>America/Los_Angeles</option>
                    <option>Europe/London</option>
                  </select></label
                >
                <div class="identity-preview">
                  <span>Call introduction</span>
                  <p>
                    “Hi, I’m Sara from Relay, an automated assistant calling on
                    behalf of <strong>{{ profile.representedAs }}</strong
                    >.”
                  </p>
                </div>
              </div>
            </div>
          </form>
        </section>
        <aside class="account-aside">
          <section class="account-card account-summary">
            <span>Account readiness</span>
            <dl>
              <div>
                <dt>Profile details</dt>
                <dd>Complete</dd>
              </div>
              <div>
                <dt>Calling identity</dt>
                <dd>Ready</dd>
              </div>
              <div>
                <dt>Time zone</dt>
                <dd>{{ profile.timezone }}</dd>
              </div>
            </dl>
          </section>
          <section class="account-card account-shortcuts">
            <span>Account shortcuts</span>
            <NuxtLink to="/account">
              <span>
                <strong>Sign-in and security</strong>
                <small>Email, password, social accounts, and sessions</small>
              </span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
            <NuxtLink to="/settings#privacy">
              <span>
                <strong>Privacy and retention</strong>
                <small>Evidence access and expiry</small>
              </span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
            <NuxtLink to="/settings#access">
              <span>
                <strong>Workspace access</strong>
                <small>Local access and sign-in status</small>
              </span>
              <span aria-hidden="true">→</span>
            </NuxtLink>
          </section>
        </aside>
      </div>
    </main>
  </AppShell>
</template>

<style scoped>
.account-page {
  margin: 0 auto;
  max-width: var(--relay-width-standard);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.account-header {
  align-items: end;
  display: flex;
  justify-content: space-between;
  margin-bottom: 27px;
}
.account-header p {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
  text-transform: uppercase;
}
.account-header h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 560;
  letter-spacing: -0.05em;
  margin-bottom: 7px;
}
.account-header > div > span {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
}
.account-header__actions {
  align-items: end;
  display: grid;
  gap: 7px;
  justify-items: end;
}
.profile-save-feedback {
  color: var(--relay-green);
  font-size: var(--relay-text-meta);
}
.profile-save-feedback--error {
  color: var(--relay-red);
}
.account-header button:disabled {
  cursor: wait;
  opacity: 0.65;
}
.account-state {
  display: grid;
  gap: var(--relay-space-2);
  padding: var(--relay-space-6);
}
.account-state strong {
  font-size: var(--relay-text-card-title);
}
.account-state p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: var(--relay-leading-control);
  margin: 0;
}
.account-state button {
  justify-self: start;
  margin-top: var(--relay-space-2);
}
.account-state--error {
  border-color: #e8c8c6;
}
.account-layout {
  align-items: start;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) 280px;
}
.account-card {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
}
.profile-identity {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  gap: 16px;
  padding: 22px;
}
.profile-avatar {
  align-items: center;
  background: var(--relay-ink);
  border-radius: 14px;
  color: white;
  display: flex;
  font-size: 0.86rem;
  font-weight: 650;
  height: 58px;
  justify-content: center;
  width: 58px;
}
.profile-avatar img {
  border-radius: inherit;
  height: 100%;
  object-fit: cover;
  width: 100%;
}
.profile-identity h2 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0 0 5px;
}
.profile-identity p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin: 0 0 8px;
}
.profile-photo-input {
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  height: 1px;
  overflow: hidden;
  position: absolute;
  white-space: nowrap;
  width: 1px;
}
.profile-photo-action {
  background: none;
  border: 0;
  color: var(--relay-blue);
  cursor: pointer;
  font-size: var(--relay-text-control);
  font-weight: 610;
  padding: 0;
}
.profile-photo-input:focus-visible + .profile-photo-action {
  border-radius: 4px;
  outline: 3px solid var(--relay-blue-soft);
  outline-offset: 3px;
}
.profile-photo-feedback {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  margin-top: 6px;
  max-width: 360px;
}
.settings-section {
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  gap: 34px;
  grid-template-columns: 180px 1fr;
  padding: 25px 22px;
}
.settings-section:last-child {
  border-bottom: 0;
}
.settings-section h3 {
  font-size: var(--relay-text-card-title);
  font-weight: 620;
  margin: 0 0 5px;
}
.settings-section > div:first-child p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 0;
}
.settings-fields {
  display: grid;
  gap: 15px;
  grid-template-columns: 1fr 1fr;
  min-width: 0;
}
.settings-fields label {
  color: var(--relay-faint);
  display: grid;
  font-size: var(--relay-text-meta);
  gap: 7px;
  min-width: 0;
}
.settings-fields input,
.settings-fields select {
  background: #fbfbfc;
  border: 1px solid var(--relay-line-strong);
  border-radius: 9px;
  font-size: var(--relay-text-control);
  min-height: 44px;
  min-width: 0;
  padding: 0 10px;
  width: 100%;
}
.settings-fields input:focus,
.settings-fields select:focus {
  border-color: var(--relay-blue);
  outline: 3px solid var(--relay-blue-soft);
}
.settings-fields input[readonly] {
  background: var(--relay-surface-muted);
  color: var(--relay-muted);
  cursor: default;
}
.managed-field-help {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
}
.managed-field-help a {
  color: var(--relay-blue);
  font-weight: 610;
}
.identity-preview {
  background: var(--relay-blue-soft);
  border-radius: 10px;
  grid-column: span 2;
  padding: 13px;
}
.identity-preview span {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-weight: 650;
}
.identity-preview p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: 1.55;
  margin: 6px 0 0;
}
.account-aside {
  display: grid;
  gap: 14px;
}
.account-summary {
  padding: 18px;
}
.account-summary > span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.account-summary dl {
  display: grid;
  margin: 14px 0 0;
}
.account-summary dl div {
  border-top: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
}
.account-summary dt,
.account-summary dd {
  font-size: var(--relay-text-meta);
}
.account-summary dt {
  color: var(--relay-muted);
}
.account-summary dd {
  font-weight: 610;
  margin: 0;
}
.account-shortcuts {
  padding: 18px;
}
.account-shortcuts > span {
  color: var(--relay-faint);
  display: block;
  font-size: var(--relay-text-meta);
  letter-spacing: 0.06em;
  margin-bottom: var(--relay-space-2);
  text-transform: uppercase;
}
.account-shortcuts a {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  color: var(--relay-blue);
  display: flex;
  justify-content: space-between;
  padding: var(--relay-space-3) 0;
}
.account-shortcuts strong,
.account-shortcuts small {
  display: block;
}
.account-shortcuts strong {
  color: var(--relay-ink);
  font-size: var(--relay-text-control);
  font-weight: 610;
}
.account-shortcuts small {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  margin-top: var(--relay-space-1);
}
@media (max-width: 1024px) {
  .account-layout {
    grid-template-columns: 1fr;
  }
  .account-aside {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 640px) {
  .account-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .account-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
  }
  .account-header__actions {
    align-items: start;
    justify-items: start;
  }
  .settings-section {
    grid-template-columns: 1fr;
  }
  .settings-fields {
    grid-template-columns: 1fr;
  }
  .identity-preview {
    grid-column: auto;
  }
  .account-aside {
    grid-template-columns: 1fr;
  }
}
</style>
