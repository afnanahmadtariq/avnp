<script setup lang="ts">
import { UserProfile } from "@clerk/nuxt/components";

useSeoMeta({ title: "Sign-in and security · Relay" });

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
        <UserProfile
          v-if="config.public.authProvider === 'clerk'"
          path="/account"
          routing="path"
        />
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
</style>
