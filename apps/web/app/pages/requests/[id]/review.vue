<script setup lang="ts">
import RequestReviewPage from "../../../components/requests/RequestReviewPage.vue";
import RequestStageGate from "../../../components/requests/RequestStageGate.vue";
</script>

<template>
  <RequestStageGate v-slot="{ requestKey }" stage="review">
    <RequestReviewPage :key="requestKey" />
  </RequestStageGate>
</template>
