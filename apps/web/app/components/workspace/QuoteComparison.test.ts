import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import { quotes } from "../../data/demo";
import QuoteComparison from "./QuoteComparison.vue";

describe("QuoteComparison", () => {
  it("renders the evidence-backed recommendation and emits quote selection", async () => {
    const wrapper = mount(QuoteComparison, {
      props: {
        quotes,
        selectedId: "pine",
      },
    });

    expect(wrapper.text()).toContain("Pine & Co. Moving");
    expect(wrapper.text()).toContain("Recommended");
    expect(wrapper.text()).toContain("$1,840");

    const reviewButtons = wrapper.findAll("button");
    await reviewButtons[1]?.trigger("click");

    expect(wrapper.emitted("select")?.[0]).toEqual(["carolina"]);
  });
});
