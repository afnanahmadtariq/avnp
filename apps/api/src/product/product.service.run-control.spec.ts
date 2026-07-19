import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { ProductService } from "./product.service.js";

function runFixture(status: "CALLING" | "CANCELLED" | "PAUSED") {
  const now = new Date("2026-07-20T10:00:00.000Z");
  return {
    calls: [
      {
        attempt: 1,
        business: { name: "Pine & Co." },
        businessId: "business-1",
        durationSeconds: null,
        evidence: [],
        id: "call-1",
        negotiationId: "negotiation-1",
        providerCallId: null,
        status: status === "CANCELLED" ? "CANCELLED" : "DIALING",
        structuredOutcome: null,
        transcriptText: null,
      },
    ],
    correlationId: "correlation-1",
    decision: null,
    events: [],
    id: "run-1",
    job: { publicId: "RLY-0001" },
    jobId: "job-1",
    quotes: [],
    recommendation: null,
    specificationVersion: { id: "version-1", version: 1 },
    specificationVersionId: "version-1",
    status,
    updatedAt: now,
  };
}

describe("run cancellation provider reconciliation", () => {
  it("uses provider ids read inside the cancellation transaction", async () => {
    const activeRun = runFixture("CALLING");
    const cancelledRun = runFixture("CANCELLED");
    const findRun = vi
      .fn()
      .mockResolvedValueOnce(activeRun)
      .mockResolvedValueOnce(cancelledRun);
    const cancelCalls = vi.fn(async () => ({ count: 1 }));
    const findRegisteredProviderCalls = vi.fn(async () => [
      { id: "call-1", providerCallId: "conversation-1" },
    ]);
    const createOutbox = vi.fn(async () => ({ id: "outbox-1" }));
    const transactionClient = {
      call: {
        findMany: findRegisteredProviderCalls,
        updateMany: cancelCalls,
      },
      job: { update: vi.fn(async () => ({ id: "job-1" })) },
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      outboxEvent: { create: createOutbox },
      runEvent: {
        create: vi.fn(async () => ({ id: "event-1" })),
        findFirst: vi.fn(async () => null),
      },
    };
    const prisma = {
      client: {
        $transaction: vi.fn(async (operation: unknown) =>
          (operation as (value: unknown) => Promise<unknown>)(
            transactionClient,
          ),
        ),
        negotiationRun: {
          findFirst: findRun,
          findUnique: vi.fn(async () => ({
            correlationId: "correlation-1",
          })),
        },
        runEvent: {
          create: vi.fn(async () => ({ id: "event-1" })),
          findFirst: vi.fn(async () => null),
        },
        user: {
          upsert: vi.fn(async () => ({ id: "user-1" })),
        },
      },
    } as unknown as PrismaService;
    const publishPending = vi.fn(async () => undefined);
    const service = new ProductService(
      prisma,
      { value: { mode: "live" } } as RuntimeConfigService,
      {
        identity: { provider: "clerk", subject: "user-1" },
      } as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    );

    await service.cancelRun("run-1");

    expect(cancelCalls).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
        where: expect.objectContaining({ runId: "run-1" }),
      }),
    );
    expect(findRegisteredProviderCalls).toHaveBeenCalledWith({
      select: { id: true, providerCallId: true },
      where: {
        providerCallId: { not: null },
        runId: "run-1",
        status: "CANCELLED",
      },
    });
    expect(createOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "call.cancel",
          payload: expect.objectContaining({
            name: "call.cancel",
            payload: {
              callId: "call-1",
              providerCallId: "conversation-1",
              runId: "run-1",
            },
          }),
        }),
      }),
    );
    expect(publishPending).toHaveBeenCalledWith("run-1");
  });

  it("creates resumable cancellation work without making active calls terminal", async () => {
    const findRun = vi
      .fn()
      .mockResolvedValueOnce(runFixture("CALLING"))
      .mockResolvedValueOnce(runFixture("PAUSED"));
    const updateCalls = vi.fn();
    const createOutbox = vi.fn(async () => ({ id: "outbox-1" }));
    const transactionClient = {
      call: {
        findMany: vi.fn(async () => [
          { id: "call-1", providerCallId: "conversation-1" },
        ]),
        updateMany: updateCalls,
      },
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      outboxEvent: { create: createOutbox },
      runEvent: {
        create: vi.fn(async () => ({ id: "event-1" })),
        findFirst: vi.fn(async () => null),
      },
    };
    const prisma = {
      client: {
        $transaction: vi.fn(async (operation: unknown) =>
          (operation as (value: unknown) => Promise<unknown>)(
            transactionClient,
          ),
        ),
        negotiationRun: {
          findFirst: findRun,
          findUnique: vi.fn(async () => ({
            correlationId: "correlation-1",
          })),
        },
        runEvent: {
          create: vi.fn(async () => ({ id: "event-1" })),
          findFirst: vi.fn(async () => null),
        },
        user: { upsert: vi.fn(async () => ({ id: "user-1" })) },
      },
    } as unknown as PrismaService;
    const publishPending = vi.fn(async () => undefined);
    const service = new ProductService(
      prisma,
      { value: { mode: "live" } } as RuntimeConfigService,
      {
        identity: { provider: "clerk", subject: "user-1" },
      } as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    );

    await service.pauseRun("run-1");

    expect(updateCalls).not.toHaveBeenCalled();
    expect(createOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "call.cancel",
          payload: expect.objectContaining({
            payload: {
              callId: "call-1",
              providerCallId: "conversation-1",
              resumable: true,
              runId: "run-1",
            },
          }),
        }),
      }),
    );
    expect(publishPending).toHaveBeenCalledWith("run-1");
  });

  it("queries fresh resumable calls after the run changes to calling", async () => {
    const findRun = vi
      .fn()
      .mockResolvedValueOnce(runFixture("PAUSED"))
      .mockResolvedValueOnce(runFixture("CALLING"));
    const findResumableCalls = vi.fn(async () => [
      {
        attempt: 1,
        businessId: "business-late",
        id: "call-late",
        negotiation: { strategy: "FEE_REMOVAL" },
      },
    ]);
    const createOutbox = vi.fn(async () => ({ id: "outbox-1" }));
    const transactionClient = {
      call: {
        findMany: findResumableCalls,
        update: vi.fn(async () => ({ id: "call-late" })),
      },
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      outboxEvent: { create: createOutbox },
      runEvent: {
        create: vi.fn(async () => ({ id: "event-1" })),
        findFirst: vi.fn(async () => null),
      },
    };
    const prisma = {
      client: {
        $transaction: vi.fn(async (operation: unknown) =>
          (operation as (value: unknown) => Promise<unknown>)(
            transactionClient,
          ),
        ),
        negotiationRun: {
          findFirst: findRun,
          findUnique: vi.fn(async () => ({
            correlationId: "correlation-1",
          })),
        },
        runEvent: {
          create: vi.fn(async () => ({ id: "event-1" })),
          findFirst: vi.fn(async () => null),
        },
        user: { upsert: vi.fn(async () => ({ id: "user-1" })) },
      },
    } as unknown as PrismaService;
    const publishPending = vi.fn(async () => undefined);
    const service = new ProductService(
      prisma,
      { value: { mode: "live" } } as RuntimeConfigService,
      {
        identity: { provider: "clerk", subject: "user-1" },
      } as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    );

    await service.resumeRun("run-1");

    expect(findResumableCalls).toHaveBeenCalledWith({
      include: { negotiation: true },
      where: {
        providerCallId: null,
        runId: "run-1",
        status: "QUEUED",
      },
    });
    expect(createOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "call.place",
          payload: expect.objectContaining({
            payload: expect.objectContaining({ callId: "call-late" }),
          }),
        }),
      }),
    );
    expect(createOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "quote.rank",
          payload: expect.objectContaining({
            name: "quote.rank",
            payload: { runId: "run-1" },
          }),
        }),
      }),
    );
  });

  it("re-drives ranking when a paused run has no queued calls left", async () => {
    const findRun = vi
      .fn()
      .mockResolvedValueOnce(runFixture("PAUSED"))
      .mockResolvedValueOnce(runFixture("CALLING"));
    const createOutbox = vi.fn(async () => ({ id: "outbox-rank" }));
    const transactionClient = {
      call: {
        findMany: vi.fn(async () => []),
        update: vi.fn(),
      },
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      outboxEvent: { create: createOutbox },
      runEvent: {
        create: vi.fn(async () => ({ id: "event-1" })),
        findFirst: vi.fn(async () => null),
      },
    };
    const prisma = {
      client: {
        $transaction: vi.fn(async (operation: unknown) =>
          (operation as (value: unknown) => Promise<unknown>)(
            transactionClient,
          ),
        ),
        negotiationRun: { findFirst: findRun },
        user: { upsert: vi.fn(async () => ({ id: "user-1" })) },
      },
    } as unknown as PrismaService;
    const publishPending = vi.fn(async () => undefined);
    const service = new ProductService(
      prisma,
      { value: { mode: "live" } } as RuntimeConfigService,
      {
        identity: { provider: "clerk", subject: "user-1" },
      } as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    );

    await service.resumeRun("run-1");

    expect(transactionClient.call.update).not.toHaveBeenCalled();
    expect(createOutbox).toHaveBeenCalledTimes(1);
    expect(createOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "quote.rank",
          payload: expect.objectContaining({
            name: "quote.rank",
            payload: { runId: "run-1" },
          }),
        }),
      }),
    );
    expect(publishPending).toHaveBeenCalledWith("run-1");
  });
});
