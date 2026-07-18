<script setup lang="ts">
import type { Quote } from "../../data/demo";
import { formatCurrency } from "../../utils/currency";
import StatusBadge from "../StatusBadge.vue";

defineProps<{
  quotes: Quote[];
  selectedId: string;
}>();

const emit = defineEmits<{
  select: [quoteId: string];
}>();
</script>

<template>
  <div class="quote-table-wrap">
    <table class="quote-table">
      <caption class="sr-only">
        Comparable moving quotes, normalized to the confirmed move brief
      </caption>
      <thead>
        <tr>
          <th scope="col">Business</th>
          <th scope="col">All-in price</th>
          <th scope="col">Arrival</th>
          <th scope="col">Deposit</th>
          <th scope="col">Score</th>
          <th scope="col"><span class="sr-only">Review quote</span></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="quote in quotes"
          :key="quote.id"
          :class="{
            'quote-table__row--recommended': quote.recommended,
            'quote-table__row--selected': quote.id === selectedId,
          }"
        >
          <th scope="row">
            <span class="quote-company">
              <span>{{ quote.company }}</span>
              <StatusBadge v-if="quote.recommended" :dot="false" tone="success">
                Recommended
              </StatusBadge>
            </span>
          </th>
          <td>
            <span class="quote-price mono-number">
              {{ formatCurrency(quote.total) }}
            </span>
            <s v-if="quote.initialTotal !== quote.total">
              {{ formatCurrency(quote.initialTotal) }}
            </s>
          </td>
          <td>{{ quote.arrival }}</td>
          <td>{{ quote.deposit }}</td>
          <td>
            <span class="quote-score mono-number">{{ quote.score }}/100</span>
          </td>
          <td>
            <button
              :aria-pressed="quote.id === selectedId"
              class="review-button"
              type="button"
              @click="emit('select', quote.id)"
            >
              {{ quote.id === selectedId ? "Selected" : "Review" }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.quote-table-wrap {
  overflow-x: auto;
}

.quote-table {
  border-collapse: collapse;
  min-width: 740px;
  width: 100%;
}

.quote-table th,
.quote-table td {
  border-bottom: 1px solid var(--relay-line);
  padding: 16px 12px;
  text-align: left;
  vertical-align: middle;
}

.quote-table thead th {
  color: var(--relay-faint);
  font-size: 0.66rem;
  font-weight: 560;
  letter-spacing: 0.055em;
  padding-bottom: 11px;
  padding-top: 5px;
  text-transform: uppercase;
}

.quote-table tbody th {
  font-size: 0.8rem;
  font-weight: 570;
  min-width: 180px;
}

.quote-table tbody td {
  color: var(--relay-muted);
  font-size: 0.75rem;
}

.quote-table tbody tr:last-child th,
.quote-table tbody tr:last-child td {
  border-bottom: 0;
}

.quote-table__row--recommended {
  background: var(--relay-green-soft);
}

.quote-table__row--selected {
  box-shadow: inset 3px 0 var(--relay-blue);
}

.quote-company {
  align-items: flex-start;
  display: grid;
  gap: 7px;
  width: fit-content;
}

.quote-price {
  color: var(--relay-ink);
  display: block;
  font-size: 0.88rem;
  font-weight: 600;
}

.quote-table s {
  color: var(--relay-faint);
  display: block;
  font-size: 0.65rem;
  margin-top: 3px;
}

.quote-score {
  color: var(--relay-green);
  font-weight: 590;
}

.review-button {
  background: var(--relay-surface);
  border: 1px solid var(--relay-line-strong);
  border-radius: 9px;
  color: var(--relay-ink-soft);
  font-size: 0.7rem;
  font-weight: 560;
  min-height: 34px;
  padding: 0 11px;
}

.review-button:hover,
.review-button[aria-pressed="true"] {
  border-color: var(--relay-blue);
  color: var(--relay-blue);
}

@media (max-width: 720px) {
  .quote-table-wrap {
    margin: 0 -4px;
    padding-bottom: 6px;
  }
}
</style>
