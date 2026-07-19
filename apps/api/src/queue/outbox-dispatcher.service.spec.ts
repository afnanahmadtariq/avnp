import { describe, expect, it, vi } from "vitest";

import { OutboxDispatcherService } from "./outbox-dispatcher.service.js";

describe("OutboxDispatcherService", () => {
  it("publishes a persisted queue envelope and marks it complete", async () => {
    const update = vi.fn().mockResolvedValue({});
    const prisma = {
      configured: true,
      client: {
        outboxEvent: {
          findMany: vi.fn().mockResolvedValue([
            {
              aggregateId: "run-1",
              createdAt: new Date(),
              eventType: "call.place",
              id: "outbox-1",
              payload: {
                idempotencyKey: "run-1:call-1:place",
                name: "call.place",
                payload: {
                  businessId: "business-1",
                  callId: "call-1",
                  runId: "run-1",
                  specificationVersionId: "specification-1",
                  strategy: "discount_request",
                },
                requestedAt: "2026-07-19T10:00:00.000Z",
                traceId: "trace-1",
                version: 1,
              },
            },
          ]),
          update,
        },
      },
    };
    const queue = { enabled: true, enqueue: vi.fn().mockResolvedValue({}) };
    const service = new OutboxDispatcherService(
      prisma as never,
      queue as never,
    );

    await service.publishPending("run-1");

    expect(queue.enqueue).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
        where: { id: "outbox-1" },
      }),
    );
  });
});
