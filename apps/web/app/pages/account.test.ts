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

vi.mock("../composables/useRelayApi", () => ({
  useRelayApi: () => api,
}));

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
  vi.stubGlobal("useSeoMeta", vi.fn());
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

    await wrapper
      .get<HTMLInputElement>('input[autocomplete="name"]')
      .setValue("Relay Customer");
    await wrapper.get("#profile-form").trigger("submit");
    await flushPromises();

    expect(api.updateProfile).toHaveBeenCalledWith({
      displayName: "Relay Customer",
      email: profile.email,
      location: profile.location,
      phone: profile.phone,
      representedAs: profile.representedAs,
      timezone: profile.timezone,
    });
    expect(wrapper.text()).toContain("Profile saved to Relay.");
  });

  it("debounces settings and does not save the initial load", async () => {
    vi.useFakeTimers();
    const wrapper = mount(SettingsPage, {
      global: { stubs: globalComponents },
    });
    await flushPromises();

    expect(api.updateSettings).not.toHaveBeenCalled();

    await wrapper.get<HTMLInputElement>(".switch input").setValue(false);
    await vi.advanceTimersByTimeAsync(599);
    expect(api.updateSettings).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();

    expect(api.updateSettings).toHaveBeenCalledTimes(1);
    expect(api.updateSettings).toHaveBeenCalledWith({
      aiDisclosure: true,
      callbackAlerts: settings.callbackAlerts,
      callMilestones: settings.callMilestones,
      emailUpdates: false,
      evidenceRetentionDays: settings.evidenceRetentionDays,
      recordingConsentDefault: settings.recordingConsentDefault,
    });
  });
});
