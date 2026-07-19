import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BusinessesPage from "./requests/RLY-2048/businesses.vue";

vi.mock("../composables/useAccountIdentity", () => ({
  useAccountIdentity: () => ({ representedAs: { value: "Afnan" } }),
}));

const api = {
  discoverBusinesses: vi.fn(),
  getCandidates: vi.fn(),
  startRun: vi.fn(),
};

const candidate = {
  distanceMiles: 4.2,
  id: "business-1",
  location: "Charlotte, NC",
  name: "Pine & Co. Moving",
  phone: "+17045550100",
  rating: 4.8,
  reviewCount: 214,
  selected: true,
  source: "google-places",
  status: "discovered",
};
let timerCallbacks: Array<{ delay?: number; handler: () => void }> = [];

beforeEach(() => {
  timerCallbacks = [];
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(window, "setTimeout").mockImplementation((handler, delay) => {
    timerCallbacks.push({ delay, handler: () => handler() });
    return {} as ReturnType<typeof window.setTimeout>;
  });
  vi.spyOn(window, "clearTimeout").mockImplementation(() => undefined);
  api.getCandidates
    .mockResolvedValueOnce({ items: [], status: "ready" })
    .mockResolvedValueOnce({ items: [candidate], status: "ready" });
  api.discoverBusinesses.mockResolvedValue({
    items: [],
    mode: "live",
    status: "discovering",
  });
  vi.stubGlobal("useSeoMeta", vi.fn());
  vi.stubGlobal("useRelayApi", () => api);
  vi.stubGlobal("useRequestContext", () => ({
    publicId: ref("RLY-3001"),
    setCurrent: vi.fn(),
  }));
  vi.stubGlobal("useRouter", () => ({ push: vi.fn() }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("business discovery polling", () => {
  it("polls an active discovery and stops after candidates arrive", async () => {
    const wrapper = mount(BusinessesPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(api.discoverBusinesses).toHaveBeenCalledWith("RLY-3001");
    expect(wrapper.text()).toContain("Finding matched businesses");

    expect(timerCallbacks.length).toBeGreaterThan(0);
    const timerCount = timerCallbacks.length;
    const discoveryTimer = timerCallbacks.find(
      (timer) => timer.delay === 2_500,
    );
    expect(discoveryTimer).toBeDefined();
    discoveryTimer?.handler();
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(api.getCandidates).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("Pine & Co. Moving");

    expect(timerCallbacks).toHaveLength(timerCount);
    expect(api.getCandidates).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("keeps polling when partial candidates arrive before discovery is ready", async () => {
    api.getCandidates.mockReset();
    api.getCandidates
      .mockResolvedValueOnce({ items: [], mode: "live", status: "ready" })
      .mockResolvedValueOnce({
        items: [candidate],
        mode: "live",
        status: "discovering",
      })
      .mockResolvedValueOnce({
        items: [
          candidate,
          { ...candidate, id: "business-2", name: "Two Movers" },
        ],
        mode: "live",
        status: "ready",
      });

    const wrapper = mount(BusinessesPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    const firstPoll = timerCallbacks.find((timer) => timer.delay === 2_500);
    expect(firstPoll).toBeDefined();
    const initialTimerCount = timerCallbacks.length;
    firstPoll?.handler();
    await flushPromises();

    expect(wrapper.text()).toContain("Pine & Co. Moving");
    expect(timerCallbacks.length).toBeGreaterThan(initialTimerCount);
    expect(wrapper.text()).toContain("Still searching for callable businesses");
    expect(wrapper.text()).toContain("Review brief");

    timerCallbacks.at(-1)?.handler();
    await flushPromises();

    expect(wrapper.text()).toContain("More callable businesses are needed");
    expect(wrapper.text()).toContain("Discover again");
    expect(wrapper.text()).toContain("1 more callable business required");
    wrapper.unmount();
  });

  it("labels fixture provenance and disables candidates without a callable phone", async () => {
    api.getCandidates.mockReset();
    api.getCandidates.mockResolvedValueOnce({
      items: [{ ...candidate, phone: null, selected: true }],
      mode: "fixture",
      status: "ready",
    });

    const wrapper = mount(BusinessesPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Demonstration listings");
    expect(wrapper.text()).toContain("not live provider results");
    expect(wrapper.text()).toContain("0 selected");
    expect(
      wrapper.get<HTMLInputElement>(".business-check input").element.disabled,
    ).toBe(true);
    wrapper.unmount();
  });
});
