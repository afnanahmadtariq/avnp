import { z } from "zod";

import { entityIdSchema, isoDateTimeSchema } from "./common.js";

const normalizedPhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/);

const userProfileFields = {
  displayName: z.string().trim().min(1).max(120),
  email: z.email().max(254).nullable(),
  location: z.string().trim().min(1).max(200).nullable(),
  phone: normalizedPhoneSchema.nullable(),
  representedAs: z.string().trim().min(1).max(120).nullable(),
  timezone: z.string().trim().min(1).max(100),
};

export const userProfileSchema = z
  .object({
    id: entityIdSchema,
    ...userProfileFields,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const updateUserProfileRequestSchema = z
  .object({
    displayName: userProfileFields.displayName.optional(),
    email: userProfileFields.email.optional(),
    location: userProfileFields.location.optional(),
    phone: userProfileFields.phone.optional(),
    representedAs: userProfileFields.representedAs.optional(),
    timezone: userProfileFields.timezone.optional(),
  })
  .strict()
  .refine(
    (profile) => Object.values(profile).some((value) => value !== undefined),
    "At least one profile field is required",
  );

export const evidenceRetentionDaysSchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]);

const userSettingsFields = {
  aiDisclosure: z.literal(true),
  callbackAlerts: z.boolean(),
  callMilestones: z.boolean(),
  emailUpdates: z.boolean(),
  evidenceRetentionDays: evidenceRetentionDaysSchema,
  recordingConsentDefault: z.boolean(),
};

export const userSettingsSchema = z
  .object({
    ...userSettingsFields,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const updateUserSettingsRequestSchema = z
  .object({
    aiDisclosure: userSettingsFields.aiDisclosure.optional(),
    callbackAlerts: userSettingsFields.callbackAlerts.optional(),
    callMilestones: userSettingsFields.callMilestones.optional(),
    emailUpdates: userSettingsFields.emailUpdates.optional(),
    evidenceRetentionDays: userSettingsFields.evidenceRetentionDays.optional(),
    recordingConsentDefault:
      userSettingsFields.recordingConsentDefault.optional(),
  })
  .strict()
  .refine(
    (settings) => Object.values(settings).some((value) => value !== undefined),
    "At least one settings field is required",
  );

export type EvidenceRetentionDays = z.infer<typeof evidenceRetentionDaysSchema>;
export type UpdateUserProfileRequest = z.infer<
  typeof updateUserProfileRequestSchema
>;
export type UpdateUserSettingsRequest = z.infer<
  typeof updateUserSettingsRequestSchema
>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type UserSettings = z.infer<typeof userSettingsSchema>;
