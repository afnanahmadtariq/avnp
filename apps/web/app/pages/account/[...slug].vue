<script setup lang="ts">
import { ClerkLoaded, ClerkLoading, UserProfile } from "@clerk/nuxt/components";

useSeoMeta({
  robots: "noindex, nofollow",
  title: "Sign-in and security · Relay",
});

const config = useRuntimeConfig();
</script>

<template>
  <AppShell>
    <main id="main-content" class="security-page">
      <header>
        <p>Account</p>
        <h1>Sign-in and security</h1>
        <span>
          Manage your email, password, connected Google account, and active
          sessions.
        </span>
      </header>
      <section class="security-panel">
        <div
          v-if="config.public.authProvider === 'clerk'"
          class="security-panel__clerk"
        >
          <ClerkLoading>
            <div
              aria-busy="true"
              aria-live="polite"
              class="security-loading"
              role="status"
            >
              <span aria-hidden="true">R</span>
              <div>
                <strong>Loading account security</strong>
                <p>Checking your secure account connection…</p>
              </div>
            </div>
          </ClerkLoading>
          <ClerkLoaded>
            <UserProfile path="/account" routing="path" />
          </ClerkLoaded>
        </div>
        <div v-else class="security-local">
          <h2>Local workspace</h2>
          <p>Sign-in security is managed by Clerk in deployed environments.</p>
          <NuxtLink class="button button--secondary" to="/profile">
            Return to profile
          </NuxtLink>
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
.security-page {
  margin: 0 auto;
  max-width: var(--relay-width-standard);
  padding: var(--relay-space-10) var(--relay-page-gutter) var(--relay-space-24);
}
.security-page > header {
  margin-bottom: 25px;
}
.security-page > header p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  letter-spacing: 0.08em;
  margin: 0 0 9px;
  text-transform: uppercase;
}
.security-page h1 {
  font-size: var(--relay-text-page-title);
  font-weight: 560;
  letter-spacing: -0.05em;
  margin: 0 0 8px;
}
.security-page > header span,
.security-local p {
  color: var(--relay-muted);
  font-size: var(--relay-text-control);
  line-height: var(--relay-leading-control);
}
.security-panel {
  display: grid;
  justify-items: start;
  min-height: 520px;
  width: 100%;
}
.security-panel__clerk {
  min-width: 0;
  width: 100%;
}
.security-loading {
  align-items: flex-start;
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
  box-shadow: var(--relay-shadow-sm);
  display: flex;
  gap: 14px;
  min-height: 520px;
  padding: var(--relay-space-6);
  width: min(100%, 900px);
}
.security-loading > span {
  align-items: center;
  background: var(--relay-ink);
  border-radius: 10px;
  color: white;
  display: inline-flex;
  font-weight: 650;
  height: 38px;
  justify-content: center;
  width: 38px;
}
.security-loading strong {
  display: block;
  font-size: var(--relay-text-control);
  margin-top: 5px;
}
.security-loading p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-control);
  margin: 4px 0 0;
}
.security-local {
  background: white;
  border: 1px solid var(--relay-line);
  border-radius: 15px;
  padding: var(--relay-space-6);
}
.security-local h2 {
  font-size: var(--relay-text-card-title);
  margin: 0;
}
@media (max-width: 640px) {
  .security-page {
    padding: var(--relay-space-8) var(--relay-page-gutter-mobile)
      var(--relay-space-16);
  }
  .security-loading {
    min-height: 440px;
    padding: var(--relay-space-4);
  }
}
</style>
