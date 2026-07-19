import "reflect-metadata";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { CallStatus as DatabaseCallStatus } from "@relay/database";
import type {
  CallProvider,
  ProviderResult,
  VerifiedCallEvent,
} from "@relay/integrations";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import type { ProviderCompositionService } from "../providers/provider-composition.service.js";
import type { QueueService } from "../queue/queue.service.js";
import { ElevenLabsWebhookController } from "./elevenlabs-webhook.controller.js";
import { ElevenLabsWebhookService } from "./elevenlabs-webhook.service.js";

const body = new TextEncoder().encode('{"event":"completed"}');
const occurredAt = "2026-07-19T12:00:00.000Z";
const event: VerifiedCallEvent = {
  eventId: "elevenlabs:event-1",
  occurredAt,
  providerCallId: "conversation-1",
  status: "completed",
  transcriptText: "Agent: Hello\nBusiness: The total is $1,850.",
};

function verified(
  value: VerifiedCallEvent = event,
): ProviderResult<VerifiedCallEvent> {
  return { ok: true, value };
}

describe("ElevenLabsWebhookService", () => {
  const verifyWebhook = vi.fn();
  const enqueue = vi.fn();
  const findUnique = vi.fn();
  const updateMany = vi.fn();
  const upsert = vi.fn();
  const updateWebhook = vi.fn();

  function createService(): ElevenLabsWebhookService {
    const callProvider = {
      name: "elevenlabs-agents",
      verifyWebhook,
    } as unknown as CallProvider;
    const queue = {
      enabled: true,
      enqueue,
    } as unknown as QueueService;
    const providers = {
      callProvider,
      createContext: vi.fn().mockReturnValue({
        requestId: "request-1",
        traceId: "trace-1",
      }),
    } as unknown as ProviderCompositionService;
    const client = {
      call: { findUnique, updateMany },
      webhookEvent: { update: updateWebhook, upsert },
    };
    const prisma = { client } as unknown as PrismaService;
    return new ElevenLabsWebhookService(providers, prisma, queue);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    verifyWebhook.mockResolvedValue(verified());
    findUnique.mockResolvedValue({
      endedAt: null,
      id: "call-1",
      jobId: "job-1",
      runId: "run-1",
      startedAt: null,
      status: DatabaseCallStatus.NEGOTIATING,
      structuredOutcome: null,
      transcriptText: null,
      updatedAt: new Date("2026-07-19T11:59:00.000Z"),
    });
    upsert.mockResolvedValue({
      id: "webhook-1",
      payloadHash:
        "4d9f031491abddf443d8bcfc172a7fc14619e6b7e80cc2ba6b452aa303abf291",
      processedAt: null,
    });
    updateMany.mockResolvedValue({ count: 1 });
    enqueue.mockResolvedValue({
      jobId: "call-outcome-process-1",
      queueName: "call-execution",
    });
    updateWebhook.mockResolvedValue({ id: "webhook-1" });
  });

  it("authenticates, records, advances, and enqueues a webhook once", async () => {
    const service = createService();

    await expect(
      service.receive({
        body,
        headers: { "elevenlabs-signature": "signed" },
        requestId: "request-1",
        traceId: "trace-1",
      }),
    ).resolves.toEqual({ accepted: true, duplicate: false });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          jobId: "job-1",
          provider: "elevenlabs-agents",
          providerEventId: "elevenlabs:event-1",
        }),
        update: {},
      }),
    );
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: DatabaseCallStatus.COMPLETED,
          transcriptText: event.transcriptText,
        }),
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "webhook:elevenlabs-agents:elevenlabs:event-1",
        name: "call.outcome.process",
        payload: {
          callId: "call-1",
          providerEventId: "elevenlabs:event-1",
          runId: "run-1",
        },
      }),
    );
    expect(updateWebhook).toHaveBeenLastCalledWith({
      data: { failureMessage: null, processedAt: expect.any(Date) },
      where: { id: "webhook-1" },
    });
  });

  it("acknowledges an already processed provider event without replaying it", async () => {
    upsert.mockResolvedValue({
      id: "webhook-1",
      payloadHash:
        "4d9f031491abddf443d8bcfc172a7fc14619e6b7e80cc2ba6b452aa303abf291",
      processedAt: new Date("2026-07-19T12:01:00.000Z"),
    });
    const service = createService();

    await expect(
      service.receive({
        body,
        headers: {},
        requestId: "request-2",
        traceId: "trace-2",
      }),
    ).resolves.toEqual({ accepted: true, duplicate: true });

    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("does not regress a terminal call when an older event arrives", async () => {
    findUnique.mockResolvedValue({
      endedAt: new Date(occurredAt),
      id: "call-1",
      jobId: "job-1",
      runId: "run-1",
      startedAt: new Date("2026-07-19T11:55:00.000Z"),
      status: DatabaseCallStatus.COMPLETED,
      structuredOutcome: null,
      transcriptText: event.transcriptText,
      updatedAt: new Date("2026-07-19T12:00:01.000Z"),
    });
    verifyWebhook.mockResolvedValue(
      verified({
        eventId: "elevenlabs:event-older",
        occurredAt: "2026-07-19T11:56:00.000Z",
        providerCallId: "conversation-1",
        status: "dialing",
      }),
    );
    const service = createService();

    await service.receive({
      body,
      headers: {},
      requestId: "request-3",
      traceId: "trace-3",
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("does not restore a transcript after secured processing finished", async () => {
    findUnique.mockResolvedValue({
      endedAt: new Date(occurredAt),
      id: "call-1",
      jobId: "job-1",
      runId: "run-1",
      startedAt: new Date("2026-07-19T11:55:00.000Z"),
      status: DatabaseCallStatus.COMPLETED,
      structuredOutcome: { extraction: "completed" },
      transcriptText: null,
      updatedAt: new Date("2026-07-19T12:00:01.000Z"),
    });
    const service = createService();

    await service.receive({
      body,
      headers: {},
      requestId: "request-late",
      traceId: "trace-late",
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledOnce();
  });

  it("maps provider authentication failures to a safe response", async () => {
    verifyWebhook.mockResolvedValue({
      error: {
        code: "authentication",
        message: "signature and secret detail",
        provider: "elevenlabs-agents",
        retryable: false,
      },
      ok: false,
    } satisfies ProviderResult<VerifiedCallEvent>);
    const service = createService();

    await expect(
      service.receive({
        body,
        headers: {},
        requestId: "request-4",
        traceId: "trace-4",
      }),
    ).rejects.toThrow(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("ElevenLabsWebhookController", () => {
  it("requires the exact raw bytes captured by Nest", () => {
    const webhooks = {
      receive: vi.fn(),
    } as unknown as ElevenLabsWebhookService;
    const controller = new ElevenLabsWebhookController(webhooks);

    expect(() => controller.receive({ headers: {} })).toThrow(
      BadRequestException,
    );
  });
});
