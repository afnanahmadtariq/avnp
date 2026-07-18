import { z } from "zod";

export const entityIdSchema = z.string().trim().min(1).max(128);

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const localDateSchema = z.iso.date();

export const currencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);

export const moneySchema = z
  .object({
    amountMinor: z.number().int().nonnegative().safe(),
    currency: currencyCodeSchema,
  })
  .strict();

export const geoPointSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

export const addressSchema = z
  .object({
    formattedAddress: z.string().trim().min(1).max(500),
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    region: z.string().trim().min(1).max(120).optional(),
    postalCode: z.string().trim().min(1).max(32).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    coordinates: geoPointSchema.optional(),
    placeId: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export type Address = z.infer<typeof addressSchema>;
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export type GeoPoint = z.infer<typeof geoPointSchema>;
export type Money = z.infer<typeof moneySchema>;
