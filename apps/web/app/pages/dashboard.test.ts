import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "./dashboard.vue";

const jobs = [
  {
    bestOfferCents: null,
    movingDate: "2026-08-15",
    nextAction: "review_and_confirm",
    publicId: "RLY-BD2E9FEE",
    route: { destination: "Charlotte, NC", pickup: "Rock Hill, SC" },
    savingsCents: null,
    stage: "draft",
    status: "draft",
    title: "Charlotte move",
    updatedAt: "2026-07-19T18:05:42.123Z",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard request context", () => {
  it("replaces the removed demo fallback with the newest owned request", async () => {
    const setCurrent = vi.fn();
    const clearCurrent = vi.fn();
    vi.stubGlobal("useSeoMeta", vi.fn());
    vi.stubGlobal("useRelayApi", () => ({
      getJobs: vi.fn().mockResolvedValue({ items: jobs }),
    }));
    vi.stubGlobal("useRequestContext", () => ({
      currentRequest: ref({ publicId: "RLY-2048" }),
      setCurrent,
    }));
    vi.stubGlobal("useCurrentRequest", () => ({ clearCurrent }));

    const wrapper = mount(DashboardPage, {
      global: {
        stubs: {
          ApiFeedback: true,
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: {
            props: ["to"],
            template:
              "<a :href=\"typeof to === 'string' ? to : to.path\"><slot /></a>",
          },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(setCurrent).toHaveBeenCalledWith("RLY-BD2E9FEE");
    expect(clearCurrent).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Charlotte move");
  });

  it("routes an ended run back through business approval", async () => {
    const restartJob = {
      ...jobs[0],
      nextAction: "start_over",
      publicId: "RLY-RESTART",
      stage: "failed",
      status: "failed",
    };
    vi.stubGlobal("useSeoMeta", vi.fn());
    vi.stubGlobal("useRelayApi", () => ({
      getJobs: vi.fn().mockResolvedValue({ items: [restartJob] }),
    }));
    vi.stubGlobal("useRequestContext", () => ({
      currentRequest: ref({ publicId: restartJob.publicId }),
      setCurrent: vi.fn(),
    }));
    vi.stubGlobal("useCurrentRequest", () => ({ clearCurrent: vi.fn() }));

    const wrapper = mount(DashboardPage, {
      global: {
        stubs: {
          ApiFeedback: true,
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: {
            props: ["to"],
            template:
              "<a :href=\"typeof to === 'string' ? to : to.path\"><slot /></a>",
          },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    const openLink = wrapper.get(".request-card__open");
    expect(openLink.attributes("href")).toBe(
      "/requests/RLY-RESTART/businesses",
    );
    expect(wrapper.text()).toContain(
      "The previous run ended. Review the businesses before starting again.",
    );
  });
});
