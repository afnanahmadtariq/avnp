import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import {
  jobSpecificationSchema,
  type Business,
  type Quote,
} from "@relay/contracts";
import type { DatabaseClient, Prisma } from "@relay/database";
import { rankQuotes } from "@relay/domain";

// PrismaService must remain a runtime import for Nest dependency injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../database/prisma.service.js";
import {
  DEMO_JOB_ID,
  DEMO_JOB_PUBLIC_ID,
  DEMO_RUN_CORRELATION_ID,
  DEMO_RUN_ID,
  DEMO_SPECIFICATION_VERSION_ID,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
  FIXTURE_PROVIDER,
  demoBusinesses,
  demoMarket,
  demoProfile,
  demoRecordIds,
  demoSettings,
  demoSpecification,
} from "./demo-fixtures.js";
import type {
  ConfirmJobDto,
  CreateJobDto,
  CreateRunDto,
  SaveDecisionDto,
  UpdateDraftDto,
  UpdateProfileDto,
  UpdateSettingsDto,
} from "./product.dto.js";

const jobInclude = {
  candidates: {
    include: { business: true },
    orderBy: { discoveryRank: "asc" },
  },
  runs: {
    include: {
      decision: true,
      recommendation: { include: { bestQuote: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  specificationVersions: { orderBy: { version: "desc" } },
} satisfies Prisma.JobInclude;

const runInclude = {
  calls: {
    include: { business: true, evidence: true },
    orderBy: { createdAt: "asc" },
  },
  decision: true,
  events: { orderBy: { sequence: "asc" } },
  job: true,
  quotes: {
    include: { business: true, evidence: true, items: true },
    orderBy: { createdAt: "asc" },
  },
  recommendation: { include: { bestQuote: true } },
  specificationVersion: true,
} satisfies Prisma.NegotiationRunInclude;

type JobRecord = Prisma.JobGetPayload<{ include: typeof jobInclude }>;
type RunRecord = Prisma.NegotiationRunGetPayload<{
  include: typeof runInclude;
}>;
type RunQuoteRecord = RunRecord["quotes"][number];

const activeRunStatuses = [
  "QUEUED",
  "DISCOVERING",
  "CALLING",
  "PAUSED",
  "COMPARING",
] as const;
const terminalRunStatuses = new Set<string>([
  "CANCELLED",
  "COMPLETED",
  "FAILED",
  "PARTIALLY_COMPLETED",
]);

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

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

  return JSON.stringify(value);
}

function contentDigest(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function publicJobId(): string {
  return `RLY-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

function statusName(value: string): string {
  return value.toLowerCase();
}

function humanize(value: string): string {
  const words = value.replaceAll("_", " ").replaceAll(".", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function jsonStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") return [item];

    const record = asRecord(item);
    const description =
      asString(record.description) ?? asString(record.message);
    const code = asString(record.code);
    return description ? [description] : code ? [humanize(code)] : [];
  });
}

function presentQuote(quote: RunQuoteRecord): Record<string, unknown> {
  const terms = asRecord(quote.terms);

  return {
    arrivalWindow: asString(terms.arrivalWindow),
    businessId: quote.businessId,
    businessName: quote.business.name,
    confidence: Number(quote.confidence ?? 0),
    depositCents: quote.depositAmountCents ?? undefined,
    evidenceCount: quote.evidence.length,
    id: quote.id,
    inclusions: quote.items
      .filter((item) => item.includedInTotal)
      .map((item) => item.label),
    originalTotalCents: quote.originalAmountCents ?? undefined,
    riskFlags: jsonStringList(quote.riskFlags),
    savingsCents: quote.negotiatedSavingCents ?? 0,
    score: quote.score === null ? undefined : Number(quote.score),
    status: statusName(quote.status),
    totalCents: quote.totalAmountCents ?? 0,
  };
}

function presentRunMetrics(
  run: RunRecord,
  verifiedSavingsCents = run.recommendation?.savingsAmountCents ??
    Math.max(0, ...run.quotes.map((quote) => quote.negotiatedSavingCents ?? 0)),
): Record<string, number> {
  return {
    callsHandled: run.calls.length,
    completedQuotes: run.quotes.filter((quote) => quote.status === "FINAL")
      .length,
    timeAvoidedMinutes: Math.round(
      run.calls.reduce(
        (total, call) => total + (call.durationSeconds ?? 0),
        0,
      ) / 60,
    ),
    verifiedSavingsCents,
  };
}

function runEventMessage(eventType: string, payload: unknown): string {
  const record = asRecord(payload);
  const explicitMessage = asString(record.message);
  if (explicitMessage) return explicitMessage;

  switch (eventType) {
    case "run.created":
      return "Relay started the negotiation run.";
    case "run.status_changed":
      return `Run status changed to ${asString(record.status) ?? "the next stage"}.`;
    case "run.paused":
      return "Calls were paused by the customer.";
    case "run.resumed":
      return "Relay resumed the remaining calls.";
    case "run.cancelled":
      return "The negotiation run was cancelled.";
    case "call.completed":
      return "A business call completed and its evidence was saved.";
    case "recommendation.ready":
      return "The evidence-backed recommendation is ready.";
    case "decision.saved":
      return "Your quote decision was saved.";
    default:
      return `${humanize(eventType)}.`;
  }
}

function specificationRoute(specification: unknown): {
  destination: string;
  pickup: string;
} {
  const record = asRecord(specification);
  const pickup = asRecord(record.pickupAddress);
  const destination = asRecord(record.dropoffAddress);

  return {
    destination:
      asString(destination.formattedAddress) ?? "Destination not set",
    pickup: asString(pickup.formattedAddress) ?? "Pickup not set",
  };
}

function consentFromVersion(version: {
  readonly sourceMetadata: Prisma.JsonValue | null;
}): { calling: boolean; recording: boolean } {
  const metadata = asRecord(version.sourceMetadata);
  const consent = asRecord(metadata.consent);

  return {
    calling: asBoolean(consent.calling),
    recording: asBoolean(consent.recording),
  };
}

function quoteFeeCategory(value: string): Quote["fees"][number]["category"] {
  const supported = new Set<Quote["fees"][number]["category"]>([
    "access",
    "administrative",
    "coverage",
    "labor",
    "materials",
    "other",
    "special_handling",
    "tax",
    "transportation",
  ]);

  return supported.has(value as Quote["fees"][number]["category"])
    ? (value as Quote["fees"][number]["category"])
    : "other";
}

function toContractQuote(quote: RunQuoteRecord): Quote {
  const transcript = quote.evidence.find(
    (evidence) => evidence.kind === "TRANSCRIPT",
  );

  return {
    businessId: quote.businessId,
    capturedAt: quote.createdAt.toISOString(),
    confidence: Number(quote.confidence ?? 0.75),
    discount:
      quote.negotiatedSavingCents && quote.negotiatedSavingCents > 0
        ? {
            amountMinor: quote.negotiatedSavingCents,
            currency: quote.currency,
          }
        : undefined,
    estimateType:
      quote.estimateType === "NON_BINDING" ? "non_binding" : "binding",
    evidence: transcript
      ? {
          callId: quote.callId ?? undefined,
          source: "phone_call",
          transcriptKey: transcript.storageKey,
        }
      : undefined,
    fees: quote.items.map((item) => ({
      amount:
        item.totalAmountCents === null
          ? null
          : {
              amountMinor: item.totalAmountCents,
              currency: quote.currency,
            },
      category: quoteFeeCategory(item.category),
      code: item.feeCode ?? `line-${item.lineNumber}`,
      disclosed: item.disclosed,
      includedInTotal: item.includedInTotal,
      label: item.label,
      required: item.required,
    })),
    id: quote.id,
    jobId: quote.jobId,
    pricingModel: statusName(quote.pricingModel) as Quote["pricingModel"],
    status: statusName(quote.status) as Quote["status"],
    terms:
      quote.depositAmountCents === null
        ? undefined
        : {
            deposit: {
              amountMinor: quote.depositAmountCents,
              currency: quote.currency,
            },
          },
    totalPrice: {
      amountMinor: quote.totalAmountCents ?? 0,
      currency: quote.currency,
    },
  };
}

@Injectable()
export class ProductService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProductService.name);

  constructor(private readonly prisma: PrismaService) {}

  private get database(): DatabaseClient {
    return this.prisma.client;
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.prisma.configured || process.env.NODE_ENV === "production") {
      return;
    }

    try {
      await this.seedDeterministicFixtures();
      this.logger.log("Deterministic Relay fixture market is ready");
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Fixture seed skipped: ${detail}`);
    }
  }

  async listJobs(): Promise<{ items: unknown[]; mode: "fixture" }> {
    const user = await this.ensureDemoUser();
    const jobs = await this.database.job.findMany({
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
      where: { userId: user.id },
    });

    return {
      items: jobs.map((job) => this.presentJobSummary(job)),
      mode: "fixture",
    };
  }

  async createJob(dto: CreateJobDto): Promise<unknown> {
    const user = await this.ensureDemoUser();
    const specification = dto.specification ?? { vertical: "moving" };
    const job = await this.database.job.create({
      data: {
        currency: dto.specification?.budget?.currency ?? "USD",
        publicId: publicJobId(),
        specification: toJson(specification),
        targetBudgetCents: dto.specification?.budget?.amountMinor ?? null,
        title: dto.title?.trim() || "Moving request",
        userId: user.id,
        vertical: "moving",
      },
    });

    await this.recordAudit(job.id, "job.created", {
      provider: FIXTURE_PROVIDER,
    });

    return this.getJob(job.publicId);
  }

  async getJob(publicId: string): Promise<unknown> {
    const job = await this.findOwnedJob(publicId);
    return this.presentJobDetails(job);
  }

  async updateDraft(publicId: string, dto: UpdateDraftDto): Promise<unknown> {
    if (!dto.specification && !dto.title) {
      throw new BadRequestException("Provide at least one draft change.");
    }

    const job = await this.findOwnedJob(publicId);
    const activeRun = job.runs.find((run) =>
      activeRunStatuses.includes(
        run.status as (typeof activeRunStatuses)[number],
      ),
    );

    if (activeRun) {
      throw new ConflictException(
        "The brief cannot change while a negotiation run is active.",
      );
    }

    const specification = dto.specification ?? job.specification;

    await this.database.job.update({
      data: {
        confirmedAt: null,
        currency: dto.specification?.budget?.currency ?? job.currency,
        specification: toJson(specification),
        status: "DRAFT",
        targetBudgetCents:
          dto.specification?.budget?.amountMinor ?? job.targetBudgetCents,
        title: dto.title?.trim() || job.title,
      },
      where: { id: job.id },
    });
    await this.recordAudit(job.id, "job.draft.updated", {
      priorConfirmedVersions: job.specificationVersions.length,
    });

    return this.getJob(publicId);
  }

  async confirmJob(publicId: string, dto: ConfirmJobDto): Promise<unknown> {
    const job = await this.findOwnedJob(publicId);
    const parsed = jobSpecificationSchema.safeParse(job.specification);

    if (!parsed.success) {
      throw new BadRequestException({
        error: "invalid_specification",
        issues: parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.join("."),
        })),
        message: "Complete the moving brief before confirming it.",
      });
    }

    const digest = contentDigest(parsed.data);
    const existing = job.specificationVersions.find(
      (version) => version.contentDigest === digest,
    );
    const confirmedAt = new Date();

    if (!existing) {
      const nextVersion = (job.specificationVersions[0]?.version ?? 0) + 1;
      await this.database.jobSpecificationVersion.create({
        data: {
          confirmedAt,
          contentDigest: digest,
          jobId: job.id,
          sourceMetadata: toJson({
            consent: {
              calling: dto.callingConsent,
              recording: dto.recordingConsent,
            },
            fixtureMode: true,
            source: "guided_form",
          }),
          specification: toJson(parsed.data),
          version: nextVersion,
        },
      });
    }

    await this.database.job.update({
      data: { confirmedAt, status: "READY" },
      where: { id: job.id },
    });
    await this.recordAudit(job.id, "job.specification.confirmed", {
      callingConsent: true,
      contentDigest: digest,
      recordingConsent: true,
    });

    return this.getJob(publicId);
  }

  async discoverBusinesses(publicId: string): Promise<unknown> {
    const job = await this.findOwnedJob(publicId);
    this.requireConfirmedVersion(job);

    await this.database.job.update({
      data: { status: "DISCOVERING" },
      where: { id: job.id },
    });
    await this.ensureFixtureCandidates(job.id);
    await this.database.job.update({
      data: { status: "READY" },
      where: { id: job.id },
    });
    await this.recordAudit(job.id, "business.discovery.completed", {
      candidateCount: demoBusinesses.length,
      provider: FIXTURE_PROVIDER,
    });

    return this.getCandidates(publicId);
  }

  async getCandidates(publicId: string): Promise<unknown> {
    const job = await this.findOwnedJob(publicId);

    return {
      items: job.candidates.map((candidate) => {
        const verification = asRecord(candidate.business.verification);
        return {
          distanceMiles: Number(verification.distanceMiles ?? 0),
          id: candidate.business.id,
          location:
            asString(asRecord(candidate.business.address).formattedAddress) ??
            "Location unavailable",
          name: candidate.business.name,
          phone: candidate.business.phone,
          rating:
            candidate.business.rating === null
              ? null
              : Number(candidate.business.rating),
          reviewCount: candidate.business.reviewCount,
          selected: candidate.status === "SHORTLISTED",
          source: FIXTURE_PROVIDER,
          status: statusName(candidate.status),
        };
      }),
      jobPublicId: job.publicId,
      mode: "fixture",
    };
  }

  async createRun(publicId: string, dto: CreateRunDto): Promise<unknown> {
    const job = await this.findOwnedJob(publicId);
    const version = this.requireConfirmedVersion(job);
    const consent = consentFromVersion(version);

    if (!consent.calling || !consent.recording) {
      throw new ConflictException(
        "Calling and recording consent must be confirmed before calls start.",
      );
    }

    const selectedIds = [...new Set(dto.businessIds)];
    const selectedCandidates = job.candidates.filter((candidate) =>
      selectedIds.includes(candidate.businessId),
    );

    if (selectedCandidates.length !== selectedIds.length) {
      throw new BadRequestException(
        "Every selected business must belong to this job's discovered candidates.",
      );
    }

    if (selectedCandidates.length < 3) {
      throw new BadRequestException("Select at least three businesses.");
    }

    await this.database.jobBusiness.updateMany({
      data: { status: "SHORTLISTED" },
      where: { businessId: { in: selectedIds }, jobId: job.id },
    });

    const run = await this.createFixtureRun(
      job.id,
      version.id,
      selectedCandidates.map((candidate) => candidate.businessId),
      `fixture-${job.publicId}-${version.version}-${randomUUID()}`,
    );

    return this.getRun(run.id);
  }

  async getRun(runId: string): Promise<unknown> {
    const run = await this.findOwnedRun(runId);
    return this.presentRun(run);
  }

  async getRunEvents(
    runId: string,
    after = 0,
  ): Promise<{ items: unknown[]; runId: string; sequence: number }> {
    await this.findOwnedRun(runId);
    const events = await this.database.runEvent.findMany({
      orderBy: { sequence: "asc" },
      where: { runId, sequence: { gt: after } },
    });

    return {
      items: events.map((event) => ({
        actor: statusName(event.actor),
        at: event.occurredAt.toISOString(),
        callId: asString(asRecord(event.payload).callId),
        id: event.id,
        message: runEventMessage(event.eventType, event.payload),
        payload: event.payload,
        sequence: event.sequence,
        type: event.eventType,
      })),
      runId,
      sequence: events.at(-1)?.sequence ?? after,
    };
  }

  async pauseRun(runId: string): Promise<unknown> {
    const run = await this.findOwnedRun(runId);

    if (terminalRunStatuses.has(run.status) || run.status === "PAUSED") {
      throw new ConflictException(
        `Run ${run.id} cannot be paused from ${statusName(run.status)}.`,
      );
    }

    await this.database.negotiationRun.update({
      data: {
        pauseReason: "Paused by customer",
        pausedAt: new Date(),
        status: "PAUSED",
      },
      where: { id: run.id },
    });
    await this.appendRunEvent(run.id, "run.paused", "USER", {
      reason: "Paused by customer",
    });
    return this.getRun(run.id);
  }

  async resumeRun(runId: string): Promise<unknown> {
    const run = await this.findOwnedRun(runId);

    if (run.status !== "PAUSED") {
      throw new ConflictException(
        `Run ${run.id} can only resume from paused state.`,
      );
    }

    await this.database.negotiationRun.update({
      data: { pauseReason: null, pausedAt: null, status: "CALLING" },
      where: { id: run.id },
    });
    await this.appendRunEvent(run.id, "run.resumed", "USER", {});
    return this.getRun(run.id);
  }

  async cancelRun(runId: string): Promise<unknown> {
    const run = await this.findOwnedRun(runId);

    if (terminalRunStatuses.has(run.status)) {
      throw new ConflictException(
        `Run ${run.id} cannot be cancelled from ${statusName(run.status)}.`,
      );
    }

    const cancelledAt = new Date();
    await this.database.negotiationRun.update({
      data: { cancelledAt, status: "CANCELLED" },
      where: { id: run.id },
    });
    await this.database.call.updateMany({
      data: { endedAt: cancelledAt, status: "CANCELLED" },
      where: {
        runId: run.id,
        status: { in: ["DIALING", "IN_PROGRESS", "NEGOTIATING", "QUEUED"] },
      },
    });
    await this.database.job.update({
      data: { status: "CANCELLED" },
      where: { id: run.jobId },
    });
    await this.appendRunEvent(run.id, "run.cancelled", "USER", {});
    return this.getRun(run.id);
  }

  async getReport(runId: string): Promise<unknown> {
    const run = await this.findOwnedRun(runId);

    if (run.quotes.length === 0) {
      throw new ConflictException("A report is not ready until quotes exist.");
    }

    const report = await this.buildAndPersistReport(run);
    return report;
  }

  async saveDecision(runId: string, dto: SaveDecisionDto): Promise<unknown> {
    const run = await this.findOwnedRun(runId);
    const quote = run.quotes.find((candidate) => candidate.id === dto.quoteId);

    if (!quote) {
      throw new BadRequestException(
        "The selected quote does not belong to this negotiation run.",
      );
    }

    const report = await this.buildAndPersistReport(run);
    const recommendation = await this.database.recommendation.findUnique({
      where: { runId: run.id },
    });

    if (!recommendation) {
      throw new ConflictException("The recommendation is not ready.");
    }

    const decidedAt = new Date();
    const decision = await this.database.decision.upsert({
      create: {
        decidedAt,
        note: dto.note ?? null,
        outcome: "QUOTE_SELECTED",
        recommendationId: recommendation.id,
        runId: run.id,
        selectedQuoteId: quote.id,
      },
      update: {
        decidedAt,
        note: dto.note ?? null,
        outcome: "QUOTE_SELECTED",
        recommendationId: recommendation.id,
        selectedQuoteId: quote.id,
      },
      where: { runId: run.id },
    });
    await this.appendRunEvent(run.id, "decision.saved", "USER", {
      quoteId: quote.id,
    });

    return {
      decidedAt: decision.decidedAt.toISOString(),
      mode: "fixture",
      quoteId: quote.id,
      recommendation: report.recommendation,
      saved: true,
      savedAt: decision.decidedAt.toISOString(),
    };
  }

  async getProfile(): Promise<unknown> {
    const user = await this.ensureDemoUser();
    return {
      ...demoProfile,
      ...asRecord(user.profile),
      displayName: user.displayName ?? demoProfile.displayName,
      email: user.email ?? demoProfile.email,
      id: user.id,
      mode: "fixture",
      name: user.displayName ?? demoProfile.displayName,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateProfile(dto: UpdateProfileDto): Promise<unknown> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("Provide at least one profile change.");
    }

    const user = await this.ensureDemoUser();

    if (dto.email && dto.email !== user.email) {
      const existing = await this.database.user.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== user.id) {
        throw new ConflictException("That email is already in use.");
      }
    }

    const displayName = dto.displayName ?? dto.name ?? user.displayName;
    const profileChanges = { ...dto };
    delete profileChanges.name;
    const profile = {
      ...demoProfile,
      ...asRecord(user.profile),
      ...profileChanges,
      displayName,
    };
    await this.database.user.update({
      data: {
        displayName,
        email: dto.email ?? user.email,
        profile: toJson(profile),
      },
      where: { id: user.id },
    });
    return this.getProfile();
  }

  async getSettings(): Promise<unknown> {
    const user = await this.ensureDemoUser();
    const stored = asRecord(user.settings);
    const evidenceRetentionDays =
      typeof stored.evidenceRetentionDays === "number"
        ? stored.evidenceRetentionDays
        : typeof stored.retentionDays === "number"
          ? stored.retentionDays
          : demoSettings.evidenceRetentionDays;
    const recordingConsentDefault =
      typeof stored.recordingConsentDefault === "boolean"
        ? stored.recordingConsentDefault
        : typeof stored.recordingConsent === "boolean"
          ? stored.recordingConsent
          : demoSettings.recordingConsentDefault;

    return {
      ...demoSettings,
      ...stored,
      aiDisclosure: true,
      evidenceRetentionDays,
      mode: "fixture",
      recordingConsent: recordingConsentDefault,
      recordingConsentDefault,
      retentionDays: evidenceRetentionDays,
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<unknown> {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException("Provide at least one settings change.");
    }

    const user = await this.ensureDemoUser();
    const { recordingConsent, retentionDays, ...canonicalChanges } = dto;
    const settings = {
      ...demoSettings,
      ...asRecord(user.settings),
      ...canonicalChanges,
      aiDisclosure: true,
      evidenceRetentionDays:
        dto.evidenceRetentionDays ??
        retentionDays ??
        demoSettings.evidenceRetentionDays,
      recordingConsentDefault:
        dto.recordingConsentDefault ??
        recordingConsent ??
        demoSettings.recordingConsentDefault,
    };
    await this.database.user.update({
      data: { settings: toJson(settings) },
      where: { id: user.id },
    });
    return this.getSettings();
  }

  async exportAccount(): Promise<unknown> {
    const [profile, settings, jobs] = await Promise.all([
      this.getProfile(),
      this.getSettings(),
      this.listJobs(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      jobs: jobs.items,
      kind: "relay-fixture-account-export",
      profile,
      settings,
      version: 1,
    };
  }

  private async ensureDemoUser() {
    return this.database.user.upsert({
      create: {
        id: DEMO_USER_ID,
        displayName: demoProfile.displayName,
        email: DEMO_USER_EMAIL,
        profile: toJson(demoProfile),
        settings: toJson(demoSettings),
      },
      update: {},
      where: { email: DEMO_USER_EMAIL },
    });
  }

  private async findOwnedJob(publicId: string): Promise<JobRecord> {
    const user = await this.ensureDemoUser();
    const job = await this.database.job.findFirst({
      include: jobInclude,
      where: { publicId, userId: user.id },
    });

    if (!job) {
      throw new NotFoundException(`Job ${publicId} was not found.`);
    }

    return job;
  }

  private async findOwnedRun(runId: string): Promise<RunRecord> {
    const user = await this.ensureDemoUser();
    const run = await this.database.negotiationRun.findFirst({
      include: runInclude,
      where: { id: runId, job: { userId: user.id } },
    });

    if (!run) {
      throw new NotFoundException(`Negotiation run ${runId} was not found.`);
    }

    return run;
  }

  private requireConfirmedVersion(job: JobRecord) {
    const version = job.specificationVersions[0];

    if (!version || !job.confirmedAt) {
      throw new ConflictException(
        "Confirm the current specification before continuing.",
      );
    }

    return version;
  }

  private presentJobSummary(job: JobRecord): Record<string, unknown> {
    const latestRun = job.runs[0];
    const bestQuote = latestRun?.recommendation?.bestQuote;
    const specification = job.specification;
    const route = specificationRoute(specification);

    return {
      bestOfferCents: bestQuote?.totalAmountCents ?? null,
      movingDate: asString(asRecord(specification).movingDate) ?? null,
      nextAction: this.nextAction(job, latestRun?.status),
      publicId: job.publicId,
      route,
      savingsCents: latestRun?.recommendation?.savingsAmountCents ?? null,
      stage: latestRun ? statusName(latestRun.status) : statusName(job.status),
      status: statusName(job.status),
      title: job.title,
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  private presentJobDetails(job: JobRecord): unknown {
    const latestVersion = job.specificationVersions[0];
    const latestRun = job.runs[0];
    const consent = latestVersion
      ? consentFromVersion(latestVersion)
      : { calling: false, recording: false };

    return {
      ...this.presentJobSummary(job),
      candidateCount: job.candidates.length,
      confirmedVersion: latestVersion
        ? {
            confirmedAt: latestVersion.confirmedAt.toISOString(),
            digest: latestVersion.contentDigest,
            id: latestVersion.id,
            version: latestVersion.version,
          }
        : null,
      consent,
      draft: job.specification,
      latestRunId: latestRun?.id ?? null,
      mode: "fixture",
    };
  }

  private nextAction(job: JobRecord, runStatus?: string): string {
    if (!job.confirmedAt) return "review_and_confirm";
    if (job.candidates.length < 3) return "discover_businesses";
    if (!runStatus) return "approve_and_start";
    if (runStatus === "COMPLETED") return "review_report";
    if (runStatus === "PAUSED") return "resume_or_cancel";
    return "follow_run";
  }

  private async ensureFixtureCandidates(jobId: string): Promise<void> {
    for (const [index, fixture] of demoBusinesses.entries()) {
      const business = await this.database.business.upsert({
        create: {
          address: toJson({ formattedAddress: fixture.address }),
          externalId: fixture.externalId,
          id: fixture.id,
          name: fixture.name,
          phone: fixture.phone,
          provider: FIXTURE_PROVIDER,
          rating: fixture.rating,
          reviewCount: fixture.reviewCount,
          verification: toJson({
            distanceMiles: fixture.distanceMiles,
            fixture: true,
          }),
        },
        update: {
          address: toJson({ formattedAddress: fixture.address }),
          name: fixture.name,
          phone: fixture.phone,
          rating: fixture.rating,
          reviewCount: fixture.reviewCount,
        },
        where: { id: fixture.id },
      });
      await this.database.jobBusiness.upsert({
        create: {
          businessId: business.id,
          discoveryRank: index + 1,
          jobId,
          relevanceScore: 96 - index * 4,
          status: "DISCOVERED",
        },
        update: {
          discoveryRank: index + 1,
          relevanceScore: 96 - index * 4,
        },
        where: { jobId_businessId: { businessId: business.id, jobId } },
      });
    }
  }

  private async createFixtureRun(
    jobId: string,
    specificationVersionId: string,
    businessIds: readonly string[],
    correlationId: string,
  ) {
    const deterministic = correlationId === DEMO_RUN_CORRELATION_ID;
    const now = deterministic
      ? new Date("2026-07-19T10:01:00.000Z")
      : new Date();
    const run = await this.database.negotiationRun.create({
      data: {
        ...(deterministic ? { id: DEMO_RUN_ID } : {}),
        aiDisclosureAcknowledgedAt: now,
        callingConsentAt: now,
        consentVersion: "fixture-consent-v1",
        correlationId,
        jobId,
        recordingConsentAt: now,
        specificationVersionId,
        startedAt: now,
        status: "QUEUED",
      },
    });
    await this.appendRunEvent(run.id, "run.created", "API", {
      businessCount: businessIds.length,
      provider: FIXTURE_PROVIDER,
    });
    await this.database.negotiationRun.update({
      data: { status: "CALLING" },
      where: { id: run.id },
    });
    await this.database.job.update({
      data: { status: "CALLING" },
      where: { id: jobId },
    });

    for (const [index, businessId] of businessIds.entries()) {
      await this.seedFixtureOutcome(
        run.id,
        jobId,
        businessId,
        index,
        deterministic,
      );
    }

    const completedAt = deterministic
      ? new Date("2026-07-19T10:20:00.000Z")
      : new Date();
    await this.database.negotiationRun.update({
      data: { completedAt, status: "COMPLETED" },
      where: { id: run.id },
    });
    await this.database.job.update({
      data: { completedAt, status: "COMPLETED" },
      where: { id: jobId },
    });
    await this.appendRunEvent(run.id, "run.status_changed", "WORKER", {
      provider: FIXTURE_PROVIDER,
      status: "completed",
    });
    const completeRun = await this.findRunInternal(run.id);
    await this.buildAndPersistReport(completeRun);
    await this.appendRunEvent(run.id, "recommendation.ready", "WORKER", {});

    return run;
  }

  private async seedFixtureOutcome(
    runId: string,
    jobId: string,
    businessId: string,
    index: number,
    deterministic: boolean,
  ): Promise<void> {
    const market = demoMarket[index % demoMarket.length];

    if (!market) {
      throw new Error("Fixture market is empty.");
    }

    const startedAt = deterministic
      ? new Date(Date.parse("2026-07-19T10:04:00.000Z") + index * 2 * 60_000)
      : new Date(Date.now() - (index + 1) * 120_000);
    const endedAt = new Date(startedAt.getTime() + 180_000);
    const negotiationId = demoRecordIds.negotiations[index];
    const callId = demoRecordIds.calls[index];
    const quoteId = demoRecordIds.quotes[index];
    const evidenceId = demoRecordIds.evidence[index];
    const negotiation = await this.database.negotiation.create({
      data: {
        ...(deterministic && negotiationId ? { id: negotiationId } : {}),
        businessId,
        currentRound: 2,
        endedAt,
        finalAmountCents: market.currentOfferCents,
        jobId,
        metadata: toJson({ fixture: true }),
        runId,
        savingsAmountCents: market.initialOfferCents - market.currentOfferCents,
        startingAmountCents: market.initialOfferCents,
        startedAt,
        status:
          market.currentOfferCents < market.initialOfferCents
            ? "IMPROVED"
            : "UNCHANGED",
        strategy: market.strategy,
      },
    });
    const call = await this.database.call.create({
      data: {
        ...(deterministic && callId ? { id: callId } : {}),
        aiDisclosureMadeAt: startedAt,
        businessId,
        durationSeconds: 180,
        endedAt,
        jobId,
        negotiationId: negotiation.id,
        provider: FIXTURE_PROVIDER,
        providerCallId: `${runId}-${businessId}`,
        recordingConsentAt: startedAt,
        runId,
        startedAt,
        status: "COMPLETED",
        structuredOutcome: toJson({ outcome: "quote_received" }),
        transcriptText: market.transcript,
      },
    });
    const quote = await this.database.quote.create({
      data: {
        ...(deterministic && quoteId ? { id: quoteId } : {}),
        businessId,
        callId: call.id,
        completeness: market.estimateType === "BINDING" ? 1 : 0.8,
        confidence: 0.94 - index * 0.03,
        currency: "USD",
        depositAmountCents: market.depositCents,
        estimateType: market.estimateType,
        jobId,
        negotiatedSavingCents:
          market.initialOfferCents - market.currentOfferCents,
        negotiationId: negotiation.id,
        originalAmountCents: market.initialOfferCents,
        pricingModel: "FIXED",
        runId,
        status: "FINAL",
        terms: toJson({
          arrivalWindow: index === 0 ? "8:00–9:00 AM" : "9:00 AM–12:00 PM",
          fixture: true,
        }),
        totalAmountCents: market.currentOfferCents,
      },
    });
    const materials = index === 0 ? 18_000 : 12_000;
    const transportation = index === 0 ? 0 : 6_000;
    const labor = market.currentOfferCents - materials - transportation;
    const items: Array<{
      category: string;
      code: string;
      label: string;
      total: number | null;
    }> = [
      { category: "labor", code: "labor", label: "Labor", total: labor },
      {
        category: "materials",
        code: "materials",
        label: "Materials",
        total: materials,
      },
      {
        category: "transportation",
        code: "transportation",
        label: "Fuel and mileage",
        total: transportation,
      },
    ];

    if (market.estimateType === "NON_BINDING") {
      items.push({
        category: "access",
        code: "possible_access_fee",
        label: "Possible access fee",
        total: null,
      });
    }

    for (const [lineIndex, item] of items.entries()) {
      await this.database.quoteItem.create({
        data: {
          ...(deterministic && quoteId
            ? { id: `${quoteId}-item-${item.code}` }
            : {}),
          category: item.category,
          disclosed: true,
          feeCode: item.code,
          includedInTotal: item.total !== null,
          label: item.label,
          lineNumber: lineIndex + 1,
          quoteId: quote.id,
          required: item.total !== null,
          totalAmountCents: item.total,
        },
      });
    }

    await this.database.evidence.create({
      data: {
        ...(deterministic && evidenceId ? { id: evidenceId } : {}),
        callId: call.id,
        contentType: "text/plain",
        jobId,
        kind: "TRANSCRIPT",
        metadata: toJson({ fixture: true }),
        provider: FIXTURE_PROVIDER,
        quoteId: quote.id,
        retentionUntil: new Date(endedAt.getTime() + 30 * 86_400_000),
        runId,
        storageKey: `fixtures/${runId}/${call.id}/transcript.txt`,
      },
    });
    await this.appendRunEvent(runId, "call.completed", "PROVIDER", {
      businessId,
      callId: call.id,
      outcome: "quote_received",
      quoteId: quote.id,
    });
  }

  private async findRunInternal(runId: string): Promise<RunRecord> {
    const run = await this.database.negotiationRun.findUnique({
      include: runInclude,
      where: { id: runId },
    });

    if (!run) throw new NotFoundException(`Run ${runId} was not found.`);
    return run;
  }

  private async buildAndPersistReport(run: RunRecord) {
    const candidates = run.quotes.map((quote) => ({
      business: {
        rating:
          quote.business.rating === null
            ? undefined
            : Number(quote.business.rating),
        reviewCount: quote.business.reviewCount ?? undefined,
      } satisfies Pick<Business, "rating" | "reviewCount">,
      quote: toContractQuote(quote),
    }));
    const rankings = rankQuotes(candidates, {
      expectedFeeCodes: ["labor", "materials", "transportation"],
      requireEvidence: true,
    });
    const quoteById = new Map(run.quotes.map((quote) => [quote.id, quote]));
    const bestRanking = rankings[0];
    const bestQuote = bestRanking
      ? quoteById.get(bestRanking.quoteId)
      : undefined;
    const savings = bestQuote
      ? Math.max(
          0,
          (bestQuote.originalAmountCents ?? bestQuote.totalAmountCents ?? 0) -
            (bestQuote.totalAmountCents ?? 0),
        )
      : 0;
    const explanation = bestQuote
      ? `${bestQuote.business.name} is the strongest verified value after price, fee completeness, confidence, reputation, and risk checks.`
      : "No eligible quote is available.";

    await Promise.all(
      rankings.map((ranking) =>
        this.database.quote.update({
          data: {
            riskFlags: toJson(ranking.redFlags),
            score: ranking.totalScore,
          },
          where: { id: ranking.quoteId },
        }),
      ),
    );
    const recommendation = await this.database.recommendation.upsert({
      create: {
        ...(run.id === DEMO_RUN_ID ? { id: "demo-recommendation" } : {}),
        bestQuoteId: bestQuote?.id ?? null,
        configurationVersion: run.configurationVersion,
        currency: bestQuote?.currency ?? "USD",
        explanation,
        factors: toJson(rankings),
        policyVersion: "quote-ranking-v1",
        rankedQuoteIds: toJson(rankings.map((ranking) => ranking.quoteId)),
        runId: run.id,
        savingsAmountCents: savings,
      },
      update: {
        bestQuoteId: bestQuote?.id ?? null,
        explanation,
        factors: toJson(rankings),
        rankedQuoteIds: toJson(rankings.map((ranking) => ranking.quoteId)),
        savingsAmountCents: savings,
      },
      where: { runId: run.id },
    });

    return {
      decision: run.decision
        ? {
            decidedAt: run.decision.decidedAt.toISOString(),
            outcome: statusName(run.decision.outcome),
            quoteId: run.decision.selectedQuoteId,
            savedAt: run.decision.decidedAt.toISOString(),
          }
        : null,
      metrics: presentRunMetrics(run, savings),
      mode: "fixture",
      rankedOffers: rankings.flatMap((ranking) => {
        const quote = quoteById.get(ranking.quoteId);
        if (!quote) return [];

        const riskFlags = ranking.redFlags.map((flag) => flag.message);
        return [
          {
            ...presentQuote(quote),
            rank: ranking.rank,
            rationale:
              ranking.rank === 1
                ? "Strongest verified value across price, completeness, confidence, reputation, and risk."
                : `Ranked ${ranking.rank} after comparing the same confirmed scope.`,
            riskFlags,
            score: ranking.totalScore,
          },
        ];
      }),
      recommendation: {
        businessName: bestQuote?.business.name ?? "No verified business",
        confidence: Math.min(1, (bestRanking?.totalScore ?? 0) / 100),
        explanation: recommendation.explanation,
        quoteId: bestQuote?.id ?? "",
        rationale: bestRanking
          ? `Ranked first with a ${bestRanking.totalScore} evidence-weighted score and attached call evidence.`
          : "No eligible quote is available.",
        savingsCents: recommendation.savingsAmountCents ?? 0,
        totalCents: bestQuote?.totalAmountCents ?? 0,
      },
      runId: run.id,
      status: statusName(run.status),
    };
  }

  private presentRun(run: RunRecord): unknown {
    return {
      calls: run.calls.map((call) => {
        const quote = run.quotes.find((item) => item.callId === call.id);

        return {
          businessId: call.businessId,
          businessName: call.business.name,
          currentOfferCents: quote?.totalAmountCents ?? undefined,
          evidence: call.evidence.map(
            (evidence) => `${humanize(statusName(evidence.kind))} evidence`,
          ),
          id: call.id,
          initialOfferCents: quote?.originalAmountCents ?? undefined,
          outcome: asString(asRecord(call.structuredOutcome).outcome) ?? null,
          progress: call.status === "COMPLETED" ? 100 : 50,
          status: statusName(call.status),
          transcript: call.transcriptText ?? "",
        };
      }),
      decision: run.decision
        ? {
            decidedAt: run.decision.decidedAt.toISOString(),
            quoteId: run.decision.selectedQuoteId,
          }
        : null,
      id: run.id,
      jobPublicId: run.job.publicId,
      metrics: presentRunMetrics(run),
      mode: "fixture",
      paused: run.status === "PAUSED",
      quotes: run.quotes.map((quote) => presentQuote(quote)),
      specificationVersion: {
        id: run.specificationVersion.id,
        version: run.specificationVersion.version,
      },
      stage: statusName(run.status),
      status: statusName(run.status),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private async appendRunEvent(
    runId: string,
    eventType: string,
    actor: "API" | "PROVIDER" | "SYSTEM" | "USER" | "WORKER",
    payload: unknown,
  ): Promise<void> {
    const lastEvent = await this.database.runEvent.findFirst({
      orderBy: { sequence: "desc" },
      where: { runId },
    });
    const run = await this.database.negotiationRun.findUnique({
      select: { correlationId: true },
      where: { id: runId },
    });

    if (!run) throw new NotFoundException(`Run ${runId} was not found.`);

    const sequence = (lastEvent?.sequence ?? 0) + 1;
    await this.database.runEvent.create({
      data: {
        actor,
        correlationId: run.correlationId,
        eventType,
        id: `${runId}-event-${sequence}`,
        occurredAt: new Date(),
        payload: toJson(payload),
        runId,
        sequence,
      },
    });
  }

  private async recordAudit(
    jobId: string,
    eventType: string,
    payload: unknown,
  ): Promise<void> {
    await this.database.auditEvent.create({
      data: {
        actor: "API",
        eventType,
        jobId,
        occurredAt: new Date(),
        payload: toJson(payload),
        traceId: randomUUID(),
      },
    });
  }

  private async seedDeterministicFixtures(): Promise<void> {
    const user = await this.ensureDemoUser();
    const job = await this.database.job.upsert({
      create: {
        id: DEMO_JOB_ID,
        confirmedAt: new Date("2026-07-19T12:00:00.000Z"),
        currency: "USD",
        publicId: DEMO_JOB_PUBLIC_ID,
        specification: toJson(demoSpecification),
        status: "READY",
        targetBudgetCents: 200_000,
        title: "Charlotte apartment move",
        userId: user.id,
      },
      update: { userId: user.id },
      where: { publicId: DEMO_JOB_PUBLIC_ID },
    });
    const digest = contentDigest(demoSpecification);
    let version = await this.database.jobSpecificationVersion.findUnique({
      where: { jobId_version: { jobId: job.id, version: 1 } },
    });

    if (version) {
      version = await this.database.jobSpecificationVersion.update({
        data: {
          confirmedAt: new Date("2026-07-19T12:00:00.000Z"),
          contentDigest: digest,
          sourceMetadata: toJson({
            consent: { calling: true, recording: true },
            fixtureMode: true,
            sources: ["guided_form"],
          }),
          specification: toJson(demoSpecification),
        },
        where: { id: version.id },
      });
    } else {
      version = await this.database.jobSpecificationVersion.create({
        data: {
          confirmedAt: new Date("2026-07-19T12:00:00.000Z"),
          contentDigest: digest,
          id: DEMO_SPECIFICATION_VERSION_ID,
          jobId: job.id,
          sourceMetadata: toJson({
            consent: { calling: true, recording: true },
            fixtureMode: true,
            sources: ["voice_fixture", "document_fixture"],
          }),
          specification: toJson(demoSpecification),
          version: 1,
        },
      });
    }

    await this.ensureFixtureCandidates(job.id);
    const existingRun = await this.database.negotiationRun.findUnique({
      where: { correlationId: DEMO_RUN_CORRELATION_ID },
    });

    if (!existingRun) {
      const candidates = await this.database.jobBusiness.findMany({
        orderBy: { discoveryRank: "asc" },
        take: 3,
        where: { jobId: job.id },
      });
      await this.createFixtureRun(
        job.id,
        version.id,
        candidates.map((candidate) => candidate.businessId),
        DEMO_RUN_CORRELATION_ID,
      );
    }
  }
}
