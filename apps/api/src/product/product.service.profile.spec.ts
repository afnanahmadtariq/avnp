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

function createProfileService(
  initialProfile: Record<string, unknown>,
  identityOverrides: Partial<{
    displayName: string;
    email: string;
  }> = {},
) {
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
  const upsert = vi.fn(
    async (request: {
      create: {
        displayName?: string | null;
        email?: string | null;
      };
      update: {
        displayName?: string | null;
        email?: string | null;
      };
    }) => {
      user = {
        ...user,
        ...(request.update.displayName === undefined
          ? {}
          : { displayName: request.update.displayName ?? "" }),
        ...(request.update.email === undefined
          ? {}
          : { email: request.update.email ?? "" }),
      };
      return user;
    },
  );
  const prisma = {
    client: {
      user: {
        update,
        upsert,
      },
    },
  } as unknown as PrismaService;
  const runtimeConfig = {
    value: { mode: "live" },
  } as unknown as RuntimeConfigService;
  const currentIdentity = {
    identity: {
      displayName: identityOverrides.displayName ?? user.displayName,
      email: identityOverrides.email ?? user.email,
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

  return { currentIdentity, service, update, upsert };
}

describe("customer profile", () => {
  it("seeds a Clerk name once while keeping the Relay display name user-managed", async () => {
    const { service, upsert } = createProfileService(
      { displayName: "Relay Customer" },
      {
        displayName: "Updated Clerk Name",
        email: "updated@relay.example",
      },
    );

    await expect(
      service.updateProfile({ displayName: "Preferred Relay Name" }),
    ).resolves.toMatchObject({
      displayName: "Preferred Relay Name",
      email: "updated@relay.example",
    });
    await expect(service.getProfile()).resolves.toMatchObject({
      displayName: "Preferred Relay Name",
      email: "updated@relay.example",
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ displayName: "Updated Clerk Name" }),
        update: { email: "updated@relay.example" },
      }),
    );
    expect(upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ displayName: expect.anything() }),
      }),
    );
  });

  it("keeps the verified email already stored during a transient Clerk identity lookup gap", async () => {
    const { currentIdentity, service, upsert } = createProfileService({});
    Reflect.set(currentIdentity, "identity", {
      displayName: "Relay Customer",
      provider: "clerk",
      subject: "user-1",
    });

    await expect(service.getProfile()).resolves.toMatchObject({
      email: "customer@relay.example",
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

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
