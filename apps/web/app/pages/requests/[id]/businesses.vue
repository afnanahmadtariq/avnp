<script setup lang="ts">
import RequestBusinessesPage from "../../../components/requests/RequestBusinessesPage.vue";
import RequestStageGate from "../../../components/requests/RequestStageGate.vue";
</script>

<template>
  <RequestStageGate v-slot="{ requestKey }" stage="businesses">
    <RequestBusinessesPage :key="requestKey" />
  </RequestStageGate>
</template>
