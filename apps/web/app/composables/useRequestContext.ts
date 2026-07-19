import { computed, onMounted } from "vue";

export function useRequestContext() {
  const route = useRoute();
  const { currentRequest, hydrate, setCurrent } = useCurrentRequest();

  const publicId = computed(() => {
    const routeId = route.params.id;

    return typeof routeId === "string" && routeId.length > 0
      ? routeId
      : currentRequest.value.publicId;
  });

  const runId = computed(() => {
    const queryRunId = route.query.run;

    if (typeof queryRunId === "string" && queryRunId.length > 0) {
      return queryRunId;
    }

    return currentRequest.value.publicId === publicId.value
      ? currentRequest.value.runId
      : undefined;
  });

  onMounted(hydrate);

  return { currentRequest, publicId, runId, setCurrent };
}
