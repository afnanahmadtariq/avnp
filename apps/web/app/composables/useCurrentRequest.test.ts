import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCurrentRequest } from "./useCurrentRequest";

const state = new Map<string, { value: unknown }>();

beforeEach(() => {
  state.clear();
  window.localStorage.clear();
  vi.stubGlobal("useState", (key: string, factory: () => unknown) => {
    const existing = state.get(key);
    if (existing) return existing;

    const value = ref(factory());
    state.set(key, value);
    return value;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCurrentRequest", () => {
  it("starts without a demo request and only exposes an explicitly selected job", () => {
    const request = useCurrentRequest();

    expect(request.currentRequest.value.publicId).toBeUndefined();

    request.setCurrent("RLY-BD2E9FEE");

    expect(request.currentRequest.value).toEqual({ publicId: "RLY-BD2E9FEE" });
  });

  it("can clear a stale current request", () => {
    const request = useCurrentRequest();
    request.setCurrent("RLY-2048");

    request.clearCurrent();

    expect(request.currentRequest.value).toEqual({});
  });
});
