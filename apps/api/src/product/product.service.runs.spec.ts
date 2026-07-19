import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { ProductService } from "./product.service.js";

describe("run target validation", () => {
  it("rejects an uncallable selected business before any run side effect", async () => {
    const updateCandidates = vi.fn();
    const publishPending = vi.fn();
    const service = new ProductService(
      {
        client: { jobBusiness: { updateMany: updateCandidates } },
      } as unknown as PrismaService,
      { value: { mode: "live" } } as RuntimeConfigService,
      {} as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    );
    const candidates = [
      selectedCandidate("business-1", "+17045550101"),
      selectedCandidate("business-2", null),
      selectedCandidate("business-3", "+17045550103"),
    ];
    Reflect.set(
      service,
      "findOwnedJob",
      vi.fn(async () => ({ candidates, runs: [] })),
    );
    Reflect.set(
      service,
      "requireConfirmedVersion",
      vi.fn(() => ({
        id: "version-1",
        sourceMetadata: {
          consent: { calling: true, recording: true },
        },
      })),
    );

    const error = await service
      .createRun("RLY-TEST", {
        businessIds: ["business-1", "business-2", "business-3"],
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      businessIds: ["business-2"],
      error: "uncallable_businesses",
      message:
        "Every selected business must have a callable E.164 phone number.",
    });
    expect(updateCandidates).not.toHaveBeenCalled();
    expect(publishPending).not.toHaveBeenCalled();
  });
});

describe("run transcript retention", () => {
  it("does not return an expired terminal transcript", async () => {
    const redactExpired = vi.fn(async () => ({ count: 1 }));
    const service = new ProductService(
      {
        client: { call: { updateMany: redactExpired } },
      } as unknown as PrismaService,
      { value: { mode: "live" } } as unknown as RuntimeConfigService,
      {} as CurrentIdentityService,
      {} as OutboxDispatcherService,
    );
    Reflect.set(
      service,
      "findOwnedRun",
      vi.fn(async () => ({
        calls: [
          runCall("expired", "COMPLETED", new Date("2000-01-01T00:00:00Z")),
          runCall("retained", "COMPLETED", new Date("2999-01-01T00:00:00Z")),
          runCall("settled", "FAILED", null, { extraction: "failed" }),
          runCall("pending", "COMPLETED", null, { extraction: "queued" }),
          runCall("active", "IN_PROGRESS", null),
        ],
        decision: null,
        id: "run-1",
        job: { publicId: "RLY-TEST" },
        quotes: [],
        recommendation: null,
        specificationVersion: { id: "version-1", version: 1 },
        status: "CALLING",
        updatedAt: new Date("2026-07-19T00:00:00Z"),
      })),
    );

    const result = (await service.getRun("run-1")) as {
      calls: { id: string; transcript: string }[];
    };

    expect(result.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "expired", transcript: "" }),
        expect.objectContaining({
          id: "retained",
          transcript: "Business: retained transcript",
        }),
        expect.objectContaining({
          id: "active",
          transcript: "Business: active transcript",
        }),
        expect.objectContaining({ id: "settled", transcript: "" }),
        expect.objectContaining({ id: "pending", transcript: "" }),
      ]),
    );
    expect(redactExpired).toHaveBeenCalledWith({
      data: { transcriptText: null },
      where: { id: { in: ["expired", "settled"] }, runId: "run-1" },
    });
  });
});

function selectedCandidate(businessId: string, phone: string | null) {
  return {
    business: { id: businessId, phone },
    businessId,
  };
}

function runCall(
  id: string,
  status: string,
  retentionUntil: Date | null,
  structuredOutcome: unknown = null,
) {
  return {
    business: { name: `Business ${id}` },
    businessId: `business-${id}`,
    durationSeconds: 0,
    evidence:
      retentionUntil === null
        ? []
        : [
            {
              contentType: "text/plain",
              id: `evidence-${id}`,
              kind: "TRANSCRIPT",
              provider: "supabase",
              retentionUntil,
            },
          ],
    id,
    status,
    structuredOutcome,
    transcriptText: `Business: ${id} transcript`,
  };
}
