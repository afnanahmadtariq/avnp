import { BadRequestException, ConflictException } from "@nestjs/common";
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

  it("atomically releases failed-run candidates and creates a fresh run", async () => {
    const setup = liveRunSetup({ previousStatus: "FAILED" });

    const result = await setup.service.createRun("RLY-TEST", {
      businessIds: ["business-1", "business-2", "business-3"],
    });

    expect(result).toEqual({ id: "run-new" });
    expect(setup.updateCandidates).toHaveBeenCalledWith({
      data: { status: "SHORTLISTED" },
      where: {
        businessId: {
          in: ["business-1", "business-2", "business-3"],
        },
        jobId: "job-1",
        status: "CONTACTING",
      },
    });
    expect(setup.updateCandidates).toHaveBeenCalledWith({
      data: { status: "CONTACTING" },
      where: {
        businessId: {
          in: ["business-1", "business-2", "business-3"],
        },
        jobId: "job-1",
      },
    });
    expect(setup.createRun).toHaveBeenCalledOnce();
    expect(setup.createNegotiation).toHaveBeenCalledTimes(3);
    expect(setup.createCall).toHaveBeenCalledTimes(3);
    expect(setup.publishPending).toHaveBeenCalledWith("run-new");
  });

  it("keeps a cancelled business unavailable until provider cancellation settles", async () => {
    const setup = liveRunSetup({
      previousStatus: "CANCELLED",
      providerCancellationPending: true,
    });

    const error = await setup.service
      .createRun("RLY-TEST", {
        businessIds: ["business-1", "business-2", "business-3"],
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toEqual({
      businessIds: ["business-1", "business-2", "business-3"],
      error: "previous_calls_finalizing",
      message:
        "Previous calls are still being finalized. Try again after cancellation completes.",
    });
    expect(setup.createRun).not.toHaveBeenCalled();
    expect(setup.publishPending).not.toHaveBeenCalled();
  });

  it("releases cancelled-run candidates after provider cancellation settles", async () => {
    const setup = liveRunSetup({ previousStatus: "CANCELLED" });

    await setup.service.createRun("RLY-TEST", {
      businessIds: ["business-1", "business-2", "business-3"],
    });

    expect(setup.updateCandidates).toHaveBeenCalledWith({
      data: { status: "SHORTLISTED" },
      where: {
        businessId: {
          in: ["business-1", "business-2", "business-3"],
        },
        jobId: "job-1",
        status: "CONTACTING",
      },
    });
    expect(setup.createRun).toHaveBeenCalledOnce();
  });

  it("rechecks active runs after taking the job lock", async () => {
    const setup = liveRunSetup({
      activeRunId: "run-concurrent",
      previousStatus: null,
    });

    await expect(
      setup.service.createRun("RLY-TEST", {
        businessIds: ["business-1", "business-2", "business-3"],
      }),
    ).rejects.toThrow(
      "Negotiation run run-concurrent is already active for this request.",
    );
    expect(setup.createRun).not.toHaveBeenCalled();
    expect(setup.updateCandidates).not.toHaveBeenCalled();
  });

  it("does not start a second run for the same completed brief", async () => {
    const setup = liveRunSetup({ previousStatus: "COMPLETED" });

    await expect(
      setup.service.createRun("RLY-TEST", {
        businessIds: ["business-1", "business-2", "business-3"],
      }),
    ).rejects.toThrow(
      "This confirmed brief already has a completed negotiation run.",
    );
    expect(setup.createRun).not.toHaveBeenCalled();
    expect(setup.updateCandidates).not.toHaveBeenCalled();
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

describe("restart candidate reconciliation", () => {
  it("returns failed-run candidates as selectable after their calls settle", async () => {
    const candidate = {
      business: {
        address: { formattedAddress: "Charlotte, NC" },
        id: "business-1",
        name: "Pine & Co.",
        phone: "+17045550101",
        provider: "google-places",
        rating: null,
        reviewCount: null,
        verification: {},
      },
      businessId: "business-1",
      status: "SHORTLISTED",
    };
    const releaseCandidates = vi.fn(async () => ({ count: 1 }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => [{ locked: true }]),
      call: {
        findMany: vi.fn(async () => [
          {
            businessId: "business-1",
            providerCallId: "provider-1",
            status: "FAILED",
            structuredOutcome: { outcome: "failed" },
          },
        ]),
      },
      jobBusiness: { updateMany: releaseCandidates },
      negotiation: {
        findMany: vi.fn(async () => [{ businessId: "business-1" }]),
      },
      negotiationRun: {
        findFirst: vi.fn(async () => ({ id: "run-old", status: "FAILED" })),
      },
    };
    const service = new ProductService(
      {
        client: {
          $transaction: vi.fn(async (operation: unknown) =>
            (operation as (value: unknown) => Promise<unknown>)(
              transactionClient,
            ),
          ),
          job: {
            findUnique: vi.fn(async () => ({
              candidates: [candidate],
              id: "job-1",
              publicId: "RLY-TEST",
              runs: [{ id: "run-old", status: "FAILED" }],
              status: "FAILED",
            })),
          },
        },
      } as unknown as PrismaService,
      { value: { mode: "live" } } as RuntimeConfigService,
      {} as CurrentIdentityService,
      {} as OutboxDispatcherService,
    );
    Reflect.set(
      service,
      "findOwnedJob",
      vi.fn(async () => ({
        candidates: [{ ...candidate, status: "CONTACTING" }],
        id: "job-1",
        publicId: "RLY-TEST",
        runs: [{ id: "run-old", status: "FAILED" }],
        status: "FAILED",
      })),
    );

    const result = (await service.getCandidates("RLY-TEST")) as {
      items: { selected: boolean; status: string }[];
    };

    expect(releaseCandidates).toHaveBeenCalledWith({
      data: { status: "SHORTLISTED" },
      where: {
        businessId: { in: ["business-1"] },
        jobId: "job-1",
        status: "CONTACTING",
      },
    });
    expect(result.items).toEqual([
      expect.objectContaining({ selected: true, status: "shortlisted" }),
    ]);
  });
});

function selectedCandidate(businessId: string, phone: string | null) {
  return {
    business: { id: businessId, phone },
    businessId,
    status: "CONTACTING",
  };
}

function liveRunSetup(input: {
  activeRunId?: string;
  previousStatus: "CANCELLED" | "COMPLETED" | "FAILED" | null;
  providerCancellationPending?: boolean;
}) {
  const confirmedAt = new Date("2026-07-20T10:00:00.000Z");
  const specification = { vertical: "moving" };
  const businessIds = ["business-1", "business-2", "business-3"];
  const cancelledRun = input.previousStatus === "CANCELLED";
  const outerCandidates = businessIds.map((businessId, index) =>
    selectedCandidate(businessId, `+1704555010${index + 1}`),
  );
  const updateCandidates = vi.fn(async () => ({ count: 3 }));
  const createRun = vi.fn(async () => ({ id: "run-new" }));
  const createNegotiation = vi.fn(async () => ({
    id: `negotiation-${createNegotiation.mock.calls.length}`,
  }));
  const createCall = vi.fn(async () => ({
    id: `call-${createCall.mock.calls.length}`,
  }));
  const transactionClient = {
    $queryRaw: vi.fn(async () => [{ locked: true }]),
    call: {
      create: createCall,
      findMany: vi.fn(async () =>
        businessIds.map((businessId) => ({
          businessId,
          providerCallId: cancelledRun ? `provider-${businessId}` : null,
          status: cancelledRun ? "CANCELLED" : "FAILED",
          structuredOutcome:
            cancelledRun && input.providerCancellationPending !== true
              ? {
                  providerCancellationCompletedAt: "2026-07-20T10:01:00.000Z",
                }
              : null,
        })),
      ),
    },
    job: {
      findUnique: vi.fn(async () => ({
        confirmedAt,
        specification,
        status: input.previousStatus === null ? "READY" : input.previousStatus,
      })),
      update: vi.fn(async () => ({ id: "job-1" })),
    },
    jobBusiness: {
      findMany: vi.fn(async () =>
        businessIds.map((businessId, index) => ({
          business: { phone: `+1704555010${index + 1}` },
          businessId,
          status: input.providerCancellationPending
            ? "CONTACTING"
            : "SHORTLISTED",
        })),
      ),
      updateMany: updateCandidates,
    },
    jobSpecificationVersion: {
      findUnique: vi.fn(async () => ({
        confirmedAt,
        jobId: "job-1",
        specification,
      })),
    },
    negotiation: {
      create: createNegotiation,
      findMany: vi.fn(async () =>
        businessIds.map((businessId) => ({ businessId })),
      ),
    },
    negotiationRun: {
      create: createRun,
      findFirst: vi.fn(async (query: { where: { status?: unknown } }) =>
        query.where.status === undefined
          ? input.previousStatus === null
            ? null
            : { id: "run-old", status: input.previousStatus }
          : input.activeRunId === undefined
            ? null
            : { id: input.activeRunId },
      ),
    },
    outboxEvent: { create: vi.fn(async () => ({ id: "outbox" })) },
    runEvent: { create: vi.fn(async () => ({ id: "event-1" })) },
  };
  const publishPending = vi.fn(async () => undefined);
  const service = new ProductService(
    {
      client: {
        $transaction: vi.fn(async (operation: unknown) =>
          (operation as (value: unknown) => Promise<unknown>)(
            transactionClient,
          ),
        ),
      },
    } as unknown as PrismaService,
    { value: { mode: "live" } } as RuntimeConfigService,
    {} as CurrentIdentityService,
    { publishPending } as unknown as OutboxDispatcherService,
  );
  Reflect.set(
    service,
    "findOwnedJob",
    vi.fn(async () => ({
      candidates: outerCandidates,
      id: "job-1",
      publicId: "RLY-TEST",
      runs: [],
    })),
  );
  Reflect.set(
    service,
    "requireConfirmedVersion",
    vi.fn(() => ({
      id: "version-1",
      sourceMetadata: { consent: { calling: true, recording: true } },
      version: 1,
    })),
  );
  Reflect.set(
    service,
    "getRun",
    vi.fn(async () => ({ id: "run-new" })),
  );

  return {
    createCall,
    createNegotiation,
    createRun,
    publishPending,
    service,
    updateCandidates,
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
