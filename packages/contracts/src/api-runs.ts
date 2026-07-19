import { z } from "zod";

import { callOutcomeTypeSchema, callStatusSchema } from "./call.js";
import { entityIdSchema, isoDateTimeSchema, moneySchema } from "./common.js";
import { quoteSchema } from "./quote.js";

export const negotiationRunStatusSchema = z.enum([
  "draft",
  "queued",
  "discovering",
  "calling",
  "paused",
  "comparing",
  "completed",
  "partially_completed",
  "cancelled",
  "failed",
]);

export const runConsentSchema = z
  .object({
    aiDisclosureAcknowledgedAt: isoDateTimeSchema.nullable(),
    callingConsentAt: isoDateTimeSchema.nullable(),
    consentVersion: z.string().trim().min(1).max(100).nullable(),
    recordingConsentAt: isoDateTimeSchema.nullable(),
  })
  .strict();

export const createNegotiationRunRequestSchema = z
  .object({
    businessIds: z.array(entityIdSchema).min(3).max(20),
    consent: z
      .object({
        aiDisclosureAcknowledged: z.literal(true),
        callingConsent: z.literal(true),
        capturedAt: isoDateTimeSchema,
        consentVersion: z.string().trim().min(1).max(100),
        recordingConsent: z.boolean(),
      })
      .strict(),
    specificationVersionId: entityIdSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (new Set(request.businessIds).size !== request.businessIds.length) {
      context.addIssue({
        code: "custom",
        message: "Business identifiers must be unique",
        path: ["businessIds"],
      });
    }
  });

export const negotiationRunReferenceSchema = z
  .object({
    id: entityIdSchema,
    status: negotiationRunStatusSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const runCallSnapshotSchema = z
  .object({
    attempt: z.number().int().positive(),
    businessId: entityIdSchema,
    businessName: z.string().trim().min(1).max(300),
    endedAt: isoDateTimeSchema.nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    failureMessage: z.string().trim().min(1).max(1_000).nullable(),
    id: entityIdSchema,
    outcome: callOutcomeTypeSchema.nullable(),
    quoteId: entityIdSchema.nullable(),
    startedAt: isoDateTimeSchema.nullable(),
    status: callStatusSchema,
  })
  .strict();

export const runProgressSchema = z
  .object({
    callsCompleted: z.number().int().nonnegative(),
    callsFailed: z.number().int().nonnegative(),
    callsTotal: z.number().int().nonnegative(),
    quotesCaptured: z.number().int().nonnegative(),
  })
  .strict();

export const negotiationRunSnapshotSchema = z
  .object({
    calls: z.array(runCallSnapshotSchema).max(100),
    cancelledAt: isoDateTimeSchema.nullable(),
    completedAt: isoDateTimeSchema.nullable(),
    configurationVersion: z.string().trim().min(1).max(100),
    consent: runConsentSchema,
    correlationId: entityIdSchema,
    createdAt: isoDateTimeSchema,
    failureCode: z.string().trim().min(1).max(100).nullable(),
    failureMessage: z.string().trim().min(1).max(1_000).nullable(),
    id: entityIdSchema,
    jobId: entityIdSchema,
    pauseReason: z.string().trim().min(1).max(1_000).nullable(),
    pausedAt: isoDateTimeSchema.nullable(),
    progress: runProgressSchema,
    quotes: z.array(quoteSchema).max(100),
    specificationVersionId: entityIdSchema,
    startedAt: isoDateTimeSchema.nullable(),
    status: negotiationRunStatusSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const runEventActorSchema = z.enum([
  "user",
  "api",
  "worker",
  "provider",
  "system",
]);

export const runEventTypeSchema = z.enum([
  "run.created",
  "run.status_changed",
  "run.paused",
  "run.resumed",
  "run.cancelled",
  "business.discovered",
  "call.queued",
  "call.started",
  "call.updated",
  "call.completed",
  "quote.captured",
  "quote.updated",
  "recommendation.ready",
  "decision.saved",
]);

export const runEventSchema = z
  .object({
    actor: runEventActorSchema,
    correlationId: entityIdSchema,
    eventType: runEventTypeSchema,
    id: entityIdSchema,
    occurredAt: isoDateTimeSchema,
    payload: z.record(z.string(), z.unknown()),
    runId: entityIdSchema,
    sequence: z.number().int().positive(),
  })
  .strict();

export const runEventsResponseSchema = z
  .object({
    events: z.array(runEventSchema).max(1_000),
    nextSequence: z.number().int().positive().nullable(),
    runId: entityIdSchema,
  })
  .strict();

export const recommendationFactorSchema = z
  .object({
    key: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(1).max(1_000),
    score: z.number().min(0).max(1),
  })
  .strict();

export const recommendationSchema = z
  .object({
    bestQuoteId: entityIdSchema.nullable(),
    configurationVersion: z.string().trim().min(1).max(100),
    explanation: z.string().trim().min(1).max(5_000),
    factors: z.array(recommendationFactorSchema).max(100),
    id: entityIdSchema,
    policyVersion: z.string().trim().min(1).max(100),
    rankedQuoteIds: z.array(entityIdSchema).max(100),
    runId: entityIdSchema,
    savings: moneySchema.nullable(),
  })
  .strict();

export const reportEvidenceSchema = z
  .object({
    contentType: z.string().trim().min(1).max(200),
    id: entityIdSchema,
    kind: z.enum([
      "transcript",
      "recording",
      "written_quote",
      "screenshot",
      "structured_extraction",
    ]),
    quoteId: entityIdSchema.nullable(),
  })
  .strict();

export const runReportSummarySchema = z
  .object({
    callbacks: z.number().int().nonnegative(),
    declined: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    quoted: z.number().int().nonnegative(),
    totalBusinesses: z.number().int().nonnegative(),
    verifiedSavings: moneySchema.nullable(),
  })
  .strict();

export const runReportSchema = z
  .object({
    evidence: z.array(reportEvidenceSchema).max(1_000),
    generatedAt: isoDateTimeSchema,
    job: z
      .object({
        id: entityIdSchema,
        publicId: z.string().trim().min(1).max(32),
        title: z.string().trim().min(1).max(200),
      })
      .strict(),
    quotes: z.array(quoteSchema).max(100),
    recommendation: recommendationSchema.nullable(),
    runId: entityIdSchema,
    specificationVersionId: entityIdSchema,
    status: negotiationRunStatusSchema,
    summary: runReportSummarySchema,
  })
  .strict();

export const decisionOutcomeSchema = z.enum([
  "quote_selected",
  "deferred",
  "declined_all",
]);

export const decisionSchema = z
  .object({
    decidedAt: isoDateTimeSchema,
    id: entityIdSchema,
    note: z.string().trim().min(1).max(2_000).nullable(),
    outcome: decisionOutcomeSchema,
    recommendationId: entityIdSchema.nullable(),
    runId: entityIdSchema,
    selectedQuoteId: entityIdSchema.nullable(),
  })
  .strict();

export const saveDecisionRequestSchema = z
  .object({
    note: z.string().trim().min(1).max(2_000).nullable().optional(),
    outcome: decisionOutcomeSchema,
    selectedQuoteId: entityIdSchema.nullable(),
  })
  .strict()
  .superRefine((decision, context) => {
    const requiresQuote = decision.outcome === "quote_selected";
    const hasQuote = decision.selectedQuoteId !== null;

    if (requiresQuote !== hasQuote) {
      context.addIssue({
        code: "custom",
        message:
          "selectedQuoteId is required only when the outcome is quote_selected",
        path: ["selectedQuoteId"],
      });
    }
  });

export const runControlRequestSchema = z
  .object({
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export type CreateNegotiationRunRequest = z.infer<
  typeof createNegotiationRunRequestSchema
>;
export type Decision = z.infer<typeof decisionSchema>;
export type DecisionOutcome = z.infer<typeof decisionOutcomeSchema>;
export type NegotiationRunReference = z.infer<
  typeof negotiationRunReferenceSchema
>;
export type NegotiationRunSnapshot = z.infer<
  typeof negotiationRunSnapshotSchema
>;
export type NegotiationRunStatus = z.infer<typeof negotiationRunStatusSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type RecommendationFactor = z.infer<typeof recommendationFactorSchema>;
export type ReportEvidence = z.infer<typeof reportEvidenceSchema>;
export type RunCallSnapshot = z.infer<typeof runCallSnapshotSchema>;
export type RunConsent = z.infer<typeof runConsentSchema>;
export type RunControlRequest = z.infer<typeof runControlRequestSchema>;
export type RunEvent = z.infer<typeof runEventSchema>;
export type RunEventActor = z.infer<typeof runEventActorSchema>;
export type RunEventsResponse = z.infer<typeof runEventsResponseSchema>;
export type RunEventType = z.infer<typeof runEventTypeSchema>;
export type RunProgress = z.infer<typeof runProgressSchema>;
export type RunReport = z.infer<typeof runReportSchema>;
export type RunReportSummary = z.infer<typeof runReportSummarySchema>;
export type SaveDecisionRequest = z.infer<typeof saveDecisionRequestSchema>;
