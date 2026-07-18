import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import WorkspacePage from "./workspace.vue";

const globalComponents = {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workspace page", () => {
  it("supports call review, pausing, quote selection, and saving a decision", async () => {
    vi.stubGlobal("useSeoMeta", vi.fn());

    const wrapper = mount(WorkspacePage, {
      global: {
        stubs: globalComponents,
      },
    });

    const callButtons = wrapper.findAll(".call-row");
    expect(callButtons).toHaveLength(3);

    await callButtons[1]?.trigger("click");
    expect(wrapper.get(".call-detail h3").text()).toBe("Carolina Transit");
    expect(wrapper.get(".transcript__heading").text()).toContain("Live");

    await wrapper.get(".session-heading__actions button").trigger("click");
    expect(wrapper.get(".transcript__heading").text()).toContain("Call paused");
    expect(wrapper.get(".stage-card__topline").text()).toContain(
      "Calls paused",
    );

    const quoteButtons = wrapper.findAll(".review-button");
    await quoteButtons[1]?.trigger("click");
    expect(wrapper.get(".reviewing-note").text()).toContain("Carolina Transit");

    const decisionButton = wrapper.get(".recommendation-card__action");
    await decisionButton.trigger("click");
    expect(decisionButton.text()).toContain("Decision saved");
  });
});
