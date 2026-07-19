import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReportPage from "../components/requests/RequestReportPage.vue";

const api = vi.hoisted(() => ({
  getJob: vi.fn(),
  getReport: vi.fn(),
  getRun: vi.fn(),
  saveDecision: vi.fn(),
}));

vi.mock("../composables/useRelayApi", () => ({
  useRelayApi: () => api,
}));

vi.mock("../composables/useRequestContext", () => ({
  useRequestContext: () => ({
    publicId: ref("RLY-2048"),
    runId: ref<string>(),
    setCurrent: vi.fn(),
  }),
}));

const rankedOffers = [
  {
    businessId: "pine",
    businessName: "Pine Moving",
    confidence: 0.94,
    evidenceCount: 4,
    id: "quote-pine",
    inclusions: [],
    originalTotalCents: 220_000,
    rank: 1,
    rationale: "Lowest supported total with complete terms.",
    rating: 4.8,
    reviewCount: 210,
    riskFlags: [],
    score: 94,
    status: "complete",
    totalCents: 184_000,
  },
  {
    businessId: "carolina",
    businessName: "Carolina Transit",
    confidence: 0.9,
    evidenceCount: 2,
    id: "quote-carolina",
    inclusions: ["Labor"],
    originalTotalCents: 210_000,
    rank: 2,
    rationale: "Competitive total with a deposit term to review.",
    rating: 4.6,
    reviewCount: 170,
    riskFlags: ["deposit_unconfirmed"],
    score: 90,
    status: "complete",
    totalCents: 170_000,
  },
];

const reportResponse = {
  decision: null,
  metrics: {
    callsHandled: 3,
    completedQuotes: 2,
    timeAvoidedMinutes: 40,
    verifiedSavingsCents: 36_000,
  },
  mode: "live",
  rankedOffers,
  recommendation: {
    businessName: "Pine Moving",
    confidence: 0.94,
    quoteId: "quote-pine",
    rationale: "Lowest supported total with complete terms.",
    savingsCents: 36_000,
    totalCents: 184_000,
  },
  runId: "run-1",
};

beforeEach(() => {
  vi.stubGlobal("useSeoMeta", vi.fn());
  api.getJob.mockResolvedValue({
    latestRunId: "run-1",
    publicId: "RLY-2048",
  });
  api.getRun.mockResolvedValue({
    id: "run-1",
    jobPublicId: "RLY-2048",
  });
  api.getReport.mockResolvedValue(reportResponse);
  api.saveDecision.mockResolvedValue({
    quoteId: "quote-carolina",
    saved: true,
    savedAt: "2026-07-20T10:00:00.000Z",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("final report", () => {
  it("saves the offer selected by the user and resets saved labeling on a new selection", async () => {
    const wrapper = mount(ReportPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    const offerButtons = wrapper.findAll(".review-button");
    await offerButtons[1]?.trigger("click");
    const saveButton = wrapper.get(".recommendation-actions button");
    expect(saveButton.text()).toContain("Save Carolina Transit");
    expect(wrapper.get(".selected-offer-review > p").text()).toContain(
      "$140 below Relay's recommendation",
    );

    await saveButton.trigger("click");
    await flushPromises();

    expect(api.saveDecision).toHaveBeenCalledWith("run-1", "quote-carolina");
    expect(saveButton.text()).toContain("Decision saved");

    await offerButtons[0]?.trigger("click");
    expect(saveButton.text()).toContain("Save Pine Moving");
    expect(saveButton.text()).not.toContain("Decision saved");
  });

  it("renders only report-backed inclusions, evidence counts, and risk flags", async () => {
    const wrapper = mount(ReportPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Scope/itemization not supplied");
    expect(wrapper.text()).toContain("$140 higher than the next-ranked offer");
    expect(wrapper.text()).toContain("deposit unconfirmed");
    expect(wrapper.text()).toContain("Pine Moving");
    expect(wrapper.text()).toContain("4 verified evidence points");
    expect(wrapper.text()).not.toContain("Transcript · 12:42");
    expect(wrapper.text()).not.toContain("30% below");
  });

  it("labels fixture reports and evidence as demonstration data", async () => {
    api.getReport.mockResolvedValueOnce({ ...reportResponse, mode: "fixture" });
    const wrapper = mount(ReportPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Demonstration report");
    expect(wrapper.text()).toContain("6 evidence points");
    expect(wrapper.text()).not.toContain("verified evidence points");
    expect(wrapper.text()).toContain("leads this sample comparison");
  });

  it("states when the API returns no risk flags without inventing a policy result", async () => {
    api.getReport.mockResolvedValueOnce({
      ...reportResponse,
      rankedOffers: rankedOffers.map((offer) => ({
        ...offer,
        riskFlags: [],
      })),
    });
    const wrapper = mount(ReportPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "No risk flags were returned for these offers.",
    );
    expect(wrapper.text()).not.toContain("market baseline");
  });
});
