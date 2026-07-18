<script setup lang="ts">
import { negotiations, recommendation } from "../../data/demo";
import { formatCurrency } from "../../utils/currency";

const previewNegotiations = negotiations.map((negotiation) => ({
  company: negotiation.company,
  currentOffer: negotiation.currentOffer,
  initialOffer: negotiation.initialOffer,
  status: negotiation.status,
  tone:
    negotiation.tone === "complete"
      ? ("success" as const)
      : negotiation.tone === "live"
        ? ("live" as const)
        : ("neutral" as const),
}));
</script>

<template>
  <div class="product-preview" aria-label="Example Relay negotiation session">
    <div class="product-preview__chrome">
      <div class="product-preview__brand">
        <RelayLogo compact />
        <span>Charlotte move</span>
      </div>
      <StatusBadge tone="live">Live demo</StatusBadge>
    </div>

    <div class="product-preview__summary">
      <div>
        <span class="product-preview__label">Verified savings</span>
        <strong class="mono-number">
          {{ formatCurrency(recommendation.savings) }}
        </strong>
      </div>
      <div class="product-preview__confidence">
        <span>{{ recommendation.confidence }}%</span>
        <small>confidence</small>
      </div>
    </div>

    <div class="product-preview__section-heading">
      <span>Negotiations</span>
      <span>3 businesses</span>
    </div>

    <div class="product-preview__offers">
      <article
        v-for="negotiation in previewNegotiations"
        :key="negotiation.company"
        class="offer"
      >
        <div class="offer__identity">
          <span aria-hidden="true" class="offer__avatar">
            {{
              negotiation.company
                .split(" ")
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
            }}
          </span>
          <div>
            <strong>{{ negotiation.company }}</strong>
            <StatusBadge :tone="negotiation.tone">
              {{ negotiation.status }}
            </StatusBadge>
          </div>
        </div>
        <div class="offer__price">
          <s v-if="negotiation.initialOffer !== negotiation.currentOffer">
            {{ formatCurrency(negotiation.initialOffer) }}
          </s>
          <strong class="mono-number">
            {{ formatCurrency(negotiation.currentOffer) }}
          </strong>
        </div>
      </article>
    </div>

    <div class="product-preview__recommendation">
      <span aria-hidden="true" class="recommendation-check">✓</span>
      <div>
        <strong>Pine & Co. is the best verified value</strong>
        <p>$80 below the next offer · every fee confirmed</p>
      </div>
      <span aria-hidden="true" class="recommendation-arrow">→</span>
    </div>
  </div>
</template>

<style scoped>
.product-preview {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line-strong);
  border-radius: 22px;
  box-shadow: var(--relay-shadow-md);
  overflow: hidden;
}

.product-preview__chrome {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  min-height: 62px;
  padding: 0 20px;
}

.product-preview__brand {
  align-items: center;
  display: flex;
  gap: 12px;
}

.product-preview__brand > span {
  border-left: 1px solid var(--relay-line-strong);
  color: var(--relay-muted);
  font-size: 0.75rem;
  padding-left: 12px;
}

.product-preview__summary {
  align-items: flex-end;
  background: var(--relay-ink);
  color: #ffffff;
  display: flex;
  justify-content: space-between;
  margin: 14px;
  min-height: 130px;
  padding: 24px;
  border-radius: 15px;
}

.product-preview__summary > div:first-child {
  display: grid;
  gap: 7px;
}

.product-preview__label {
  color: rgb(255 255 255 / 58%);
  font-size: 0.7rem;
}

.product-preview__summary strong {
  font-size: 2.35rem;
  font-weight: 520;
  letter-spacing: -0.055em;
}

.product-preview__confidence {
  align-items: flex-end;
  display: grid;
  justify-items: end;
}

.product-preview__confidence span {
  color: #86e6b3;
  font-size: 0.9rem;
  font-weight: 580;
}

.product-preview__confidence small {
  color: rgb(255 255 255 / 45%);
  font-size: 0.62rem;
}

.product-preview__section-heading {
  color: var(--relay-faint);
  display: flex;
  font-size: 0.66rem;
  justify-content: space-between;
  letter-spacing: 0.05em;
  padding: 7px 20px 4px;
  text-transform: uppercase;
}

.product-preview__offers {
  padding: 0 14px;
}

.offer {
  align-items: center;
  border-bottom: 1px solid var(--relay-line);
  display: flex;
  justify-content: space-between;
  min-height: 76px;
  padding: 10px 6px;
}

.offer:last-child {
  border-bottom: 0;
}

.offer__identity {
  align-items: center;
  display: flex;
  gap: 10px;
  min-width: 0;
}

.offer__identity > div {
  display: grid;
  gap: 6px;
}

.offer__identity strong {
  font-size: 0.76rem;
  font-weight: 570;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offer__avatar {
  align-items: center;
  background: var(--relay-surface-muted);
  border: 1px solid var(--relay-line);
  border-radius: 10px;
  color: var(--relay-muted);
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 0.6rem;
  font-weight: 600;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.offer__price {
  align-items: flex-end;
  display: grid;
  justify-items: end;
}

.offer__price s {
  color: var(--relay-faint);
  font-size: 0.62rem;
}

.offer__price strong {
  font-size: 0.88rem;
  font-weight: 580;
}

.product-preview__recommendation {
  align-items: center;
  background: var(--relay-green-soft);
  border: 1px solid #ccebd9;
  border-radius: 14px;
  display: grid;
  gap: 10px;
  grid-template-columns: auto 1fr auto;
  margin: 6px 14px 14px;
  padding: 14px;
}

.recommendation-check {
  align-items: center;
  background: var(--relay-green);
  border-radius: 999px;
  color: #ffffff;
  display: inline-flex;
  font-size: 0.65rem;
  height: 22px;
  justify-content: center;
  width: 22px;
}

.product-preview__recommendation strong {
  display: block;
  font-size: 0.72rem;
  font-weight: 580;
}

.product-preview__recommendation p {
  color: var(--relay-muted);
  font-size: 0.63rem;
  margin: 3px 0 0;
}

.recommendation-arrow {
  color: var(--relay-green);
}

@media (max-width: 520px) {
  .product-preview__summary {
    min-height: 116px;
    padding: 19px;
  }

  .product-preview__summary strong {
    font-size: 1.95rem;
  }

  .product-preview__brand > span {
    display: none;
  }
}
</style>
