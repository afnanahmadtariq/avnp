import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WorkspacePage from "../components/requests/RequestWorkspacePage.vue";

const api = vi.hoisted(() => ({
  getEvidenceAccess: vi.fn(),
  getEvents: vi.fn(),
  getJob: vi.fn(),
  getRun: vi.fn(),
  saveDecision: vi.fn(),
  updateRun: vi.fn(),
}));

vi.mock("../composables/useRequestContext", () => ({
  useRequestContext: () => ({
    publicId: { value: "RLY-2048" },
    runId: { value: undefined },
    setCurrent: vi.fn(),
  }),
}));

vi.mock("../composables/useRelayApi", () => ({
  useRelayApi: () => api,
}));

const job = {
  bestOfferCents: 184_000,
  candidateCount: 3,
  confirmedVersion: {
    confirmedAt: "2026-07-19T10:00:00.000Z",
    digest: "fixture",
    id: "version-1",
    version: 1,
  },
  consent: { calling: true, recording: true },
  draft: {
    bedrooms: 2,
    dropoffAddress: { formattedAddress: "Charlotte, NC" },
    dropoffStairs: 0,
    hasElevator: true,
    inventory: [{ name: "boxes", quantity: 20 }],
    movingDate: "2026-08-15",
    packingPreference: "partial",
    pickupAddress: { formattedAddress: "Rock Hill, SC" },
    pickupStairs: 1,
    vertical: "moving",
  },
  latestRunId: "run-1",
  movingDate: "2026-08-15",
  nextAction: "follow_run",
  publicId: "RLY-2048",
  route: { destination: "Charlotte, NC", pickup: "Rock Hill, SC" },
  savingsCents: 37_000,
  stage: "calling",
  status: "negotiating",
  title: "Charlotte apartment move",
  updatedAt: "2026-07-19T10:00:00.000Z",
};

const run = {
  calls: [
    {
      businessId: "pine",
      businessName: "Pine & Co. Moving",
      currentOfferCents: 184_000,
      evidence: ["Transcript evidence"],
      evidenceItems: [
        {
          available: true,
          contentType: "text/plain",
          id: "evidence-pine",
          kind: "transcript",
          label: "Transcript evidence",
        },
      ],
      id: "call-pine",
      initialOfferCents: 221_000,
      outcome: "quote_received",
      progress: 100,
      status: "completed",
      transcript: "Sara: Confirming the same scope.",
    },
    {
      businessId: "carolina",
      businessName: "Carolina Transit",
      currentOfferCents: 192_000,
      evidence: ["Live transcript"],
      id: "call-carolina",
      initialOfferCents: 209_000,
      outcome: null,
      progress: 64,
      status: "negotiating",
      transcript: "Business: Let me review the total.",
    },
    {
      businessId: "atlas",
      businessName: "Atlas Moving Group",
      evidence: [],
      id: "call-atlas",
      outcome: null,
      progress: 10,
      status: "queued",
      transcript: "",
    },
  ],
  decision: null,
  id: "run-1",
  jobPublicId: "RLY-2048",
  metrics: {
    callsHandled: 3,
    completedQuotes: 2,
    timeAvoidedMinutes: 45,
    verifiedSavingsCents: 37_000,
  },
  mode: "live" as const,
  paused: false,
  quotes: [
    {
      businessId: "pine",
      businessName: "Pine & Co. Moving",
      confidence: 0.94,
      evidenceCount: 4,
      id: "quote-pine",
      inclusions: ["Labor", "Transport"],
      originalTotalCents: 221_000,
      rating: 4.8,
      reviewCount: 214,
      riskFlags: [],
      score: 94,
      status: "complete",
      totalCents: 184_000,
    },
    {
      businessId: "carolina",
      businessName: "Carolina Transit",
      confidence: 0.9,
      evidenceCount: 3,
      id: "quote-carolina",
      inclusions: ["Labor", "Transport"],
      originalTotalCents: 209_000,
      rating: 4.6,
      reviewCount: 168,
      riskFlags: [],
      score: 90,
      status: "complete",
      totalCents: 192_000,
    },
  ],
  stage: "calling",
  status: "calling",
  updatedAt: "2026-07-19T10:12:00.000Z",
};

const globalComponents = {
  AppShell: {
    template: "<div><slot /></div>",
  },
  NuxtLink: {
    props: ["to"],
    template: "<a><slot /></a>",
  },
  RelayLogo: {
    template: "<span>Relay</span>",
  },
  StatusBadge: {
    template: "<span><slot /></span>",
  },
};

beforeEach(() => {
  vi.stubGlobal("useSeoMeta", vi.fn());
  api.getJob.mockResolvedValue(job);
  api.getRun.mockResolvedValue(run);
  api.getEvents.mockResolvedValue({ items: [], sequence: 0 });
  api.getEvidenceAccess.mockResolvedValue({
    contentType: "text/plain",
    evidenceId: "evidence-pine",
    expiresAt: "2026-07-19T10:05:00.000Z",
    url: "https://storage.example/signed/transcript",
  });
  api.saveDecision.mockResolvedValue({
    quoteId: "quote-pine",
    saved: true,
    savedAt: "2026-07-19T10:13:00.000Z",
  });
  api.updateRun.mockResolvedValue({ ...run, paused: true, status: "paused" });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace page", () => {
  it("supports call review, pausing, and quote selection while a run is active", async () => {
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const callButtons = wrapper.findAll(".call-row");
    expect(callButtons).toHaveLength(3);
    expect(wrapper.get(".selected-quote").text()).toContain(
      "4.8 · 214 reviews",
    );
    expect(wrapper.get(".selected-quote").text()).toContain(
      "4 verified evidence points",
    );
    expect(wrapper.get(".transcript li strong").text()).toBe("Sara");
    expect(wrapper.get(".transcript li p").text()).toBe(
      "Confirming the same scope.",
    );

    await callButtons[1]?.trigger("click");
    expect(wrapper.get(".call-detail h3").text()).toBe("Carolina Transit");
    expect(wrapper.get(".transcript__heading").text()).toContain("Live");

    await wrapper.get(".session-heading__actions button").trigger("click");
    await flushPromises();
    expect(api.updateRun).toHaveBeenCalledWith("run-1", "pause");
    expect(wrapper.get(".transcript__heading").text()).toContain("Call paused");

    const quoteButtons = wrapper.findAll(".review-button");
    await quoteButtons[1]?.trigger("click");
    expect(wrapper.get(".reviewing-note").text()).toContain("Carolina Transit");

    const decisionButton = wrapper.get(".recommendation-card__action");
    await decisionButton.trigger("click");
    await flushPromises();
    expect(decisionButton.attributes("disabled")).toBeDefined();
    expect(api.saveDecision).not.toHaveBeenCalled();
  });

  it("persists a decision after the run finishes", async () => {
    api.getRun.mockResolvedValueOnce({
      ...run,
      stage: "completed",
      status: "completed",
    });
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const decisionButton = wrapper.get(".recommendation-card__action");
    await decisionButton.trigger("click");
    await flushPromises();

    expect(api.saveDecision).toHaveBeenCalledWith("run-1", "quote-pine");
    expect(decisionButton.text()).toContain("Decision saved");
  });

  it("opens real evidence through the authenticated access endpoint", async () => {
    const replace = vi.fn();
    const close = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({
      close,
      location: { replace },
      opener: null,
    } as never);
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    await wrapper.get(".evidence-drawer__open").trigger("click");
    await flushPromises();

    expect(api.getEvidenceAccess).toHaveBeenCalledWith("evidence-pine");
    expect(replace).toHaveBeenCalledWith(
      "https://storage.example/signed/transcript",
    );
    expect(close).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it("does not show a saved decision when persistence fails", async () => {
    api.getRun.mockResolvedValueOnce({
      ...run,
      stage: "completed",
      status: "completed",
    });
    api.saveDecision.mockRejectedValueOnce(new Error("Save failed"));
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const decisionButton = wrapper.get(".recommendation-card__action");
    await decisionButton.trigger("click");
    await flushPromises();

    expect(decisionButton.text()).not.toContain("Decision saved");
    expect(wrapper.text()).toContain("Save failed");
  });

  it("shows saved non-quote outcomes without inventing a zero-dollar offer or transcript", async () => {
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const queuedCall = wrapper.findAll(".call-row")[2];
    expect(queuedCall?.find(".call-row__offer").text()).toContain("No quote");
    expect(queuedCall?.find(".call-row__offer").text()).not.toContain("$0");

    await queuedCall?.trigger("click");
    expect(wrapper.get(".transcript__empty").text()).toContain(
      "No transcript text has been saved",
    );
    expect(wrapper.find(".transcript li").exists()).toBe(false);
  });

  it("rolls the pause control back when the server rejects the change", async () => {
    api.updateRun.mockRejectedValueOnce(new Error("Pause failed"));
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const pauseButton = wrapper.get(".session-heading__actions button");
    await pauseButton.trigger("click");
    await flushPromises();

    expect(pauseButton.text()).toContain("Pause calls");
    expect(wrapper.text()).toContain("Pause failed");
  });

  it("requires confirmation before cancelling an active run", async () => {
    api.updateRun.mockResolvedValueOnce({
      ...run,
      paused: false,
      status: "cancelled",
    });
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const cancelButton = wrapper.get(".session-cancel");
    await cancelButton.trigger("click");
    expect(api.updateRun).not.toHaveBeenCalled();
    expect(cancelButton.text()).toContain("Confirm cancel");

    await cancelButton.trigger("click");
    await flushPromises();

    expect(api.updateRun).toHaveBeenCalledWith("run-1", "cancel");
    expect(wrapper.text()).toContain("Run cancelled");
  });

  it("rejects a run that belongs to another request", async () => {
    api.getRun.mockResolvedValueOnce({ ...run, jobPublicId: "RLY-OTHER" });
    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    expect(wrapper.text()).toContain(
      "This negotiation run belongs to a different request.",
    );
  });

  it("polls a live run and stops when the run becomes terminal", async () => {
    const timers: Array<{ delay?: number; handler: () => void }> = [];
    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const timeoutSpy = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((handler, delay) => {
        timers.push({ delay, handler: () => handler() });
        return {} as ReturnType<typeof window.setTimeout>;
      });
    const clearTimeoutSpy = vi
      .spyOn(window, "clearTimeout")
      .mockImplementation(() => undefined);
    api.getRun
      .mockResolvedValueOnce(run)
      .mockResolvedValueOnce({ ...run, status: "completed" });

    try {
      const wrapper = mount(WorkspacePage, {
        global: { stubs: globalComponents },
      });
      await flushPromises();

      const refreshTimer = timers.find((timer) => timer.delay === 4_000);
      expect(refreshTimer).toBeDefined();
      const timerCount = timers.length;
      refreshTimer?.handler();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      await wrapper.vm.$nextTick();

      expect(api.getRun).toHaveBeenCalledTimes(2);
      expect(timers).toHaveLength(timerCount);
      expect(wrapper.text()).toContain("View final report");
      wrapper.unmount();
    } finally {
      visibilitySpy.mockRestore();
      timeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });

  it("does not let a stale poll overwrite a newer pause result", async () => {
    const timers: Array<{ delay?: number; handler: () => void }> = [];
    let resolvePoll: ((value: typeof run) => void) | undefined;
    const pollResponse = new Promise<typeof run>((resolve) => {
      resolvePoll = resolve;
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(window, "setTimeout").mockImplementation((handler, delay) => {
      timers.push({ delay, handler: () => handler() });
      return {} as ReturnType<typeof window.setTimeout>;
    });
    vi.spyOn(window, "clearTimeout").mockImplementation(() => undefined);
    api.getRun
      .mockResolvedValueOnce(run)
      .mockImplementationOnce(() => pollResponse);
    api.updateRun.mockResolvedValueOnce({
      ...run,
      paused: true,
      status: "paused",
    });

    const wrapper = mount(WorkspacePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    timers.find((timer) => timer.delay === 4_000)?.handler();
    await Promise.resolve();
    await wrapper.get(".session-heading__actions button").trigger("click");
    await flushPromises();
    resolvePoll?.(run);
    await flushPromises();

    expect(wrapper.get(".session-heading__actions button").text()).toContain(
      "Resume calls",
    );
    wrapper.unmount();
  });
});
