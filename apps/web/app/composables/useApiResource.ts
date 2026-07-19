import { ref, shallowRef } from "vue";

export function useApiResource<T>(loader: () => Promise<T>) {
  const data = shallowRef<T>();
  const error = ref("");
  const pending = ref(false);

  async function refresh(): Promise<T | undefined> {
    pending.value = true;
    error.value = "";

    try {
      const result = await loader();
      data.value = result;
      return result;
    } catch (cause: unknown) {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Relay could not load this information.";
      return undefined;
    } finally {
      pending.value = false;
    }
  }

  return { data, error, pending, refresh };
}
