<script setup lang="ts">
useSeoMeta({
  description:
    "Safe troubleshooting and support guidance for Relay accounts, requests, calls, and privacy concerns.",
  title: "Support · Relay",
});
</script>

<template>
  <div class="trust-shell">
    <header class="trust-header">
      <div class="container trust-header__inner">
        <NuxtLink aria-label="Relay home" to="/"><RelayLogo /></NuxtLink>
        <nav aria-label="Trust center navigation" class="trust-nav">
          <NuxtLink to="/privacy">Privacy</NuxtLink>
          <NuxtLink to="/terms">Terms</NuxtLink>
          <NuxtLink aria-current="page" to="/support">Support</NuxtLink>
        </nav>
        <NuxtLink
          class="button button--secondary trust-header__action"
          to="/dashboard"
        >
          Open Relay
        </NuxtLink>
      </div>
    </header>

    <main id="main-content" class="container trust-main">
      <section class="trust-hero">
        <p class="eyebrow">Support</p>
        <h1>Recover safely and keep moving.</h1>
        <p class="trust-hero__lede">
          Start with the recovery path for the affected part of Relay. Keep the
          request ID visible, and never share credentials or private call
          evidence through an unverified channel.
        </p>
        <p class="trust-updated">Guidance updated July 19, 2026</p>
      </section>

      <div class="trust-layout">
        <aside class="trust-summary trust-summary--support">
          <strong>Support channel status</strong>
          <p>
            This deployment has not published a verified support inbox. Use only
            a contact channel supplied by the Relay deployment owner. Do not
            guess an email address or send evidence to an unverified recipient.
          </p>
        </aside>

        <div class="trust-content">
          <section>
            <p class="trust-section-number">01</p>
            <h2>Sign-in or account problem</h2>
            <p>
              Return to <NuxtLink to="/sign-in">Sign in</NuxtLink> and complete
              any pending Google or email verification in the same browser. Once
              signed in, use
              <NuxtLink to="/account">Account security</NuxtLink> to manage
              email addresses, connected accounts, passwords, and sessions. Your
              Relay display name and work preferences are managed separately in
              <NuxtLink to="/profile">Profile</NuxtLink>.
            </p>
          </section>

          <section>
            <p class="trust-section-number">02</p>
            <h2>Request is missing or cannot open</h2>
            <p>
              Open the <NuxtLink to="/dashboard">Dashboard</NuxtLink> and choose
              the request shown there instead of reusing an old demo bookmark.
              If the request still fails, keep its current request ID and the
              approximate time of the error. Do not create repeated calling runs
              while the original status is uncertain.
            </p>
          </section>

          <section>
            <p class="trust-section-number">03</p>
            <h2>Voice interview or provider error</h2>
            <p>
              Confirm that microphone access is allowed for Relay, then retry
              once from the current brief. If a live business-calling run has
              already started, pause or cancel it from the request workspace
              before troubleshooting. This prevents duplicate outbound calls.
            </p>
          </section>

          <section>
            <p class="trust-section-number">04</p>
            <h2>Profile, notifications, or privacy</h2>
            <p>
              Update Relay-specific information in
              <NuxtLink to="/profile">Profile</NuxtLink>. Sign-in identity is
              managed in <NuxtLink to="/account">Account security</NuxtLink>.
              Evidence retention, exports, and communication choices are in
              <NuxtLink to="/settings">Settings</NuxtLink>. Read the
              <NuxtLink to="/privacy">privacy notice</NuxtLink> before sharing
              any personal information for troubleshooting.
            </p>
          </section>

          <section>
            <p class="trust-section-number">05</p>
            <h2>What a safe issue report includes</h2>
            <ul class="trust-checklist">
              <li>
                The Relay request ID, such as the value shown in the page title.
              </li>
              <li>
                The approximate time and the page where the problem occurred.
              </li>
              <li>
                A screenshot with addresses, phone numbers, and quotes obscured.
              </li>
              <li>
                The recovery step you already tried and what happened next.
              </li>
            </ul>
            <div class="trust-callout trust-callout--warning">
              <strong>Never include secrets.</strong>
              <p>
                Do not share your password, one-time code, session cookie, API
                key, database URL, webhook secret, full transcript, or
                recording.
              </p>
            </div>
          </section>

          <section class="trust-note">
            <h2>Security or privacy concern</h2>
            <p>
              Stop active calls, preserve the request ID and time, sign out
              other sessions from Account security if needed, and notify the
              verified deployment owner. Do not delete local evidence that may
              be needed to understand the event.
            </p>
          </section>
        </div>
      </div>
    </main>

    <footer class="trust-footer">
      <div class="container trust-footer__inner">
        <RelayLogo />
        <p>Clear evidence. Customer-controlled decisions.</p>
        <nav aria-label="Trust footer navigation">
          <NuxtLink to="/">Home</NuxtLink>
          <NuxtLink to="/privacy">Privacy</NuxtLink>
          <NuxtLink to="/terms">Terms</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
