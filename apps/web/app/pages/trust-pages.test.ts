import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PrivacyPage from "./privacy.vue";
import SupportPage from "./support.vue";
import TermsPage from "./terms.vue";

const globalComponents = {
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot /></a>',
  },
  RelayLogo: {
    template: '<span aria-label="Relay">Relay</span>',
  },
};

beforeEach(() => {
  vi.stubGlobal("useSeoMeta", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public trust pages", () => {
  it("explains data use, providers, consent, retention, and deletion limits", () => {
    const wrapper = mount(PrivacyPage, {
      global: { stubs: globalComponents },
    });

    expect(wrapper.text()).toContain("Privacy, in plain language.");
    expect(wrapper.text()).toContain("Clerk for authentication");
    expect(wrapper.text()).toContain("applicable customer consent");
    expect(wrapper.text()).toContain(
      "A verified self-service deletion workflow",
    );
    expect(wrapper.get('a[href="/support"]')).toBeDefined();
  });

  it("states the free product and negotiation boundaries without guarantees", () => {
    const wrapper = mount(TermsPage, {
      global: { stubs: globalComponents },
    });

    expect(wrapper.text()).toContain("free access only");
    expect(wrapper.text()).toContain("must not invent bids");
    expect(wrapper.text()).toContain("does not guarantee a quote");
    expect(wrapper.get('a[href="/privacy"]')).toBeDefined();
  });

  it("gives safe recovery guidance without inventing a support address", () => {
    const wrapper = mount(SupportPage, {
      global: { stubs: globalComponents },
    });

    expect(wrapper.text()).toContain(
      "has not published a verified support inbox",
    );
    expect(wrapper.text()).toContain("Do not share your password");
    expect(wrapper.text()).not.toContain("support@zerotools.online");
    expect(wrapper.get('a[href="/dashboard"]')).toBeDefined();
  });
});
