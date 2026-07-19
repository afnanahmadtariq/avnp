import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AppShell from "./AppShell.vue";

const auth = vi.hoisted(() => ({
  isLoaded: { __v_isRef: true, value: true },
  userId: { __v_isRef: true, value: "user-a" as string | null },
}));
const account = vi.hoisted(() => ({
  displayName: { value: "Ada Relay" },
  initials: { value: "AR" },
  isLoaded: { value: true },
  resetAccountIdentity: vi.fn(),
  syncAccountIdentity: vi.fn(),
}));

vi.mock("@clerk/nuxt/composables", () => ({
  useAuth: () => ({
    isLoaded: auth.isLoaded,
    userId: auth.userId,
  }),
}));

vi.mock("@clerk/nuxt/components", () => ({
  UserButton: { template: "<button>User</button>" },
}));

vi.mock("../../composables/useAccountIdentity", () => ({
  useAccountIdentity: () => account,
}));

const api = { getJob: vi.fn(), getProfile: vi.fn() };
const clearCurrent = vi.fn();
const publicId = ref("");
const runId = ref<string>();
const route = { path: "/dashboard" };
const state = new Map<string, ReturnType<typeof ref>>();

beforeEach(() => {
  publicId.value = "";
  runId.value = undefined;
  route.path = "/dashboard";
  auth.isLoaded.value = true;
  auth.userId.value = "user-a";
  state.clear();
  window.localStorage.clear();
  window.localStorage.setItem("relay-account-owner", "user-a");
  api.getProfile.mockResolvedValue({ displayName: "Ada Relay" });
  api.getJob.mockResolvedValue({
    latestRunId: "run-1",
    nextAction: "follow_run",
    publicId: "RLY-2048",
  });
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { authProvider: "clerk" },
  }));
  vi.stubGlobal("useRelayApi", () => api);
  vi.stubGlobal("useRequestContext", () => ({ publicId, runId }));
  vi.stubGlobal("useCurrentRequest", () => ({ clearCurrent }));
  vi.stubGlobal("useState", (key: string, factory: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(factory()));
    return state.get(key);
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

function mountShell() {
  return mount(AppShell, {
    global: {
      stubs: {
        NuxtLink: {
          props: ["to"],
          template:
            "<a :href=\"typeof to === 'string' ? to : to.path\"><slot /></a>",
        },
        RelayLogo: { template: "<span>Relay</span>" },
        UserButton: { template: "<button>User</button>" },
      },
    },
    slots: { default: "<main>Page</main>" },
  });
}

describe("AppShell navigation", () => {
  it("does not render request links until a current request exists", async () => {
    const wrapper = mountShell();
    await flushPromises();

    const links = wrapper.findAll(".app-nav-link");
    expect(links.some((link) => link.text().includes("Dashboard"))).toBe(true);
    expect(links.some((link) => link.text().includes("New request"))).toBe(
      true,
    );
    expect(links.some((link) => link.text().includes("Profile"))).toBe(true);
    expect(links.some((link) => link.text().includes("Brief"))).toBe(false);
    expect(links.every((link) => Boolean(link.attributes("href")))).toBe(true);
    const visibleMobileLabels = links
      .filter((link) => !link.classes().includes("app-nav-link--mobile-hidden"))
      .map((link) => link.get(".app-nav-label--mobile").text());
    expect(visibleMobileLabels).toEqual(["Home", "New", "Profile"]);
    wrapper.unmount();
  });

  it("exposes the canonical five mobile destinations and maps businesses to Brief", async () => {
    publicId.value = "RLY-2048";
    route.path = "/requests/RLY-2048/businesses";
    const wrapper = mountShell();
    await flushPromises();

    const visibleMobileLabels = wrapper
      .findAll(".app-nav-link")
      .filter((link) => !link.classes().includes("app-nav-link--mobile-hidden"))
      .map((link) => link.get(".app-nav-label--mobile").text());
    expect(visibleMobileLabels).toEqual([
      "Home",
      "Brief",
      "Calls",
      "Report",
      "Profile",
    ]);
    const briefLink = wrapper
      .findAll(".app-nav-link")
      .find((link) => link.text().includes("Brief"));
    expect(briefLink?.classes()).toContain("app-nav-link--mobile-parent");
    const callsLink = wrapper
      .findAll(".app-nav-link")
      .find((link) => link.text().includes("Calls"));
    const reportLink = wrapper
      .findAll(".app-nav-link")
      .find((link) => link.text().includes("Report"));
    expect(callsLink?.attributes("aria-disabled")).toBeUndefined();
    expect(reportLink?.attributes("aria-disabled")).toBe("true");
    wrapper.unmount();
  });

  it("disables request stages that would fail before the brief is confirmed", async () => {
    publicId.value = "RLY-DRAFT";
    api.getJob.mockResolvedValueOnce({
      latestRunId: null,
      nextAction: "review_and_confirm",
      publicId: "RLY-DRAFT",
    });
    const wrapper = mountShell();
    await flushPromises();

    const requestLinks = wrapper
      .findAll(".nav-group")
      .find((group) => group.text().includes("Current request"))
      ?.findAll(".app-nav-link");
    const brief = requestLinks?.find((item) => item.text().includes("Brief"));
    const businesses = requestLinks?.find((item) =>
      item.text().includes("Businesses"),
    );
    const calls = requestLinks?.find((item) => item.text().includes("Calls"));
    const report = requestLinks?.find((item) => item.text().includes("Report"));

    expect(brief?.attributes("aria-disabled")).toBeUndefined();
    expect(businesses?.attributes("aria-disabled")).toBe("true");
    expect(calls?.attributes("aria-disabled")).toBe("true");
    expect(report?.attributes("aria-disabled")).toBe("true");
    expect(businesses?.attributes("title")).toBe(
      "Review brief is the next step.",
    );
    wrapper.unmount();
  });

  it("clears request and profile state when the authenticated owner changes", async () => {
    window.localStorage.setItem("relay-account-owner", "user-before");
    const wrapper = mountShell();
    await flushPromises();

    expect(clearCurrent).toHaveBeenCalledOnce();
    expect(account.resetAccountIdentity).toHaveBeenCalledOnce();
    expect(api.getProfile).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("relay-account-owner")).toBe("user-a");
    wrapper.unmount();
  });
});
