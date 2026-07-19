import { flushPromises, mount } from "@vue/test-utils";
import { h, nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import RequestStageGate from "./RequestStageGate.vue";

const loadJob = vi.hoisted(() => vi.fn());

vi.mock("../../composables/useRequestWorkflow", () => ({
  useRequestWorkflow: () => ({ loadJob }),
}));

const route = reactive({
  params: { id: "RLY-A" },
  query: { run: undefined as string | undefined },
});
const replace = vi.fn().mockResolvedValue(undefined);
const setCurrent = vi.fn();

function job(publicId: string, nextAction = "review_and_confirm") {
  return {
    latestRunId: null,
    nextAction,
    publicId,
  };
}

beforeEach(() => {
  route.params.id = "RLY-A";
  route.query.run = undefined;
  vi.stubGlobal("useRoute", () => route);
  vi.stubGlobal("useRouter", () => ({ replace }));
  vi.stubGlobal("useCurrentRequest", () => ({ setCurrent }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("request stage gate", () => {
  it("ignores stale responses and remounts content for a changed request id", async () => {
    let resolveFirst: (value: ReturnType<typeof job>) => void = () => undefined;
    let resolveSecond: (value: ReturnType<typeof job>) => void = () =>
      undefined;
    loadJob.mockImplementation(
      (publicId: string) =>
        new Promise<ReturnType<typeof job>>((resolve) => {
          if (publicId === "RLY-A") resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );

    const wrapper = mount(RequestStageGate, {
      props: { stage: "review" },
      slots: {
        default: ({ requestKey }: { requestKey: string }) =>
          h("div", { class: "request-content" }, requestKey),
      },
    });

    route.params.id = "RLY-B";
    await nextTick();
    resolveSecond(job("RLY-B"));
    await flushPromises();

    expect(wrapper.get(".request-content").text()).toBe("review:RLY-B:");
    expect(setCurrent).toHaveBeenCalledTimes(1);
    expect(setCurrent).toHaveBeenCalledWith("RLY-B", undefined);

    resolveFirst(job("RLY-A"));
    await flushPromises();
    expect(wrapper.get(".request-content").text()).toBe("review:RLY-B:");
    expect(setCurrent).toHaveBeenCalledTimes(1);
  });

  it("redirects a premature deep link and exposes a direct recovery action", async () => {
    loadJob.mockResolvedValue(job("RLY-A"));
    replace.mockImplementationOnce(() => new Promise(() => undefined));
    const wrapper = mount(RequestStageGate, {
      props: { stage: "report" },
      global: {
        stubs: {
          NuxtLink: {
            props: ["to"],
            template: '<a :href="to"><slot /></a>',
          },
        },
      },
    });
    await flushPromises();

    expect(replace).toHaveBeenCalledWith("/requests/RLY-A/review");
    expect(wrapper.text()).toContain("This step is not available yet");
    expect(wrapper.text()).toContain("Review brief");
    expect(wrapper.get("a").attributes("href")).toBe("/requests/RLY-A/review");
  });
});
