import {
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { IntakeService, type IntakeUpload } from "./intake.service.js";

function fixtureUpload(overrides: Partial<IntakeUpload> = {}): IntakeUpload {
  const buffer = Buffer.from("%PDF-1.7\nfixture");
  return {
    buffer,
    mimetype: "application/pdf",
    originalname: "move brief.pdf",
    size: buffer.length,
    ...overrides,
  };
}

function createService() {
  const product = {
    applyIntakeExtraction: vi.fn(async (_publicId, extraction) => ({
      extraction,
      job: { publicId: "RLY-TEST" },
    })),
    getIntakeContext: vi.fn(
      async (): Promise<{
        jobId: string;
        mode: "fixture" | "live";
        retentionDays: number;
      }> => ({
        jobId: "job-1",
        mode: "fixture",
        retentionDays: 30,
      }),
    ),
  };
  const evidenceCreate = vi.fn(async () => ({ id: "evidence-1" }));
  const voiceSessionCreate = vi.fn(async () => ({ id: "voice-session-1" }));
  const voiceSessionUpdate = vi.fn(async () => ({ id: "voice-session-1" }));
  const voiceSessionUpdateMany = vi.fn(async () => ({ count: 1 }));
  const prisma = {
    client: {
      evidence: { create: evidenceCreate },
      voiceIntakeSession: {
        create: voiceSessionCreate,
        update: voiceSessionUpdate,
        updateMany: voiceSessionUpdateMany,
      },
    },
  };
  const providers = {
    createContext: vi.fn(),
    createSignedInterviewUrl: vi.fn(),
    evidenceStorage: undefined,
    extractionProvider: undefined as
      | {
          extractJobSpecification: ReturnType<typeof vi.fn>;
          name: string;
        }
      | undefined,
    fetchFinishedConversation: vi.fn(),
    isExpectedInterviewConversation: vi.fn(() => true),
  };
  const service = new IntakeService(
    product as never,
    prisma as never,
    providers as never,
  );
  return {
    evidenceCreate,
    product,
    providers,
    service,
    voiceSessionCreate,
    voiceSessionUpdate,
    voiceSessionUpdateMany,
  };
}

describe("IntakeService", () => {
  it("accepts a genuine fixture PDF and records extraction provenance", async () => {
    const { evidenceCreate, product, service } = createService();

    const result = await service.extractDocument("RLY-TEST", fixtureUpload());

    expect(evidenceCreate).toHaveBeenCalledOnce();
    expect(product.applyIntakeExtraction).toHaveBeenCalledWith(
      "RLY-TEST",
      expect.objectContaining({ facts: { vertical: "moving" } }),
      expect.objectContaining({ kind: "document", provider: "fixture" }),
    );
    expect(result).toEqual(
      expect.objectContaining({ job: { publicId: "RLY-TEST" } }),
    );
  });

  it("rejects spoofed document content", async () => {
    const { service } = createService();
    const buffer = Buffer.from("not a pdf");

    await expect(
      service.extractDocument(
        "RLY-TEST",
        fixtureUpload({ buffer, size: buffer.length }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("describes unavailable fixture voice sessions without inventing one", async () => {
    const { service } = createService();

    await expect(service.createVoiceSession("RLY-TEST")).resolves.toEqual(
      expect.objectContaining({ available: false, signedUrl: null }),
    );
    await expect(
      service.completeVoiceSession(
        "RLY-TEST",
        "intake-session-1",
        "conversation-1",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("reserves an owned session before returning the provider URL", async () => {
    const { product, providers, service, voiceSessionCreate } = createService();
    product.getIntakeContext.mockResolvedValueOnce({
      jobId: "job-1",
      mode: "live",
      retentionDays: 30,
    });
    providers.createSignedInterviewUrl.mockResolvedValueOnce({
      ok: true,
      value: {
        signedUrl: "wss://api.elevenlabs.io/signed",
      },
    });

    await expect(service.createVoiceSession("RLY-TEST")).resolves.toEqual(
      expect.objectContaining({
        available: true,
        mode: "live",
        sessionId: expect.stringMatching(/^intake_[a-f0-9]{32}$/),
        signedUrl: "wss://api.elevenlabs.io/signed",
      }),
    );
    expect(voiceSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: expect.stringMatching(/^intake_[a-f0-9]{32}$/),
        jobId: "job-1",
      }),
    });
  });

  it("refuses to fetch a conversation that was not claimed for the owned job", async () => {
    const { product, providers, service, voiceSessionUpdateMany } =
      createService();
    product.getIntakeContext.mockResolvedValueOnce({
      jobId: "job-1",
      mode: "live",
      retentionDays: 30,
    });
    voiceSessionUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.completeVoiceSession(
        "RLY-TEST",
        "intake-session-1",
        "conversation-other",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(providers.fetchFinishedConversation).not.toHaveBeenCalled();
  });

  it("consumes a bound interview exactly once after transcript extraction", async () => {
    const {
      evidenceCreate,
      product,
      providers,
      service,
      voiceSessionUpdate,
      voiceSessionUpdateMany,
    } = createService();
    product.getIntakeContext.mockResolvedValueOnce({
      jobId: "job-1",
      mode: "live",
      retentionDays: 30,
    });
    providers.createContext.mockReturnValue({
      requestId: "request-1",
      traceId: "trace-1",
    });
    providers.fetchFinishedConversation.mockResolvedValueOnce({
      ok: true,
      value: {
        providerCallId: "conversation-1",
        status: "completed",
        transcriptText: "Business: I need a two-bedroom move.",
        updatedAt: "2026-07-19T00:00:00.000Z",
      },
    });
    providers.extractionProvider = {
      extractJobSpecification: vi.fn(async () => ({
        ok: true,
        value: {
          confidence: 0.9,
          facts: { vertical: "moving" },
        },
      })),
      name: "openai-responses",
    };

    await service.completeVoiceSession(
      "RLY-TEST",
      "intake-session-1",
      "conversation-1",
    );

    expect(evidenceCreate).toHaveBeenCalledTimes(2);
    expect(voiceSessionUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "COMPLETED" }),
      where: { conversationId: "conversation-1" },
    });

    voiceSessionUpdateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    await expect(
      service.completeVoiceSession(
        "RLY-TEST",
        "intake-session-1",
        "conversation-1",
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(providers.fetchFinishedConversation).toHaveBeenCalledTimes(1);
  });
});
