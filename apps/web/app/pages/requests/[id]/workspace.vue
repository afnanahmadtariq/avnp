<script setup lang="ts">
import RequestWorkspacePage from "../../../components/requests/RequestWorkspacePage.vue";
import RequestStageGate from "../../../components/requests/RequestStageGate.vue";
</script>

<template>
  <RequestStageGate v-slot="{ requestKey }" stage="workspace">
    <RequestWorkspacePage :key="requestKey" />
  </RequestStageGate>
</template>
