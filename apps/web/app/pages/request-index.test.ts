import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RequestIndexPage from "./requests/[id]/index.vue";

const api = vi.hoisted(() => ({ getJob: vi.fn() }));
const setCurrent = vi.hoisted(() => vi.fn());
const navigateTo = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const TestRelayApiError = vi.hoisted(
  () =>
    class extends Error {
      readonly statusCode?: number;

      constructor(message: string, statusCode?: number) {
        super(message);
        this.statusCode = statusCode;
      }
    },
);

vi.mock("../composables/useRelayApi", () => ({
  RelayApiError: TestRelayApiError,
  useRelayApi: () => api,
}));

const job = {
  candidateCount: 0,
  confirmedVersion: null,
  consent: { calling: false, recording: false },
  draft: {},
  latestRunId: null,
  nextAction: "review_and_confirm",
  publicId: "RLY-ABC123",
  stage: "draft",
  status: "draft",
  title: "Moving request",
  route: { destination: "Austin", pickup: "Dallas" },
  movingDate: null,
  bestOfferCents: null,
  savingsCents: null,
  updatedAt: "2026-07-19T00:00:00.000Z",
};

beforeEach(() => {
  api.getJob.mockResolvedValue(job);
  vi.stubGlobal("useSeoMeta", vi.fn());
  vi.stubGlobal("useRoute", () => ({
    params: { id: "RLY-ABC123" },
  }));
  vi.stubGlobal("useCurrentRequest", () => ({ setCurrent }));
  vi.stubGlobal("navigateTo", navigateTo);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("request root", () => {
  it("resolves an owned request to its next actionable page", async () => {
    mount(RequestIndexPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
        },
      },
    });
    await flushPromises();

    expect(setCurrent).toHaveBeenCalledWith("RLY-ABC123", undefined);
    expect(navigateTo).toHaveBeenCalledWith("/requests/RLY-ABC123/review", {
      replace: true,
    });
  });

  it("gives a stable recovery path for an unknown request", async () => {
    api.getJob.mockRejectedValueOnce(
      new TestRelayApiError("Job was not found.", 404),
    );
    const wrapper = mount(RequestIndexPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { template: "<a><slot /></a>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Request not found");
    expect(wrapper.text()).toContain("View your requests");
    expect(wrapper.text()).toContain("Start a new request");
  });
});
