import {
  BadGatewayException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EvidenceAccessService } from "./evidence-access.service.js";

describe("EvidenceAccessService", () => {
  const findFirst = vi.fn();
  const getSignedReadUrl = vi.fn();
  const storage = {
    getSignedReadUrl,
    name: "supabase-storage",
  };
  const providers = {
    createContext: vi.fn().mockReturnValue({
      deadlineAt: "2026-07-19T10:00:05.000Z",
      requestId: "trace-id",
      traceId: "trace-id",
    }),
    getEvidenceStorage: vi.fn().mockReturnValue(storage),
  };
  const service = new EvidenceAccessService(
    { client: { evidence: { findFirst } } } as never,
    {
      identity: { provider: "clerk", subject: "user-1" },
    } as never,
    providers as never,
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T10:00:00.000Z"));
    providers.getEvidenceStorage.mockReturnValue(storage);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("signs a short-lived read only after filtering by the current owner", async () => {
    findFirst.mockResolvedValue({
      contentType: "text/plain",
      id: "evidence-1",
      retentionUntil: new Date("2026-08-19T10:00:00.000Z"),
      storageKey: "runs/run-1/transcript.txt",
    });
    getSignedReadUrl.mockResolvedValue({
      ok: true,
      value: "https://storage.example/signed/transcript",
    });

    await expect(service.createSignedReadAccess("evidence-1")).resolves.toEqual(
      {
        contentType: "text/plain",
        evidenceId: "evidence-1",
        expiresAt: "2026-07-19T10:05:00.000Z",
        url: "https://storage.example/signed/transcript",
      },
    );
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "evidence-1", job: { userId: "user-1" } },
      }),
    );
    expect(getSignedReadUrl).toHaveBeenCalledWith(
      {
        expiresInSeconds: 300,
        key: "runs/run-1/transcript.txt",
      },
      expect.objectContaining({ traceId: "trace-id" }),
    );
  });

  it("does not reveal evidence outside the current user's jobs", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.createSignedReadAccess("someone-elses-evidence"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("rejects evidence after its retention period", async () => {
    findFirst.mockResolvedValue({
      contentType: "audio/mpeg",
      id: "evidence-expired",
      retentionUntil: new Date("2026-07-19T09:59:59.000Z"),
      storageKey: "runs/run-1/recording.mp3",
    });

    await expect(
      service.createSignedReadAccess("evidence-expired"),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it("keeps fixture metadata private when no stored object exists", async () => {
    findFirst.mockResolvedValue({
      contentType: "text/plain",
      id: "fixture-evidence",
      retentionUntil: null,
      storageKey: "fixture://runs/demo/transcript.txt",
    });

    await expect(
      service.createSignedReadAccess("fixture-evidence"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(getSignedReadUrl).not.toHaveBeenCalled();
  });

  it("maps malformed storage responses without exposing provider details", async () => {
    findFirst.mockResolvedValue({
      contentType: "text/plain",
      id: "evidence-1",
      retentionUntil: null,
      storageKey: "runs/run-1/transcript.txt",
    });
    getSignedReadUrl.mockResolvedValue({
      error: {
        code: "invalid-response",
        message: "secret upstream response",
        provider: "supabase-storage",
        retryable: false,
      },
      ok: false,
    });

    await expect(
      service.createSignedReadAccess("evidence-1"),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
