import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema } from "./common.js";

export const callStatusSchema = z.enum([
  "queued",
  "dialing",
  "in_progress",
  "negotiating",
  "completed",
  "failed",
  "cancelled",
]);

export const callOutcomeTypeSchema = z.enum([
  "quote_received",
  "callback_requested",
  "declined",
  "unavailable",
  "no_answer",
  "busy",
  "failed",
]);

const callOutcomeBaseShape = {
  callId: entityIdSchema,
  jobId: entityIdSchema,
  businessId: entityIdSchema,
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema,
  durationSeconds: z.number().int().nonnegative(),
  transcriptKey: z.string().trim().min(1).max(1_024).optional(),
  recordingKey: z.string().trim().min(1).max(1_024).optional(),
};

const quoteReceivedCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("quote_received"),
    quoteId: entityIdSchema,
  })
  .strict();

const callbackRequestedCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("callback_requested"),
    callbackAt: isoDateTimeSchema.optional(),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const declinedCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("declined"),
    reason: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const unavailableCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("unavailable"),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

const noAnswerCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("no_answer"),
  })
  .strict();

const busyCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("busy"),
  })
  .strict();

const failedCallOutcomeSchema = z
  .object({
    ...callOutcomeBaseShape,
    outcome: z.literal("failed"),
    errorCode: z.string().trim().min(1).max(100).optional(),
    reason: z.string().trim().min(1).max(1_000),
    retryable: z.boolean(),
  })
  .strict();

export const callOutcomeSchema = z.discriminatedUnion("outcome", [
  quoteReceivedCallOutcomeSchema,
  callbackRequestedCallOutcomeSchema,
  declinedCallOutcomeSchema,
  unavailableCallOutcomeSchema,
  noAnswerCallOutcomeSchema,
  busyCallOutcomeSchema,
  failedCallOutcomeSchema,
]);

export type CallOutcome = z.infer<typeof callOutcomeSchema>;
export type CallOutcomeType = z.infer<typeof callOutcomeTypeSchema>;
export type CallStatus = z.infer<typeof callStatusSchema>;
