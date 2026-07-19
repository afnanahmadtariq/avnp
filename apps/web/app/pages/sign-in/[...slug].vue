<script setup lang="ts">
import { ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nuxt/components";

useSeoMeta({
  robots: "noindex, nofollow",
  title: "Sign in · Relay",
});

const config = useRuntimeConfig();
</script>

<template>
  <main id="main-content" class="auth-page">
    <NuxtLink aria-label="Relay home" class="auth-page__brand" to="/">
      <RelayLogo />
    </NuxtLink>
    <section class="auth-card">
      <div class="auth-card__copy">
        <p class="eyebrow">Secure workspace</p>
        <h1>Welcome back.</h1>
        <p>Sign in to manage your briefs, calls, evidence, and decisions.</p>
      </div>
      <div
        v-if="config.public.authProvider === 'clerk'"
        class="auth-card__provider"
      >
        <ClerkLoading>
          <div
            aria-busy="true"
            aria-live="polite"
            class="auth-loading"
            role="status"
          >
            <span aria-hidden="true" class="auth-loading__mark">R</span>
            <div>
              <strong>Loading secure sign-in</strong>
              <p>Checking your account connection…</p>
            </div>
          </div>
        </ClerkLoading>
        <ClerkLoaded>
          <SignIn
            fallback-redirect-url="/dashboard"
            path="/sign-in"
            routing="path"
            sign-up-fallback-redirect-url="/profile?welcome=1"
            sign-up-url="/sign-up"
          />
        </ClerkLoaded>
        <p class="auth-card__trust">
          Review Relay’s <NuxtLink to="/privacy">privacy notice</NuxtLink> and
          <NuxtLink to="/terms">product terms</NuxtLink>.
        </p>
      </div>
      <NuxtLink v-else class="button button--blue" to="/dashboard">
        Continue to local workspace <span aria-hidden="true">→</span>
      </NuxtLink>
    </section>
  </main>
</template>

<style scoped>
.auth-page {
  align-items: center;
  background: var(--relay-canvas-app);
  display: grid;
  justify-items: center;
  min-height: 100vh;
  padding: 96px 24px 48px;
  position: relative;
}
.auth-page__brand {
  left: clamp(24px, 5vw, 72px);
  position: absolute;
  top: 28px;
}
.auth-card {
  align-items: center;
  display: grid;
  gap: 40px;
  grid-template-columns: minmax(240px, 360px) minmax(320px, auto);
  max-width: 840px;
  width: 100%;
}
.auth-card__copy h1 {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  letter-spacing: -0.06em;
  line-height: 0.98;
  margin: 14px 0 20px;
}
.auth-card__copy > p:last-child {
  color: var(--relay-muted);
  line-height: 1.65;
}
.auth-card__provider {
  min-width: 0;
  width: 100%;
}
.auth-loading {
  align-items: flex-start;
  background: var(--relay-surface);
  border: 1px solid var(--relay-line);
  border-radius: 16px;
  box-shadow: var(--relay-shadow-md);
  display: flex;
  gap: 14px;
  min-height: 460px;
  padding: 28px;
  width: min(100%, 400px);
}
.auth-loading__mark {
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
.auth-loading strong {
  display: block;
  font-size: var(--relay-text-control);
  margin-top: 5px;
}
.auth-loading p,
.auth-card__trust {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-control);
}
.auth-loading p {
  margin: 4px 0 0;
}
.auth-card__trust {
  margin: 18px 0 0;
  max-width: 400px;
  text-align: center;
}
.auth-card__trust a {
  color: var(--relay-ink-soft);
  text-decoration: underline;
  text-decoration-color: var(--relay-line-strong);
  text-underline-offset: 3px;
}
@media (max-width: 760px) {
  .auth-card {
    grid-template-columns: 1fr;
  }
  .auth-loading {
    min-height: 420px;
  }
}
</style>
