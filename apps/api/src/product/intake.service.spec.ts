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
    getIntakeContext: vi.fn(async () => ({
      jobId: "job-1",
      mode: "fixture" as const,
      retentionDays: 30,
    })),
  };
  const evidenceCreate = vi.fn(async () => ({ id: "evidence-1" }));
  const prisma = { client: { evidence: { create: evidenceCreate } } };
  const providers = {
    createContext: vi.fn(),
    createSignedInterviewUrl: vi.fn(),
    evidenceStorage: undefined,
    extractionProvider: undefined,
    fetchFinishedConversation: vi.fn(),
  };
  const service = new IntakeService(
    product as never,
    prisma as never,
    providers as never,
  );
  return { evidenceCreate, product, service };
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
      service.completeVoiceSession("RLY-TEST", "conversation-1"),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
