<script setup lang="ts">
useSeoMeta({
  description:
    "A plain-language explanation of the information Relay handles and the controls available to customers.",
  title: "Privacy notice · Relay",
});
</script>

<template>
  <div class="trust-shell">
    <header class="trust-header">
      <div class="container trust-header__inner">
        <NuxtLink aria-label="Relay home" to="/"><RelayLogo /></NuxtLink>
        <nav aria-label="Trust center navigation" class="trust-nav">
          <NuxtLink aria-current="page" to="/privacy">Privacy</NuxtLink>
          <NuxtLink to="/terms">Terms</NuxtLink>
          <NuxtLink to="/support">Support</NuxtLink>
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
        <p class="eyebrow">Trust center</p>
        <h1>Privacy, in plain language.</h1>
        <p class="trust-hero__lede">
          Relay needs enough information to build a fixed service brief, contact
          businesses, compare quotes, and show you the evidence behind a
          recommendation. This notice explains what that means in the current
          product.
        </p>
        <p class="trust-updated">Last updated July 19, 2026</p>
      </section>

      <div class="trust-layout">
        <aside class="trust-summary">
          <strong>The short version</strong>
          <ul>
            <li>
              Your brief is reused consistently across contacted businesses.
            </li>
            <li>Call evidence is stored only after the required consent.</li>
            <li>Relay does not book or pay for a service on your behalf.</li>
            <li>Identity and Relay application data are managed separately.</li>
          </ul>
        </aside>

        <div class="trust-content">
          <section id="information">
            <p class="trust-section-number">01</p>
            <h2>Information Relay handles</h2>
            <p>
              Depending on the features you use, Relay handles your account
              identity from Clerk; optional profile details such as your phone
              number, location, and time zone; the addresses, dates, inventory,
              budget, access constraints, and notes in a service brief; and the
              businesses, quotes, conditions, and decisions connected to a
              request.
            </p>
            <p>
              Voice interviews, uploaded estimates, call transcripts, and
              recordings can contain personal or sensitive details. Relay also
              records limited technical information such as request IDs,
              timestamps, provider statuses, and safe error categories so the
              workflow can be secured and repaired.
            </p>
          </section>

          <section id="use">
            <p class="trust-section-number">02</p>
            <h2>How the information is used</h2>
            <p>
              Relay uses this information to authenticate you, create the exact
              brief you approve, find candidate businesses, request and
              negotiate comparable quotes, produce an evidence-backed report,
              apply your notification and retention choices, and investigate
              failures or abuse.
            </p>
            <div class="trust-callout">
              <strong>Your decision remains yours.</strong>
              <p>
                Relay can gather and negotiate quotes, but it does not accept a
                quote, book a provider, sign an agreement, or submit payment.
              </p>
            </div>
          </section>

          <section id="providers">
            <p class="trust-section-number">03</p>
            <h2>Services involved</h2>
            <p>
              A production Relay deployment can send the minimum necessary data
              to configured service providers: Clerk for authentication, Google
              Places for business discovery, ElevenLabs and Twilio for voice
              calling, OpenAI for structured extraction, Supabase for private
              evidence storage, and the configured Postgres and Redis services
              for application and job data.
            </p>
            <p>
              Those providers process information under their own terms and may
              operate in other regions. A feature that is not configured in a
              deployment is not used by that deployment.
            </p>
          </section>

          <section id="recordings">
            <p class="trust-section-number">04</p>
            <h2>Calls, transcripts, and recordings</h2>
            <p>
              Relay requires the applicable customer consent before starting a
              business-calling run and records the consent against that request.
              During a call, Sara introduces herself by name and from Relay. If
              asked, she truthfully explains that Relay uses an automated voice
              service. Recording and disclosure rules vary by location, so live
              calling must be configured for the relevant jurisdiction.
            </p>
          </section>

          <section id="retention">
            <p class="trust-section-number">05</p>
            <h2>Retention and deletion</h2>
            <p>
              The settings page provides 7, 30, or 90 day retention choices for
              recordings, transcripts, and uploaded evidence. Quote summaries,
              request records, consent records, and account data can follow a
              different retention lifecycle where they are needed to operate or
              audit the workflow. Relay stops serving evidence after its access
              deadline; physical cleanup from configured storage can follow a
              separate operational process.
            </p>
            <p>
              A verified self-service deletion workflow for all Relay
              application data is not available yet. Removing a Clerk identity
              does not by itself guarantee removal of separate Relay request or
              evidence records. Relay will not present an account deletion
              control as complete until that lifecycle is implemented and
              verified.
            </p>
          </section>

          <section id="choices">
            <p class="trust-section-number">06</p>
            <h2>Your controls</h2>
            <p>
              You can review and correct your brief before calls begin, pause or
              cancel active work, change supported privacy preferences in
              <NuxtLink to="/settings#privacy">Settings</NuxtLink>, download the
              account export currently provided there, and manage sign-in
              methods and sessions in
              <NuxtLink to="/account">Account security</NuxtLink>.
            </p>
            <p>
              For a privacy or security concern, follow the safe reporting steps
              on the <NuxtLink to="/support">Support page</NuxtLink>. Never send
              passwords, verification codes, API keys, or full recordings to an
              unverified address.
            </p>
          </section>

          <section class="trust-note">
            <h2>About this notice</h2>
            <p>
              This is a product disclosure written for clarity, not legal
              advice. Calling, recording, consent, and retention requirements
              vary by jurisdiction and must be reviewed before live use.
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
          <NuxtLink to="/terms">Terms</NuxtLink>
          <NuxtLink to="/support">Support</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
