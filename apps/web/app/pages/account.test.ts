import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "./profile.vue";
import SettingsPage from "./settings.vue";

const api = vi.hoisted(() => ({
  exportAccount: vi.fn(),
  getProfile: vi.fn(),
  getSettings: vi.fn(),
  updateProfile: vi.fn(),
  updateSettings: vi.fn(),
}));
const accountIdentity = vi.hoisted(() => ({
  syncAccountIdentity: vi.fn(),
}));
const currentRoute = vi.hoisted(() => ({
  hash: "",
  query: {} as Record<string, string>,
}));

vi.mock("../composables/useRelayApi", () => ({
  useRelayApi: () => api,
}));

vi.mock("../composables/useAccountIdentity", () => ({
  useAccountIdentity: () => accountIdentity,
}));

vi.mock("vue-router", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return { ...original, onBeforeRouteLeave: vi.fn() };
});

const globalComponents = {
  AppShell: {
    template: "<div><slot /></div>",
  },
  NuxtLink: {
    props: ["to"],
    template: "<a><slot /></a>",
  },
  StatusBadge: {
    template: "<span><slot /></span>",
  },
};

const profile = {
  displayName: "Relay Demo",
  email: "demo@relay.local",
  id: "demo-user",
  location: "Charlotte, NC",
  phone: "+17045550100",
  representedAs: "Relay Demo",
  timezone: "America/New_York",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

const settings = {
  aiDisclosure: true as const,
  callbackAlerts: true,
  callMilestones: true,
  emailUpdates: true,
  evidenceRetentionDays: 30 as const,
  recordingConsentDefault: false,
  updatedAt: "2026-07-19T00:00:00.000Z",
};

beforeEach(() => {
  currentRoute.hash = "";
  currentRoute.query = {};
  vi.stubGlobal("useSeoMeta", vi.fn());
  vi.stubGlobal("useRoute", () => currentRoute);
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { authProvider: "clerk" },
  }));
  api.getProfile.mockResolvedValue(profile);
  api.getSettings.mockResolvedValue(settings);
  api.updateProfile.mockImplementation(async (value) => ({
    ...profile,
    ...value,
  }));
  api.updateSettings.mockImplementation(async (value) => value);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("account pages", () => {
  it("loads and saves the server-backed profile", async () => {
    const wrapper = mount(ProfilePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    expect(wrapper.get(".profile-identity h2").text()).toBe("Relay Demo");
    expect(accountIdentity.syncAccountIdentity).toHaveBeenCalledWith(profile);
    expect(
      wrapper.get('input[autocomplete="email"]').attributes("readonly"),
    ).toBeDefined();
    expect(wrapper.text()).toContain("Manage sign-in details");
    expect(wrapper.text()).toContain("Free plan");
    expect(wrapper.text()).toContain(
      "Manage profile photo and sign-in details",
    );
    expect(wrapper.text()).not.toContain("automated assistant calling");
    expect(
      wrapper.get<HTMLButtonElement>('button[form="profile-form"]').element
        .disabled,
    ).toBe(true);

    await wrapper
      .get<HTMLInputElement>('input[autocomplete="name"]')
      .setValue("Relay Customer");
    expect(
      wrapper.get<HTMLButtonElement>('button[form="profile-form"]').element
        .disabled,
    ).toBe(false);
    await wrapper.get("#profile-form").trigger("submit");
    await flushPromises();

    expect(api.updateProfile).toHaveBeenCalledWith({
      displayName: "Relay Customer",
      location: profile.location,
      phone: profile.phone,
      representedAs: profile.representedAs,
      timezone: profile.timezone,
    });
    expect(accountIdentity.syncAccountIdentity).toHaveBeenLastCalledWith({
      ...profile,
      displayName: "Relay Customer",
    });
    expect(wrapper.text()).toContain("Profile saved to Relay.");
  });

  it("loads and saves a profile without a customer contact phone", async () => {
    const profileWithoutPhone = { ...profile, phone: null };
    api.getProfile.mockResolvedValueOnce(profileWithoutPhone);
    api.updateProfile.mockImplementationOnce(async (value) => ({
      ...profileWithoutPhone,
      ...value,
    }));
    const wrapper = mount(ProfilePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    const phoneInput = wrapper.get<HTMLInputElement>(
      'input[autocomplete="tel"]',
    );
    expect(phoneInput.element.value).toBe("");
    expect(phoneInput.attributes("required")).toBeUndefined();

    await wrapper
      .get<HTMLInputElement>('input[autocomplete="address-level2"]')
      .setValue("Raleigh, NC");
    await wrapper.get("#profile-form").trigger("submit");
    await flushPromises();

    expect(api.updateProfile).toHaveBeenCalledWith({
      displayName: profile.displayName,
      location: "Raleigh, NC",
      phone: null,
      representedAs: profile.representedAs,
      timezone: profile.timezone,
    });
    expect(accountIdentity.syncAccountIdentity).toHaveBeenLastCalledWith({
      ...profileWithoutPhone,
      location: "Raleigh, NC",
    });
  });

  it("explains first-run profile setup without requiring a phone", async () => {
    currentRoute.query = { welcome: "1" };
    const wrapper = mount(ProfilePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    expect(wrapper.text()).toContain("Your Relay account is ready.");
    expect(wrapper.text()).toContain("your phone number is optional");
  });

  it("does not save an invalid populated customer contact phone", async () => {
    const wrapper = mount(ProfilePage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    await wrapper
      .get<HTMLInputElement>('input[autocomplete="tel"]')
      .setValue("704-555-0100");
    await wrapper.get("#profile-form").trigger("submit");
    await flushPromises();

    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("debounces settings and does not save the initial load", async () => {
    vi.useFakeTimers();
    const wrapper = mount(SettingsPage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    expect(api.updateSettings).not.toHaveBeenCalled();

    await wrapper.get("#evidence-retention").setValue("90");
    await vi.advanceTimersByTimeAsync(599);
    expect(api.updateSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.updateSettings).toHaveBeenCalledWith({
      aiDisclosure: true,
      callbackAlerts: settings.callbackAlerts,
      callMilestones: settings.callMilestones,
      emailUpdates: settings.emailUpdates,
      evidenceRetentionDays: 90,
      recordingConsentDefault: settings.recordingConsentDefault,
    });
    expect(wrapper.text()).toContain("Email delivery is not connected yet");
    expect(wrapper.text()).toContain("Confirmed per request");
    expect(wrapper.text()).toContain("Clerk-secured account");
    expect(wrapper.text()).toContain("Protected");
  });
});
