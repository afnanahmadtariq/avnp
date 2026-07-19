import { readonly } from "vue";

const requestStorageKey = "relay-current-request";

interface CurrentRequestState {
  publicId?: string;
  runId?: string;
}

export function useCurrentRequest() {
  const state = useState<CurrentRequestState>(
    "relay-current-request",
    () => ({}),
  );

  function hydrate(): void {
    if (!import.meta.client) return;

    const stored = window.localStorage.getItem(requestStorageKey);

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as Partial<CurrentRequestState>;

      if (parsed.publicId === "RLY-2048") {
        window.localStorage.removeItem(requestStorageKey);
        return;
      }

      if (typeof parsed.publicId === "string" && parsed.publicId.length > 0) {
        state.value = {
          publicId: parsed.publicId,
          ...(typeof parsed.runId === "string" ? { runId: parsed.runId } : {}),
        };
      }
    } catch {
      window.localStorage.removeItem(requestStorageKey);
    }
  }

  function setCurrent(publicId: string, runId?: string): void {
    state.value = { publicId, ...(runId ? { runId } : {}) };

    if (import.meta.client) {
      window.localStorage.setItem(
        requestStorageKey,
        JSON.stringify(state.value),
      );
    }
  }

  function clearCurrent(): void {
    state.value = {};
    if (import.meta.client) window.localStorage.removeItem(requestStorageKey);
  }

  return { clearCurrent, currentRequest: readonly(state), hydrate, setCurrent };
}
