import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { ProductService } from "./product.service.js";

interface StoredUser {
  displayName: string;
  email: string;
  id: string;
  profile: Record<string, unknown>;
  updatedAt: Date;
}

function createProfileService(initialProfile: Record<string, unknown>) {
  let user: StoredUser = {
    displayName: "Relay Customer",
    email: "customer@relay.example",
    id: "user_1",
    profile: initialProfile,
    updatedAt: new Date("2026-07-19T00:00:00.000Z"),
  };
  const update = vi.fn(
    async (request: {
      data: {
        displayName?: string | null;
        email?: string | null;
        profile?: unknown;
      };
    }) => {
      user = {
        ...user,
        ...(request.data.displayName === undefined
          ? {}
          : { displayName: request.data.displayName ?? "" }),
        ...(request.data.email === undefined
          ? {}
          : { email: request.data.email ?? "" }),
        ...(request.data.profile === undefined
          ? {}
          : { profile: request.data.profile as Record<string, unknown> }),
      };
      return user;
    },
  );
  const prisma = {
    client: {
      user: {
        update,
        upsert: vi.fn(async () => user),
      },
    },
  } as unknown as PrismaService;
  const runtimeConfig = {
    value: { mode: "live" },
  } as unknown as RuntimeConfigService;
  const currentIdentity = {
    identity: {
      displayName: user.displayName,
      email: user.email,
      provider: "clerk",
      subject: user.id,
    },
  } as CurrentIdentityService;
  const service = new ProductService(
    prisma,
    runtimeConfig,
    currentIdentity,
    {} as OutboxDispatcherService,
  );

  return { service, update };
}

describe("customer profile phone", () => {
  it("presents a missing or legacy blank phone as null", async () => {
    const missing = createProfileService({});
    const legacyBlank = createProfileService({ phone: "" });

    await expect(missing.service.getProfile()).resolves.toMatchObject({
      phone: null,
    });
    await expect(legacyBlank.service.getProfile()).resolves.toMatchObject({
      phone: null,
    });
  });

  it("persists and returns an explicitly cleared phone", async () => {
    const { service, update } = createProfileService({
      phone: "+17045550100",
    });

    await expect(service.updateProfile({ phone: null })).resolves.toMatchObject(
      {
        phone: null,
      },
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          profile: expect.objectContaining({ phone: null }),
        }),
      }),
    );
  });
});
