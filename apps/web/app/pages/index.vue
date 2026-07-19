<script setup lang="ts">
useSeoMeta({
  description:
    "Relay interviews you once, negotiates with multiple businesses, and recommends the strongest verified offer.",
  ogDescription:
    "One brief in. Better offers out. Every recommendation backed by evidence.",
  ogTitle: "Relay — Your AI negotiator",
  title: "Relay — Your AI negotiator",
  twitterCard: "summary_large_image",
});

const outcomes = [
  {
    detail: "from the initial offer",
    label: "Verified savings",
    value: "$370",
  },
  { detail: "called in parallel", label: "Comparable quotes", value: "3" },
  { detail: "behind the decision", label: "Evidence points", value: "7" },
];

const steps = [
  {
    number: "01",
    title: "Tell Relay once",
    text: "A short guided interview turns your needs, budget, and non-negotiables into one confirmed brief.",
  },
  {
    number: "02",
    title: "Relay works the phones",
    text: "Businesses receive the same facts. Relay gathers itemized quotes and negotiates price and terms in parallel.",
  },
  {
    number: "03",
    title: "Choose with proof",
    text: "Every offer is normalized, hidden fees are surfaced, and the recommendation links back to call evidence.",
  },
];
</script>

<template>
  <div class="marketing-page">
    <header class="marketing-header">
      <div class="container marketing-header__inner">
        <NuxtLink aria-label="Relay home" to="/">
          <RelayLogo />
        </NuxtLink>

        <nav aria-label="Primary navigation" class="marketing-nav">
          <a href="#how-it-works">How it works</a>
          <a href="#proof">Why Relay</a>
          <a href="#safety">Principles</a>
        </nav>

        <NuxtLink class="header-demo-link" to="/dashboard">
          Open dashboard <span aria-hidden="true">↗</span>
        </NuxtLink>
      </div>
    </header>

    <main id="main-content">
      <section class="hero container">
        <div class="hero__copy">
          <div class="launch-note">
            <span aria-hidden="true" class="launch-note__signal" />
            Now negotiating moving services
          </div>

          <h1>Your best price, without the back-and-forth.</h1>
          <p class="hero__lede">
            Tell Relay what you need once. It calls multiple businesses,
            negotiates every comparable offer, and shows you the strongest deal
            with evidence.
          </p>

          <div class="hero__actions">
            <NuxtLink class="button button--blue" to="/start">
              Start your brief <span aria-hidden="true">→</span>
            </NuxtLink>
            <a class="button button--secondary" href="#how-it-works">
              See how it works
            </a>
          </div>

          <p class="hero__note">
            <span aria-hidden="true">✓</span>
            Start with a two-minute guided brief
          </p>
        </div>

        <div class="hero__product">
          <MarketingHeroWorkspacePreview />
        </div>
      </section>

      <section aria-label="Relay product outcome" class="outcomes container">
        <div class="outcomes__intro">
          <span>One confirmed brief</span>
          <span aria-hidden="true">→</span>
          <span>Three honest negotiations</span>
          <span aria-hidden="true">→</span>
          <strong>One clear decision</strong>
        </div>
        <div class="outcomes__grid">
          <article v-for="outcome in outcomes" :key="outcome.label">
            <span>{{ outcome.label }}</span>
            <strong class="mono-number">{{ outcome.value }}</strong>
            <small>{{ outcome.detail }}</small>
          </article>
        </div>
      </section>

      <section id="how-it-works" class="process-section">
        <div class="container">
          <div class="section-heading">
            <div>
              <p class="eyebrow">One conversation in</p>
              <h2>The market comes back to you.</h2>
            </div>
            <p>
              Relay keeps the scope fixed from first call to final comparison,
              so every improvement is real and every quote stays comparable.
            </p>
          </div>

          <div class="steps">
            <article v-for="step in steps" :key="step.number" class="step-card">
              <span class="step-card__number">{{ step.number }}</span>
              <div class="step-card__line" />
              <h3>{{ step.title }}</h3>
              <p>{{ step.text }}</p>
            </article>
          </div>
        </div>
      </section>

      <section id="proof" class="proof-section container">
        <div class="section-heading section-heading--stacked">
          <p class="eyebrow">Built for trust</p>
          <h2>Negotiation you can inspect.</h2>
          <p>
            Relay does more than surface a lower number. It preserves the
            reasoning, terms, and source behind every recommendation.
          </p>
        </div>

        <div class="proof-grid">
          <article class="proof-card proof-card--dark">
            <div class="proof-card__topline">
              <span>Live negotiation</span>
              <StatusBadge tone="live">In progress</StatusBadge>
            </div>
            <blockquote>
              “If we accept your earliest Tuesday window, can you improve the
              all-in price without changing the crew or inventory?”
            </blockquote>
            <div class="proof-card__result">
              <span>Price improved</span>
              <strong>$2,210 → $1,840</strong>
            </div>
          </article>

          <article class="proof-card proof-card--comparison">
            <span class="proof-card__label">Like-for-like comparison</span>
            <h3>Every fee has a place.</h3>
            <div class="mini-quote mini-quote--best">
              <span>Pine & Co.</span>
              <strong>$1,840</strong>
              <small>All known fees included</small>
            </div>
            <div class="mini-quote">
              <span>Carolina Transit</span>
              <strong>$1,920</strong>
              <small>Deposit terms still open</small>
            </div>
            <div class="mini-quote">
              <span>Union City</span>
              <strong>$2,110</strong>
              <small>Fuel and stair fees itemized</small>
            </div>
          </article>

          <article class="proof-card proof-card--evidence">
            <span class="proof-card__label">Evidence attached</span>
            <h3>The “why” is never hidden.</h3>
            <ul>
              <li>
                <span aria-hidden="true">01</span>
                <div>
                  <strong>Guaranteed total</strong>
                  <small>Transcript · 12:42</small>
                </div>
                <span aria-hidden="true">↗</span>
              </li>
              <li>
                <span aria-hidden="true">02</span>
                <div>
                  <strong>No fuel surcharge</strong>
                  <small>Revised quote · line 8</small>
                </div>
                <span aria-hidden="true">↗</span>
              </li>
              <li>
                <span aria-hidden="true">03</span>
                <div>
                  <strong>One-hour arrival</strong>
                  <small>Transcript · 12:39</small>
                </div>
                <span aria-hidden="true">↗</span>
              </li>
            </ul>
          </article>
        </div>
      </section>

      <section id="safety" class="principles-section">
        <div class="container principles-section__inner">
          <div>
            <p class="eyebrow">Quietly on your side</p>
            <h2>Truthful leverage. Your terms. Your decision.</h2>
          </div>
          <div class="principles-list">
            <article>
              <span aria-hidden="true">✓</span>
              <div>
                <h3>No invented bids</h3>
                <p>Relay only uses offers a business actually made.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true">✓</span>
              <div>
                <h3>No silent scope changes</h3>
                <p>Your confirmed facts remain fixed across every call.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true">✓</span>
              <div>
                <h3>You stay in control</h3>
                <p>
                  Review the proof and decide. Relay never books on its own.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section class="closing-section container">
        <div class="closing-card">
          <div>
            <p class="eyebrow">See the full loop</p>
            <h2>From “what do I ask?” to “this is the one.”</h2>
          </div>
          <NuxtLink class="button button--blue" to="/start">
            Start a guided brief <span aria-hidden="true">→</span>
          </NuxtLink>
        </div>
      </section>
    </main>

    <footer class="marketing-footer">
      <div class="container marketing-footer__inner">
        <RelayLogo />
        <p>Your AI negotiator. Evidence first.</p>
        <div>
          <a href="#how-it-works">How it works</a>
          <NuxtLink to="/start">Start a brief</NuxtLink>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.marketing-page {
  overflow: hidden;
}

.marketing-header {
  background: rgb(245 244 239 / 92%);
  border-bottom: 1px solid transparent;
  position: relative;
  z-index: 20;
}

.marketing-header__inner {
  align-items: center;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  min-height: 78px;
}

.marketing-nav {
  align-items: center;
  display: flex;
  gap: 28px;
}

.marketing-nav a,
.header-demo-link {
  color: var(--relay-muted);
  font-size: 0.78rem;
  font-weight: 520;
  transition: color 150ms ease;
}

.marketing-nav a:hover,
.header-demo-link:hover {
  color: var(--relay-ink);
}

.header-demo-link {
  justify-self: end;
}

.hero {
  align-items: center;
  display: grid;
  gap: clamp(52px, 8vw, 108px);
  grid-template-columns: minmax(0, 1.03fr) minmax(410px, 0.82fr);
  min-height: 640px;
  padding-bottom: 86px;
  padding-top: 70px;
}

.launch-note {
  align-items: center;
  background: rgb(255 255 255 / 68%);
  border: 1px solid var(--relay-line-strong);
  border-radius: 999px;
  color: var(--relay-muted);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  gap: 8px;
  margin-bottom: 26px;
  padding: 7px 11px;
}

.launch-note__signal {
  background: var(--relay-mint);
  border: 2px solid #ffffff;
  border-radius: 999px;
  box-shadow: 0 0 0 1px #5db987;
  height: 8px;
  width: 8px;
}

.hero h1 {
  font-size: clamp(3rem, 5vw, 4.65rem);
  font-weight: 540;
  letter-spacing: -0.055em;
  line-height: 0.98;
  margin-bottom: 28px;
  max-width: 710px;
}

.hero__lede {
  color: var(--relay-muted);
  font-size: clamp(1rem, 1.55vw, 1.18rem);
  line-height: 1.65;
  margin-bottom: 32px;
  max-width: 610px;
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero__note {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin: 15px 0 0 4px;
}

.hero__note span {
  color: var(--relay-green);
  margin-right: 4px;
}

.hero__product {
  min-width: 0;
  position: relative;
}

.outcomes {
  border-bottom: 1px solid var(--relay-line-strong);
  border-top: 1px solid var(--relay-line-strong);
  padding-bottom: 42px;
  padding-top: 42px;
}

.outcomes__intro {
  align-items: center;
  color: var(--relay-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: var(--relay-text-meta);
  gap: 12px;
  justify-content: center;
  margin-bottom: 38px;
}

.outcomes__intro strong {
  color: var(--relay-ink);
  font-weight: 590;
}

.outcomes__intro [aria-hidden="true"] {
  color: var(--relay-faint);
}

.outcomes__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.outcomes article {
  align-items: center;
  border-right: 1px solid var(--relay-line-strong);
  display: grid;
  justify-items: center;
  padding: 8px 24px;
}

.outcomes article:last-child {
  border-right: 0;
}

.outcomes article > span,
.outcomes small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.outcomes strong {
  font-size: 2.55rem;
  font-weight: 510;
  letter-spacing: -0.055em;
  margin: 5px 0 3px;
}

.process-section {
  padding: 142px 0;
}

.section-heading {
  align-items: end;
  display: grid;
  gap: 60px;
  grid-template-columns: 1.1fr 0.9fr;
  margin-bottom: 68px;
}

.section-heading h2,
.principles-section h2,
.closing-card h2 {
  font-size: clamp(2.5rem, 4.6vw, 4.25rem);
  font-weight: 510;
  letter-spacing: -0.06em;
  line-height: 1;
  margin-bottom: 0;
}

.section-heading > p,
.section-heading--stacked > p:last-child {
  color: var(--relay-muted);
  font-size: 0.96rem;
  line-height: 1.7;
  margin: 0;
  max-width: 510px;
}

.steps {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.step-card {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line);
  border-radius: var(--relay-radius);
  min-height: 285px;
  padding: 26px;
}

.step-card__number {
  color: var(--relay-blue);
  font-size: var(--relay-text-meta);
  font-variant-numeric: tabular-nums;
  font-weight: 590;
}

.step-card__line {
  background: var(--relay-line);
  height: 1px;
  margin: 40px 0 30px;
  position: relative;
}

.step-card__line::before {
  background: var(--relay-blue);
  border-radius: 999px;
  content: "";
  height: 7px;
  left: 0;
  position: absolute;
  top: -3px;
  width: 7px;
}

.step-card h3,
.proof-card h3,
.principles-list h3 {
  font-size: 1rem;
  font-weight: 590;
  letter-spacing: -0.025em;
}

.step-card p,
.principles-list p {
  color: var(--relay-muted);
  font-size: 0.78rem;
  line-height: 1.65;
  margin: 0;
}

.proof-section {
  padding-bottom: 150px;
}

.section-heading--stacked {
  display: block;
  max-width: 720px;
}

.section-heading--stacked h2 {
  margin-bottom: 24px;
}

.proof-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.proof-card {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line);
  border-radius: var(--relay-radius-lg);
  min-height: 390px;
  overflow: hidden;
  padding: 30px;
}

.proof-card--dark {
  background: var(--relay-ink);
  color: #ffffff;
  display: flex;
  flex-direction: column;
  grid-column: span 2;
  justify-content: space-between;
  min-height: 430px;
}

.proof-card__topline {
  align-items: center;
  color: rgb(255 255 255 / 52%);
  display: flex;
  font-size: var(--relay-text-meta);
  justify-content: space-between;
}

.proof-card blockquote {
  font-size: clamp(1.65rem, 3vw, 2.75rem);
  font-weight: 430;
  letter-spacing: -0.045em;
  line-height: 1.22;
  margin: 46px auto;
  max-width: 850px;
  text-align: center;
}

.proof-card__result {
  align-items: end;
  border-top: 1px solid rgb(255 255 255 / 14%);
  display: flex;
  justify-content: space-between;
  padding-top: 20px;
}

.proof-card__result span {
  color: rgb(255 255 255 / 52%);
  font-size: var(--relay-text-meta);
}

.proof-card__result strong {
  color: var(--relay-mint);
  font-size: 1.15rem;
  font-weight: 560;
}

.proof-card__label {
  color: var(--relay-blue);
  display: block;
  font-size: var(--relay-text-meta);
  font-weight: 590;
  letter-spacing: 0.08em;
  margin-bottom: 24px;
  text-transform: uppercase;
}

.proof-card h3 {
  font-size: 1.5rem;
  margin-bottom: 30px;
}

.mini-quote {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 3px 12px;
  grid-template-columns: 1fr auto;
  padding: 18px 0;
}

.mini-quote > span {
  font-size: 0.78rem;
  font-weight: 560;
}

.mini-quote strong {
  font-size: 0.86rem;
  font-weight: 600;
}

.mini-quote small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  grid-column: 1 / -1;
}

.mini-quote--best strong {
  color: var(--relay-green);
}

.proof-card--evidence ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.proof-card--evidence li {
  align-items: center;
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 12px;
  grid-template-columns: auto 1fr auto;
  padding: 17px 0;
}

.proof-card--evidence li > span:first-child {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}

.proof-card--evidence li > span:last-child {
  color: var(--relay-blue);
}

.proof-card--evidence strong,
.proof-card--evidence small {
  display: block;
}

.proof-card--evidence strong {
  font-size: 0.77rem;
  font-weight: 560;
}

.proof-card--evidence small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-top: 3px;
}

.principles-section {
  background: var(--relay-surface);
  border-bottom: 1px solid var(--relay-line);
  border-top: 1px solid var(--relay-line);
  padding: 130px 0;
}

.principles-section__inner {
  display: grid;
  gap: clamp(70px, 12vw, 160px);
  grid-template-columns: 0.92fr 1.08fr;
}

.principles-section h2 {
  font-size: clamp(2.4rem, 4vw, 3.7rem);
}

.principles-list {
  display: grid;
}

.principles-list article {
  border-top: 1px solid var(--relay-line);
  display: grid;
  gap: 16px;
  grid-template-columns: auto 1fr;
  padding: 25px 0;
}

.principles-list article:last-child {
  border-bottom: 1px solid var(--relay-line);
}

.principles-list article > span {
  align-items: center;
  background: var(--relay-green-soft);
  border-radius: 999px;
  color: var(--relay-green);
  display: inline-flex;
  font-size: var(--relay-text-meta);
  height: 24px;
  justify-content: center;
  width: 24px;
}

.principles-list h3 {
  margin-bottom: 6px;
}

.closing-section {
  padding-bottom: 120px;
  padding-top: 120px;
}

.closing-card {
  align-items: end;
  background: var(--relay-ink);
  border-radius: 28px;
  color: #ffffff;
  display: grid;
  gap: 80px;
  grid-template-columns: 1fr auto;
  min-height: 400px;
  padding: 50px;
}

.closing-card .eyebrow {
  color: var(--relay-mint);
}

.closing-card h2 {
  max-width: 700px;
}

.marketing-footer {
  background: var(--relay-surface);
  border-top: 1px solid var(--relay-line);
}

.marketing-footer__inner {
  align-items: center;
  color: var(--relay-muted);
  display: grid;
  font-size: var(--relay-text-meta);
  grid-template-columns: 1fr auto 1fr;
  min-height: 120px;
}

.marketing-footer__inner p {
  margin: 0;
}

.marketing-footer__inner > div {
  display: flex;
  gap: 18px;
  justify-self: end;
}

.marketing-footer a:hover {
  color: var(--relay-ink);
}

@media (max-width: 1024px) {
  .marketing-header__inner {
    grid-template-columns: 1fr auto;
  }

  .marketing-nav {
    display: none;
  }

  .hero {
    grid-template-columns: 1fr;
    padding-top: 76px;
  }

  .hero__copy {
    max-width: 760px;
  }

  .hero__product {
    margin: 0 auto;
    max-width: 620px;
    width: 100%;
  }

  .section-heading,
  .principles-section__inner {
    gap: 32px;
    grid-template-columns: 1fr;
  }

  .steps {
    grid-template-columns: 1fr;
  }

  .step-card {
    min-height: 0;
  }

  .proof-grid {
    grid-template-columns: 1fr;
  }

  .proof-card--dark {
    grid-column: auto;
  }

  .closing-card {
    align-items: start;
    gap: 46px;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .marketing-header__inner {
    min-height: 70px;
  }

  .header-demo-link span {
    display: none;
  }

  .hero {
    gap: 66px;
    min-height: 0;
    padding-bottom: 90px;
    padding-top: 62px;
  }

  .hero h1 {
    font-size: clamp(2.75rem, 13vw, 3.25rem);
  }

  .hero__actions {
    display: grid;
  }

  .outcomes__intro {
    align-items: flex-start;
    flex-direction: column;
  }

  .outcomes__intro [aria-hidden="true"] {
    display: none;
  }

  .outcomes__grid {
    grid-template-columns: 1fr;
  }

  .outcomes article {
    border-bottom: 1px solid var(--relay-line);
    border-right: 0;
    padding: 22px;
  }

  .outcomes article:last-child {
    border-bottom: 0;
  }

  .process-section,
  .principles-section {
    padding: 96px 0;
  }

  .proof-section {
    padding-bottom: 100px;
  }

  .proof-card {
    min-height: 0;
    padding: 24px;
  }

  .proof-card--dark {
    min-height: 440px;
  }

  .proof-card blockquote {
    font-size: 1.55rem;
    margin: 54px 0;
    text-align: left;
  }

  .proof-card__result {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .closing-section {
    padding: 80px 0;
  }

  .closing-card {
    border-radius: 20px;
    min-height: 430px;
    padding: 30px 24px;
  }

  .marketing-footer__inner {
    align-items: flex-start;
    gap: 22px;
    grid-template-columns: 1fr;
    padding-bottom: 32px;
    padding-top: 32px;
  }

  .marketing-footer__inner > div {
    justify-self: start;
  }
}
</style>
