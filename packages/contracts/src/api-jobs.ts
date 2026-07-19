import { z } from "zod";

import { businessSchema } from "./business.js";
import { entityIdSchema, isoDateTimeSchema } from "./common.js";
import {
  negotiationRunReferenceSchema,
  type NegotiationRunReference,
} from "./api-runs.js";
import {
  jobSpecificationSchema,
  jobStatusSchema,
  type JobSpecification,
} from "./job.js";

export const publicJobIdSchema = z
  .string()
  .trim()
  .regex(/^RLY-[A-Z0-9]{4,20}$/);

export const jobSpecificationSourceSchema = z.enum([
  "guided_form",
  "voice_interview",
  "document",
  "manual",
  "fixture",
]);

export const jobSpecificationSourceMetadataSchema = z
  .object({
    evidenceIds: z.array(entityIdSchema).max(100).optional(),
    fieldConfidence: z
      .record(z.string().trim().min(1).max(200), z.number().min(0).max(1))
      .optional(),
    sources: z.array(jobSpecificationSourceSchema).min(1).max(20),
  })
  .strict();

export const jobSpecificationVersionSchema = z
  .object({
    confirmedAt: isoDateTimeSchema,
    contentDigest: z.string().trim().min(1).max(200),
    createdAt: isoDateTimeSchema,
    id: entityIdSchema,
    jobId: entityIdSchema,
    sourceMetadata: jobSpecificationSourceMetadataSchema.nullable(),
    specification: jobSpecificationSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const jobCandidateStatusSchema = z.enum([
  "discovered",
  "shortlisted",
  "contacting",
  "responded",
  "declined",
  "excluded",
]);

export const jobCandidateSchema = z
  .object({
    business: businessSchema,
    discoveredAt: isoDateTimeSchema,
    discoveryRank: z.number().int().positive().nullable(),
    exclusionReason: z.string().trim().min(1).max(1_000).nullable(),
    jobId: entityIdSchema,
    relevanceScore: z.number().min(0).max(100).nullable(),
    selected: z.boolean(),
    status: jobCandidateStatusSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const jobSummarySchema = z
  .object({
    candidateCount: z.number().int().nonnegative(),
    createdAt: isoDateTimeSchema,
    id: entityIdSchema,
    latestRun: negotiationRunReferenceSchema.nullable(),
    publicId: publicJobIdSchema,
    quoteCount: z.number().int().nonnegative(),
    status: jobStatusSchema,
    title: z.string().trim().min(1).max(200),
    updatedAt: isoDateTimeSchema,
    vertical: z.literal("moving"),
  })
  .strict();

export const jobDetailsSchema = z
  .object({
    candidates: z.array(jobCandidateSchema).max(100),
    completedAt: isoDateTimeSchema.nullable(),
    confirmedAt: isoDateTimeSchema.nullable(),
    confirmedSpecificationVersion: jobSpecificationVersionSchema.nullable(),
    createdAt: isoDateTimeSchema,
    id: entityIdSchema,
    latestRun: negotiationRunReferenceSchema.nullable(),
    publicId: publicJobIdSchema,
    specification: jobSpecificationSchema,
    status: jobStatusSchema,
    title: z.string().trim().min(1).max(200),
    updatedAt: isoDateTimeSchema,
    vertical: z.literal("moving"),
  })
  .strict();

export const createJobRequestSchema = z
  .object({
    specification: jobSpecificationSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const updateJobDraftRequestSchema = z
  .object({
    specification: jobSpecificationSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  .refine(
    (request) => Object.values(request).some((value) => value !== undefined),
    "At least one draft field is required",
  );

export const confirmJobRequestSchema = z
  .object({
    expectedUpdatedAt: isoDateTimeSchema.optional(),
    sourceMetadata: jobSpecificationSourceMetadataSchema,
  })
  .strict();

export const confirmJobResponseSchema = z
  .object({
    job: jobDetailsSchema,
    specificationVersion: jobSpecificationVersionSchema,
  })
  .strict();

export const jobListResponseSchema = z
  .object({
    items: z.array(jobSummarySchema).max(100),
    nextCursor: entityIdSchema.nullable(),
  })
  .strict();

export const jobCandidatesResponseSchema = z
  .object({
    candidates: z.array(jobCandidateSchema).max(100),
    jobId: entityIdSchema,
  })
  .strict();

export const selectJobCandidatesRequestSchema = z
  .object({
    businessIds: z.array(entityIdSchema).min(3).max(20),
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

export type ConfirmJobRequest = z.infer<typeof confirmJobRequestSchema>;
export type ConfirmJobResponse = z.infer<typeof confirmJobResponseSchema>;
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;
export type JobCandidate = z.infer<typeof jobCandidateSchema>;
export type JobCandidateStatus = z.infer<typeof jobCandidateStatusSchema>;
export type JobCandidatesResponse = z.infer<typeof jobCandidatesResponseSchema>;
export type JobDetails = z.infer<typeof jobDetailsSchema>;
export type JobListResponse = z.infer<typeof jobListResponseSchema>;
export type JobSpecificationSource = z.infer<
  typeof jobSpecificationSourceSchema
>;
export type JobSpecificationSourceMetadata = z.infer<
  typeof jobSpecificationSourceMetadataSchema
>;
export type JobSpecificationVersion = z.infer<
  typeof jobSpecificationVersionSchema
>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type PublicJobId = z.infer<typeof publicJobIdSchema>;
export type SelectJobCandidatesRequest = z.infer<
  typeof selectJobCandidatesRequestSchema
>;
export type UpdateJobDraftRequest = z.infer<typeof updateJobDraftRequestSchema>;

export type { JobSpecification, NegotiationRunReference };
