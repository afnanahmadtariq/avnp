<script setup lang="ts">
import { SignUp } from "@clerk/nuxt/components";

useSeoMeta({ title: "Create account · Relay" });

const config = useRuntimeConfig();
</script>

<template>
  <main id="main-content" class="auth-page">
    <NuxtLink aria-label="Relay home" class="auth-page__brand" to="/">
      <RelayLogo />
    </NuxtLink>
    <section class="auth-card">
      <div class="auth-card__copy">
        <p class="eyebrow">Your Relay workspace</p>
        <h1>Delegate the back-and-forth.</h1>
        <p>
          Create an account to keep every brief, call, quote, and decision
          private.
        </p>
      </div>
      <SignUp
        v-if="config.public.authProvider === 'clerk'"
        fallback-redirect-url="/profile?welcome=1"
        sign-in-fallback-redirect-url="/dashboard"
        sign-in-url="/sign-in"
      />
      <NuxtLink v-else class="button button--blue" to="/start">
        Start in local mode <span aria-hidden="true">→</span>
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
@media (max-width: 760px) {
  .auth-card {
    grid-template-columns: 1fr;
  }
}
</style>
