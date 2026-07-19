import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@relay/database";
import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { ProductService } from "./product.service.js";

type EventActor = "API" | "PROVIDER" | "SYSTEM" | "USER" | "WORKER";

interface EventWrite {
  readonly actor: EventActor;
  readonly correlationId: string;
  readonly eventType: string;
  readonly id: string;
  readonly occurredAt: Date;
  readonly payload: unknown;
  readonly runId: string;
  readonly sequence: number;
}

interface AppendRunEvent {
  appendRunEvent(
    runId: string,
    eventType: string,
    actor: EventActor,
    payload: unknown,
  ): Promise<void>;
}

describe("run event sequencing", () => {
  it("retries a concurrent sequence collision and persists both events in order", async () => {
    const storedEvents: EventWrite[] = [];
    const create = vi.fn(async ({ data }: { data: EventWrite }) => {
      const duplicate = storedEvents.some(
        (event) =>
          event.id === data.id ||
          (event.runId === data.runId && event.sequence === data.sequence),
      );
      if (duplicate) throw uniqueConstraintError();
      storedEvents.push(data);
      return data;
    });
    const transaction = {
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
      },
      runEvent: {
        create,
        findFirst: vi.fn(async () => storedEvents.at(-1) ?? null),
      },
    };
    const transact = vi.fn(
      async (
        operation: (database: typeof transaction) => Promise<void>,
      ): Promise<void> => operation(transaction),
    );
    const service = createService({ $transaction: transact });

    await Promise.all([
      appendRunEvent(service, "run-1", "run.paused", { reason: "user" }),
      appendRunEvent(service, "run-1", "run.cancelled", {}),
    ]);

    expect(storedEvents).toHaveLength(2);
    expect(
      storedEvents.map(({ eventType, id, sequence }) => ({
        eventType,
        id,
        sequence,
      })),
    ).toEqual([
      {
        eventType: "run.paused",
        id: "run-1-event-1",
        sequence: 1,
      },
      {
        eventType: "run.cancelled",
        id: "run-1-event-2",
        sequence: 2,
      },
    ]);
    expect(create).toHaveBeenCalledTimes(3);
    expect(transact).toHaveBeenCalledTimes(3);
  });

  it("stops after five sequence-conflict attempts and returns the conflict", async () => {
    const conflict = uniqueConstraintError();
    const transaction = {
      negotiationRun: {
        findUnique: vi.fn(async () => ({ correlationId: "correlation-1" })),
      },
      runEvent: {
        create: vi.fn(async () => {
          throw conflict;
        }),
        findFirst: vi.fn(async () => null),
      },
    };
    const transact = vi.fn(
      async (
        operation: (database: typeof transaction) => Promise<void>,
      ): Promise<void> => operation(transaction),
    );
    const service = createService({ $transaction: transact });

    await expect(
      appendRunEvent(service, "run-1", "run.paused", {}),
    ).rejects.toBe(conflict);
    expect(transaction.runEvent.create).toHaveBeenCalledTimes(5);
    expect(transact).toHaveBeenCalledTimes(5);
  });

  it("does not retry when the target run is missing", async () => {
    const transaction = {
      negotiationRun: { findUnique: vi.fn(async () => null) },
      runEvent: {
        create: vi.fn(),
        findFirst: vi.fn(async () => null),
      },
    };
    const transact = vi.fn(
      async (
        operation: (database: typeof transaction) => Promise<void>,
      ): Promise<void> => operation(transaction),
    );
    const service = createService({ $transaction: transact });

    await expect(
      appendRunEvent(service, "missing-run", "run.paused", {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction.runEvent.create).not.toHaveBeenCalled();
    expect(transact).toHaveBeenCalledTimes(1);
  });
});

function createService(database: unknown): ProductService {
  return new ProductService(
    { client: database } as PrismaService,
    {} as RuntimeConfigService,
    {} as CurrentIdentityService,
    {} as OutboxDispatcherService,
  );
}

function appendRunEvent(
  service: ProductService,
  runId: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  return (service as unknown as AppendRunEvent).appendRunEvent(
    runId,
    eventType,
    "USER",
    payload,
  );
}

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed on (runId, sequence)",
    { clientVersion: "7.8.0", code: "P2002" },
  );
}
