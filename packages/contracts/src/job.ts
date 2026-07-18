import { z } from "zod";

import {
  addressSchema,
  entityIdSchema,
  isoDateTimeSchema,
  localDateSchema,
  moneySchema,
} from "./common.js";

export const packingPreferenceSchema = z.enum([
  "none",
  "materials",
  "partial",
  "full",
]);

export const inventoryItemSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    quantity: z.number().int().positive().max(10_000),
    specialHandling: z.boolean().optional(),
    notes: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const jobSpecificationSchema = z
  .object({
    vertical: z.literal("moving"),
    pickupAddress: addressSchema,
    dropoffAddress: addressSchema,
    movingDate: localDateSchema,
    bedrooms: z.number().int().min(0).max(20),
    pickupStairs: z.number().int().min(0).max(100),
    dropoffStairs: z.number().int().min(0).max(100),
    hasElevator: z.boolean(),
    inventory: z.array(inventoryItemSchema).max(500),
    specialItems: z
      .array(z.string().trim().min(1).max(200))
      .max(200)
      .optional(),
    packingPreference: packingPreferenceSchema,
    budget: moneySchema.optional(),
    notes: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const jobStatusSchema = z.enum([
  "draft",
  "ready",
  "discovering",
  "calling",
  "comparing",
  "completed",
  "cancelled",
  "failed",
]);

export const jobSchema = z
  .object({
    id: entityIdSchema,
    specification: jobSpecificationSchema,
    status: jobStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export type InventoryItem = z.infer<typeof inventoryItemSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobSpecification = z.infer<typeof jobSpecificationSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type PackingPreference = z.infer<typeof packingPreferenceSchema>;
