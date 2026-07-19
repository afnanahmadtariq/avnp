import { ref } from "vue";

export function useDecisionSelection() {
  const decisionSaved = ref(false);
  const selectedQuoteId = ref("");

  function selectQuote(quoteId: string): void {
    selectedQuoteId.value = quoteId;
    decisionSaved.value = false;
  }

  function markDecisionSaved(quoteId: string): void {
    selectedQuoteId.value = quoteId;
    decisionSaved.value = true;
  }

  return {
    decisionSaved,
    markDecisionSaved,
    selectedQuoteId,
    selectQuote,
  };
}
