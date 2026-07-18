import { z } from "zod";

import { addressSchema, entityIdSchema } from "./common.js";

export const businessSourceSchema = z.enum(["directory", "manual", "fixture"]);

export const businessSchema = z
  .object({
    id: entityIdSchema,
    name: z.string().trim().min(1).max(300),
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    location: addressSchema,
    rating: z.number().min(0).max(5).optional(),
    reviewCount: z.number().int().nonnegative().optional(),
    distanceMeters: z.number().int().nonnegative().optional(),
    websiteUrl: z.string().url().optional(),
    categories: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    source: businessSourceSchema,
    externalId: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export type Business = z.infer<typeof businessSchema>;
export type BusinessSource = z.infer<typeof businessSourceSchema>;
