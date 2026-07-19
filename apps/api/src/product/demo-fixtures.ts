import type { JobSpecification } from "@relay/contracts";

export const DEMO_USER_ID = "demo-user";
export const DEMO_USER_EMAIL = "demo@relay.local";
export const DEMO_JOB_ID = "demo-job";
export const DEMO_JOB_PUBLIC_ID = "RLY-2048";
export const DEMO_SPECIFICATION_VERSION_ID = "demo-specification-version-1";
export const DEMO_RUN_ID = "demo-run";
export const DEMO_RUN_CORRELATION_ID = "demo-correlation-run-1";
export const FIXTURE_PROVIDER = "fixture";

export const demoProfile = {
  displayName: "Relay Demo",
  email: DEMO_USER_EMAIL,
  location: "Charlotte, NC",
  phone: "+17045550100",
  representedAs: "Relay Demo",
  timezone: "America/New_York",
} as const;

export const demoSettings = {
  aiDisclosure: true,
  callbackAlerts: true,
  callMilestones: true,
  emailUpdates: true,
  evidenceRetentionDays: 30,
  recordingConsentDefault: true,
} as const;

export const demoSpecification = {
  vertical: "moving",
  pickupAddress: { formattedAddress: "Rock Hill, SC" },
  dropoffAddress: { formattedAddress: "Charlotte, NC" },
  movingDate: "2026-07-28",
  bedrooms: 2,
  pickupStairs: 1,
  dropoffStairs: 0,
  hasElevator: true,
  inventory: [
    { name: "Boxes", quantity: 26 },
    { name: "Sectional sofa", quantity: 1, specialHandling: true },
    { name: "Queen bed", quantity: 1 },
    { name: "Dining table", quantity: 1 },
  ],
  packingPreference: "materials",
  budget: { amountMinor: 200_000, currency: "USD" },
  notes:
    "Customer can accept the earliest arrival window. Elevator is reserved at drop-off.",
} as const satisfies JobSpecification;

export interface DemoBusinessFixture {
  readonly address: string;
  readonly distanceMiles: number;
  readonly externalId: string;
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly rating: number;
  readonly reviewCount: number;
}

export const demoBusinesses = [
  {
    address: "Rock Hill, SC",
    distanceMiles: 4.2,
    externalId: "fixture-pine",
    id: "demo-business-pine",
    name: "Pine & Co. Moving",
    phone: "+17045550101",
    rating: 4.8,
    reviewCount: 214,
  },
  {
    address: "Fort Mill, SC",
    distanceMiles: 7.8,
    externalId: "fixture-carolina",
    id: "demo-business-carolina",
    name: "Carolina Transit",
    phone: "+17045550102",
    rating: 4.6,
    reviewCount: 168,
  },
  {
    address: "Charlotte, NC",
    distanceMiles: 10.4,
    externalId: "fixture-atlas",
    id: "demo-business-atlas",
    name: "Atlas Moving Group",
    phone: "+17045550103",
    rating: 4.4,
    reviewCount: 121,
  },
] as const satisfies readonly DemoBusinessFixture[];

export interface DemoMarketFixture {
  readonly arrivalWindow: string;
  readonly cancellationPolicy: string;
  readonly currentOfferCents: number;
  readonly crewSize: number;
  readonly depositCents: number;
  readonly depositPolicy: string;
  readonly estimateType: "BINDING" | "NON_BINDING";
  readonly estimatedDuration: string;
  readonly initialOfferCents: number;
  readonly strategy:
    "DISCOUNT_REQUEST" | "FEE_REMOVAL" | "PRICE_MATCH" | "PROMOTION_REQUEST";
  readonly transcript: string;
}

export const demoMarket = [
  {
    arrivalWindow: "8:00–9:00 AM",
    cancellationPolicy:
      "Free cancellation up to 48 hours before arrival; the deposit can transfer once with 24 hours' notice.",
    currentOfferCents: 184_000,
    crewSize: 3,
    depositCents: 36_800,
    depositPolicy: "20% due when booked",
    estimateType: "BINDING",
    estimatedDuration: "5–6 hours",
    initialOfferCents: 221_000,
    strategy: "FEE_REMOVAL",
    transcript:
      "Business: Before we continue, are you an automated assistant?\nRelay: Yes. I am Relay, an AI assistant calling for the customer with their approval. A comparable confirmed all-in offer for this same move is $2,050. If we accept your earliest Tuesday window, can you beat it?\nBusiness: I can remove the fuel surcharge and reduce labor. The guaranteed total is $1,840.\nRelay: Please confirm stairs, mileage, and wardrobe boxes are included.\nBusiness: Confirmed.",
  },
  {
    arrivalWindow: "9:00–11:00 AM",
    cancellationPolicy:
      "The deposit is refundable up to 72 hours before arrival.",
    currentOfferCents: 205_000,
    crewSize: 3,
    depositCents: 51_250,
    depositPolicy: "25% due when booked",
    estimateType: "BINDING",
    estimatedDuration: "5–7 hours",
    initialOfferCents: 205_000,
    strategy: "DISCOUNT_REQUEST",
    transcript:
      "Relay: Can you improve the all-in price without changing the three-person crew?\nBusiness: We cannot reduce the complete binding quote below $2,050.\nRelay: Please confirm the 9:00–11:00 AM arrival window and 25% booking deposit.\nBusiness: Confirmed; packing materials and mileage are included.",
  },
  {
    arrivalWindow: "12:00–3:00 PM",
    cancellationPolicy:
      "The deposit is refundable up to five days before arrival.",
    currentOfferCents: 248_000,
    crewSize: 3,
    depositCents: 62_000,
    depositPolicy: "25% due when booked",
    estimateType: "NON_BINDING",
    estimatedDuration: "6–8 hours",
    initialOfferCents: 248_000,
    strategy: "DISCOUNT_REQUEST",
    transcript:
      "Relay: Is every required access fee included in the $2,480 estimate?\nBusiness: The estimate is non-binding and an access fee may still apply.\nRelay: Please confirm the noon–3:00 PM arrival window and three-person crew.\nBusiness: Confirmed, but the access fee cannot be priced until the site review.",
  },
] as const satisfies readonly DemoMarketFixture[];

export const demoRecordIds = {
  calls: ["demo-call-pine", "demo-call-carolina", "demo-call-atlas"],
  evidence: [
    "demo-evidence-pine-transcript",
    "demo-evidence-carolina-transcript",
    "demo-evidence-atlas-transcript",
  ],
  negotiations: [
    "demo-negotiation-pine",
    "demo-negotiation-carolina",
    "demo-negotiation-atlas",
  ],
  quotes: ["demo-quote-pine", "demo-quote-carolina", "demo-quote-atlas"],
} as const;
