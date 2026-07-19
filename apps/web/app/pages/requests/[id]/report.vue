<script setup lang="ts">
import RequestReportPage from "../../../components/requests/RequestReportPage.vue";
import RequestStageGate from "../../../components/requests/RequestStageGate.vue";
</script>

<template>
  <RequestStageGate v-slot="{ requestKey }" stage="report">
    <RequestReportPage :key="requestKey" />
  </RequestStageGate>
</template>
