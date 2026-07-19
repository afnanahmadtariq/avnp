export const TECH_TOTAL_FRAMES = 1770;

export const TECH_CAPTIONS = [
  {
    from: 6,
    text: "Relay turns one confirmed customer brief into multiple verifiable offers. Here is how.",
    to: 150,
  },
  {
    from: 150,
    text: "The Nuxt experience sends a Zod-validated brief to the NestJS API.",
    to: 306,
  },
  {
    from: 306,
    text: "PostgreSQL stores an immutable version, then Relay writes the run and outbox event in one transaction.",
    to: 480,
  },
  {
    from: 480,
    text: "Redis and BullMQ move identifiers—not transcripts or secrets—to a retry-safe worker.",
    to: 700,
  },
  {
    from: 700,
    text: "Provider adapters keep infrastructure replaceable. Google Places discovers businesses.",
    to: 844,
  },
  {
    from: 844,
    text: "ElevenLabs runs calls. OpenAI structures outcomes. Private evidence lives in Supabase Storage.",
    to: 1058,
  },
  {
    from: 1058,
    text: "Deterministic policy normalizes fees, rejects unsupported leverage, and ranks only evidenced quotes.",
    to: 1338,
  },
  {
    from: 1338,
    text: "Progress streams back so customers see calls, quote movement, and final reasoning as it happens.",
    to: 1550,
  },
  {
    from: 1550,
    text: "One immutable brief. Durable orchestration. Truthful negotiation. Verifiable decisions.",
    to: 1688,
  },
] as const;

export const TECH_STACK = [
  { detail: "Customer experience", label: "Nuxt", tone: "mint" },
  { detail: "Validation + webhooks", label: "NestJS API", tone: "blue" },
  { detail: "Immutable state", label: "PostgreSQL", tone: "violet" },
  { detail: "Durable jobs", label: "Redis / BullMQ", tone: "amber" },
  { detail: "Long-running work", label: "Relay worker", tone: "mint" },
] as const;

export const PROVIDERS = [
  {
    detail: "Business discovery",
    label: "Google Places",
    position: "top-left",
    short: "G",
  },
  {
    detail: "Voice + telephony",
    label: "ElevenLabs / Twilio",
    position: "top-right",
    short: "11",
  },
  {
    detail: "Structured extraction",
    label: "OpenAI",
    position: "bottom-left",
    short: "AI",
  },
  {
    detail: "Private evidence",
    label: "Supabase Storage",
    position: "bottom-right",
    short: "S",
  },
] as const;
