<script setup lang="ts">
useSeoMeta({
  description:
    "Plain-language product terms for using Relay's quote gathering and negotiation workflow.",
  title: "Product terms · Relay",
});
</script>

<template>
  <div class="trust-shell">
    <header class="trust-header">
      <div class="container trust-header__inner">
        <NuxtLink aria-label="Relay home" to="/"><RelayLogo /></NuxtLink>
        <nav aria-label="Trust center navigation" class="trust-nav">
          <NuxtLink to="/privacy">Privacy</NuxtLink>
          <NuxtLink aria-current="page" to="/terms">Terms</NuxtLink>
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
        <p class="eyebrow">Product terms</p>
        <h1>A clear boundary around what Relay does.</h1>
        <p class="trust-hero__lede">
          These terms describe the current Relay preview and the rules for using
          its brief, business discovery, calling, negotiation, and reporting
          features.
        </p>
        <p class="trust-updated">Last updated July 19, 2026</p>
      </section>

      <div class="trust-layout">
        <aside class="trust-summary">
          <strong>Before you use Relay</strong>
          <ul>
            <li>
              You approve the facts and remain responsible for the decision.
            </li>
            <li>Relay requests quotes; it does not book or pay.</li>
            <li>Only truthful, comparable offers may be used as leverage.</li>
            <li>Calling and recording must be lawful where they occur.</li>
          </ul>
        </aside>

        <div class="trust-content">
          <section>
            <p class="trust-section-number">01</p>
            <h2>The service</h2>
            <p>
              Relay helps you describe a service need once, contact multiple
              businesses with the same confirmed facts, gather itemized quotes,
              negotiate price or terms, and compare the resulting evidence.
              Relay currently exposes free access only; no customer billing or
              paid subscription flow is implemented.
            </p>
          </section>

          <section>
            <p class="trust-section-number">02</p>
            <h2>Your authority and information</h2>
            <p>
              You must provide accurate information, have authority to request
              the service and authorize the calls, and review the exact brief
              before a run begins. Do not submit another person’s private
              information, a phone target you are not allowed to contact, or
              content that is unlawful, deceptive, abusive, or unsafe.
            </p>
          </section>

          <section>
            <p class="trust-section-number">03</p>
            <h2>Calls and truthful representation</h2>
            <p>
              Relay may use an automated voice service to contact businesses.
              Sara identifies herself by name and from Relay, states who she is
              calling for, and answers identity questions truthfully. You are
              responsible for ensuring that outbound calling, recording,
              consent, and disclosure are permitted for the people and
              jurisdictions involved.
            </p>
          </section>

          <section>
            <p class="trust-section-number">04</p>
            <h2>Negotiation boundaries</h2>
            <p>
              Relay must not invent bids, business identities, prices, service
              facts, customer authority, or commitments. A competing quote may
              be mentioned only when it is real, compatible with the confirmed
              scope, and supported by evidence. Relay can ask for a better price
              or terms, but cannot accept, sign, book, submit payment, or bind
              you to an agreement.
            </p>
          </section>

          <section>
            <p class="trust-section-number">05</p>
            <h2>Review every result</h2>
            <p>
              Quotes and recommendations can be incomplete, misunderstood,
              outdated, or changed by a business. Verify availability, total
              price, fees, taxes, insurance, licensing, cancellation rules, and
              the final written agreement directly with the business before you
              rely on a result. Relay is not legal, financial, insurance, or
              professional purchasing advice.
            </p>
          </section>

          <section>
            <p class="trust-section-number">06</p>
            <h2>Availability and external providers</h2>
            <p>
              Relay depends on third-party authentication, mapping, AI, phone,
              storage, database, and network services. Calls may be unanswered,
              blocked, delayed, transcribed incorrectly, or interrupted. Relay
              does not guarantee a quote, saving, successful negotiation,
              provider availability, or uninterrupted access.
            </p>
          </section>

          <section>
            <p class="trust-section-number">07</p>
            <h2>Account and data</h2>
            <p>
              Keep your sign-in methods and sessions secure. Relay may reject or
              stop work that cannot be performed safely or lawfully. How
              account, brief, quote, and evidence data are handled is explained
              in the
              <NuxtLink to="/privacy">privacy notice</NuxtLink>; known deletion
              limitations are stated there directly.
            </p>
          </section>

          <section class="trust-note">
            <h2>Plain-language notice</h2>
            <p>
              These are practical product terms for the current preview, written
              without legal jargon. They do not replace any
              jurisdiction-specific notice or agreement that may be required
              before production use.
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
          <NuxtLink to="/support">Support</NuxtLink>
        </nav>
      </div>
    </footer>
  </div>
</template>
