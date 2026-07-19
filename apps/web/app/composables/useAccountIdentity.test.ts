import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAccountIdentity } from "./useAccountIdentity";

const state = new Map<string, { value: unknown }>();

beforeEach(() => {
  state.clear();
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

describe("useAccountIdentity", () => {
  it("derives shared account labels and updates them from a profile", () => {
    const account = useAccountIdentity();

    expect(account.displayName.value).toBe("Relay member");
    expect(account.firstName.value).toBe("Relay");
    expect(account.initials.value).toBe("RM");
    expect(account.isLoaded.value).toBe(false);

    account.syncAccountIdentity({
      displayName: "Ada Lovelace",
      representedAs: "Ada L.",
    });

    expect(account.displayName.value).toBe("Ada Lovelace");
    expect(account.firstName.value).toBe("Ada");
    expect(account.initials.value).toBe("AL");
    expect(account.representedAs.value).toBe("Ada L.");
    expect(account.isLoaded.value).toBe(true);
  });
});
