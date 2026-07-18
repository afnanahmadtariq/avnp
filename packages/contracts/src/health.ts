import { z } from "zod";

import { isoDateTimeSchema } from "./common.js";

export const healthResponseSchema = z
  .object({
    status: z.literal("ok"),
    service: z.string().trim().min(1),
    timestamp: isoDateTimeSchema,
    version: z.string().trim().min(1),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;
