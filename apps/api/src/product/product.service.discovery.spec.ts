import { createHash } from "node:crypto";

import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { CurrentIdentityService } from "../auth/current-identity.service.js";
import type { RuntimeConfigService } from "../config/runtime-config.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { OutboxDispatcherService } from "../queue/outbox-dispatcher.service.js";
import { demoSpecification } from "./demo-fixtures.js";
import { ProductService } from "./product.service.js";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function jobFixture() {
  return {
    candidates: [{ businessId: "business-partial" }],
    confirmedAt: new Date("2026-07-20T10:00:00.000Z"),
    currency: "USD",
    evidence: [],
    id: "job-1",
    publicId: "RLY-TEST",
    runs: [],
    specification: demoSpecification,
    specificationVersions: [
      {
        confirmedAt: new Date("2026-07-20T10:00:00.000Z"),
        contentDigest: digest(demoSpecification),
        id: "version-1",
        sourceMetadata: {
          consent: { calling: true, recording: true },
          representedAs: "Relay Customer",
        },
        specification: demoSpecification,
        version: 1,
      },
    ],
    status: "FAILED",
    targetBudgetCents: 200_000,
    title: "Charlotte move",
    updatedAt: new Date("2026-07-20T10:00:00.000Z"),
    user: { profile: { representedAs: "Relay Customer" } },
  };
}

function createService(
  databaseClient: Record<string, unknown>,
  publishPending = vi.fn(async () => undefined),
) {
  return {
    publishPending,
    service: new ProductService(
      { client: databaseClient } as unknown as PrismaService,
      { value: { mode: "live" } } as RuntimeConfigService,
      {} as CurrentIdentityService,
      { publishPending } as unknown as OutboxDispatcherService,
    ),
  };
}

function overrideOwnedJob(service: ProductService, job = jobFixture()) {
  Reflect.set(
    service,
    "findOwnedJob",
    vi.fn(async () => job),
  );
  vi.spyOn(service, "getJob").mockResolvedValue({ publicId: job.publicId });
  Reflect.set(
    service,
    "recordAudit",
    vi.fn(async () => undefined),
  );
  return job;
}

describe("candidate invalidation", () => {
  it("removes candidates when the draft specification changes", async () => {
    const deleteCandidates = vi.fn(async () => ({ count: 3 }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      job: { update: vi.fn(async () => ({ id: "job-1" })) },
      jobBusiness: { deleteMany: deleteCandidates },
      negotiationRun: { findFirst: vi.fn(async () => null) },
    };
    const { service } = createService({
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
    });
    overrideOwnedJob(service);

    await service.updateDraft("RLY-TEST", {
      specification: {
        ...demoSpecification,
        notes: "Use the service elevator.",
      },
    });

    expect(deleteCandidates).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
    });
  });

  it("removes candidates when confirming a genuinely new specification version", async () => {
    const deleteCandidates = vi.fn(async () => ({ count: 3 }));
    const createVersion = vi.fn(async () => ({ id: "version-4" }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      job: { update: vi.fn(async () => ({ id: "job-1" })) },
      jobBusiness: { deleteMany: deleteCandidates },
      jobSpecificationVersion: {
        create: createVersion,
        findFirst: vi.fn(async () => ({ version: 3 })),
        findUnique: vi.fn(async () => null),
      },
      negotiationRun: { findFirst: vi.fn(async () => null) },
    };
    const { service } = createService({
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
    });
    overrideOwnedJob(service);

    await service.confirmJob("RLY-TEST", {
      callingConsent: true,
      recordingConsent: true,
    });

    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contentDigest: digest({
            representedAs: "Relay Customer",
            specification: demoSpecification,
          }),
          jobId: "job-1",
          sourceMetadata: expect.objectContaining({
            representedAs: "Relay Customer",
          }),
          version: 4,
        }),
      }),
    );
    expect(deleteCandidates).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
    });
  });

  it("requires a calling identity before creating a confirmed snapshot", async () => {
    const transaction = vi.fn();
    const { service } = createService({ $transaction: transaction });
    overrideOwnedJob(service, {
      ...jobFixture(),
      user: { profile: { representedAs: " " } },
    });

    await expect(
      service.confirmJob("RLY-TEST", {
        callingConsent: true,
        recordingConsent: true,
      }),
    ).rejects.toThrow(
      "Complete the calling identity in your profile before confirming this request.",
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it("reuses an identical historical snapshot as the current confirmation", async () => {
    const snapshotConfirmedAt = new Date("2026-07-18T10:00:00.000Z");
    const createVersion = vi.fn();
    const updateJob = vi.fn(async () => ({ id: "job-1" }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      job: { update: updateJob },
      jobBusiness: { deleteMany: vi.fn() },
      jobSpecificationVersion: {
        create: createVersion,
        findUnique: vi.fn(async () => ({
          confirmedAt: snapshotConfirmedAt,
          id: "version-existing",
        })),
      },
    };
    const { service } = createService({
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
    });
    overrideOwnedJob(service);

    await service.confirmJob("RLY-TEST", {
      callingConsent: true,
      recordingConsent: true,
    });

    expect(createVersion).not.toHaveBeenCalled();
    expect(updateJob).toHaveBeenCalledWith({
      data: { confirmedAt: snapshotConfirmedAt, status: "READY" },
      where: { id: "job-1" },
    });
  });

  it("uses the job confirmation pointer when identity snapshots share a specification", async () => {
    const currentConfirmedAt = new Date("2026-07-18T10:00:00.000Z");
    const { service } = createService({});
    Reflect.set(
      service,
      "findOwnedJob",
      vi.fn(async () => ({
        ...jobFixture(),
        confirmedAt: currentConfirmedAt,
        specificationVersions: [
          {
            confirmedAt: new Date("2026-07-19T10:00:00.000Z"),
            contentDigest: digest({
              representedAs: "New Relay Identity",
              specification: demoSpecification,
            }),
            id: "version-newer",
            sourceMetadata: { representedAs: "New Relay Identity" },
            specification: demoSpecification,
            version: 2,
          },
          {
            confirmedAt: currentConfirmedAt,
            contentDigest: digest({
              representedAs: "Relay Customer",
              specification: demoSpecification,
            }),
            id: "version-current",
            sourceMetadata: { representedAs: "Relay Customer" },
            specification: demoSpecification,
            version: 1,
          },
        ],
      })),
    );

    await expect(service.getJob("RLY-TEST")).resolves.toMatchObject({
      confirmedVersion: { id: "version-current", version: 1 },
    });
  });

  it("applies intake under the job lock and invalidates stale candidates", async () => {
    const deleteCandidates = vi.fn(async () => ({ count: 3 }));
    const updateJob = vi.fn(async () => ({ id: "job-1" }));
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      job: {
        findUnique: vi.fn(async () => ({ specification: demoSpecification })),
        update: updateJob,
      },
      jobBusiness: { deleteMany: deleteCandidates },
      negotiationRun: { findFirst: vi.fn(async () => null) },
    };
    const { service } = createService({
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
    });
    overrideOwnedJob(service);

    await service.applyIntakeExtraction(
      "RLY-TEST",
      {
        confidence: 0.9,
        facts: { notes: "Use the loading dock.", vertical: "moving" },
        sourceSummary: "Move details extracted from a document.",
        warnings: [],
      },
      {
        evidenceIds: ["evidence-1"],
        kind: "document",
        provider: "openai",
      },
    );

    expect(updateJob).toHaveBeenCalledWith({
      data: expect.objectContaining({
        confirmedAt: null,
        specification: expect.objectContaining({
          notes: "Use the loading dock.",
          vertical: "moving",
        }),
        status: "DRAFT",
      }),
      where: { id: "job-1" },
    });
    expect(deleteCandidates).toHaveBeenCalledWith({
      where: { jobId: "job-1" },
    });
  });

  it("rejects intake changes before mutation when a run is active", async () => {
    const deleteCandidates = vi.fn();
    const updateJob = vi.fn();
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      job: { findUnique: vi.fn(), update: updateJob },
      jobBusiness: { deleteMany: deleteCandidates },
      negotiationRun: {
        findFirst: vi.fn(async () => ({ id: "run-active" })),
      },
    };
    const { service } = createService({
      $transaction: vi.fn(async (operation: unknown) =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      ),
    });
    overrideOwnedJob(service);

    await expect(
      service.applyIntakeExtraction(
        "RLY-TEST",
        {
          confidence: 0.9,
          facts: { notes: "Use the loading dock.", vertical: "moving" },
          sourceSummary: "Move details extracted from a document.",
          warnings: [],
        },
        {
          evidenceIds: ["evidence-1"],
          kind: "document",
          provider: "openai",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transactionClient.job.findUnique).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
    expect(deleteCandidates).not.toHaveBeenCalled();
  });
});

describe("live discovery retries", () => {
  function setupDiscovery(options?: {
    activeRun?: boolean;
    candidateCount?: number;
  }) {
    const job = jobFixture();
    let currentStatus = "FAILED";
    let candidateCount = options?.candidateCount ?? 1;
    const deleteCandidates = vi.fn(async () => {
      candidateCount = 0;
      return { count: 1 };
    });
    const createOutbox = vi.fn(async (argument: unknown) => {
      void argument;
      return { id: "outbox-1" };
    });
    const transactionClient = {
      $queryRaw: vi.fn(async () => []),
      auditEvent: { create: vi.fn(async () => ({ id: "audit-1" })) },
      job: {
        findUnique: vi.fn(async () => ({
          confirmedAt: job.confirmedAt,
          specification: job.specification,
          status: currentStatus,
        })),
        update: vi.fn(async ({ data }: { data: { status: string } }) => {
          currentStatus = data.status;
          return { id: job.id };
        }),
      },
      jobBusiness: {
        count: vi.fn(async () => candidateCount),
        deleteMany: deleteCandidates,
      },
      negotiationRun: {
        findFirst: vi.fn(async () =>
          options?.activeRun ? { id: "run-active" } : null,
        ),
      },
      outboxEvent: { create: createOutbox },
    };
    let transactionTail = Promise.resolve<unknown>(undefined);
    const transaction = vi.fn((operation: unknown) => {
      const next = transactionTail.then(() =>
        (operation as (value: unknown) => Promise<unknown>)(transactionClient),
      );
      transactionTail = next.catch(() => undefined);
      return next;
    });
    const { publishPending, service } = createService({
      $transaction: transaction,
    });
    Reflect.set(
      service,
      "findOwnedJob",
      vi.fn(async () => job),
    );
    vi.spyOn(service, "getCandidates").mockResolvedValue({ items: [] });

    return {
      createOutbox,
      deleteCandidates,
      publishPending,
      service,
      setCandidateCount(value: number) {
        candidateCount = value;
      },
      setStatus(value: string) {
        currentStatus = value;
      },
    };
  }

  it("replaces partial candidates and uses a fresh idempotency key for each retry", async () => {
    const setup = setupDiscovery({ candidateCount: 1 });

    await setup.service.discoverBusinesses("RLY-TEST");
    setup.setStatus("FAILED");
    setup.setCandidateCount(2);
    await setup.service.discoverBusinesses("RLY-TEST");

    expect(setup.deleteCandidates).toHaveBeenCalledTimes(2);
    const keys = setup.createOutbox.mock.calls.map(
      ([argument]) =>
        (argument as { data: { idempotencyKey: string } }).data.idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(
      /^job:job-1:discovery:version-1:attempt:[0-9a-f-]+$/u,
    );
    expect(keys[1]).not.toBe(keys[0]);
    expect(setup.publishPending).toHaveBeenCalledTimes(2);
  });

  it("serializes concurrent requests so only one discovery job is enqueued", async () => {
    const setup = setupDiscovery({ candidateCount: 0 });

    await Promise.all([
      setup.service.discoverBusinesses("RLY-TEST"),
      setup.service.discoverBusinesses("RLY-TEST"),
    ]);

    expect(setup.createOutbox).toHaveBeenCalledTimes(1);
    expect(setup.publishPending).toHaveBeenCalledTimes(1);
  });

  it("does not replace candidates while a negotiation run is active", async () => {
    const setup = setupDiscovery({ activeRun: true, candidateCount: 2 });

    await expect(
      setup.service.discoverBusinesses("RLY-TEST"),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(setup.deleteCandidates).not.toHaveBeenCalled();
    expect(setup.createOutbox).not.toHaveBeenCalled();
    expect(setup.publishPending).not.toHaveBeenCalled();
  });
});
