import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import ReviewPage from "../components/requests/RequestReviewPage.vue";

vi.mock("../composables/useRequestWorkflow", () => ({
  useRequestWorkflow: () => ({ setJob: vi.fn() }),
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("brief recovery", () => {
  it("opens an incomplete durable draft for completion instead of dereferencing missing fields", async () => {
    const setCurrent = vi.fn();
    vi.stubGlobal("useSeoMeta", vi.fn());
    vi.stubGlobal("useRelayApi", () => ({
      confirmJob: vi.fn(),
      getJob: vi.fn().mockResolvedValue({
        candidateCount: 0,
        confirmedVersion: null,
        consent: { calling: false, recording: false },
        draft: { vertical: "moving" },
        latestRunId: null,
        movingDate: null,
        nextAction: "review_and_confirm",
        publicId: "RLY-INCOMPLETE",
        route: { destination: "", pickup: "" },
        stage: "draft",
        status: "draft",
        title: "Saved moving draft",
        updatedAt: "2026-07-20T10:00:00.000Z",
      }),
      updateJobDraft: vi.fn(),
    }));
    vi.stubGlobal("useRequestContext", () => ({
      publicId: ref("RLY-INCOMPLETE"),
      setCurrent,
    }));

    const wrapper = mount(ReviewPage, {
      global: {
        stubs: {
          AppShell: { template: "<div><slot /></div>" },
          NuxtLink: { props: ["to"], template: "<a><slot /></a>" },
          StatusBadge: { template: "<span><slot /></span>" },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get(".draft-recovery").text()).toContain(
      "Complete this saved draft",
    );
    expect(wrapper.get(".text-button").text()).toBe("Save changes");
    expect(wrapper.text()).toContain("0 normalized items");
    expect(wrapper.text()).toContain("Needs completion");
    expect(
      wrapper.get(".confirmation-card .button").attributes("disabled"),
    ).toBeDefined();
    expect(setCurrent).toHaveBeenCalledWith("RLY-INCOMPLETE", undefined);
  });
});
