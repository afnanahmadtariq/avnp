export type NegotiationTone = "complete" | "live" | "received";

export interface TranscriptEntry {
  at: string;
  speaker: "Sara" | "Business";
  text: string;
}

export interface EvidenceItem {
  accessible?: boolean;
  id: string;
  label: string;
  detail: string;
  source: string;
}

export interface Negotiation {
  id: string;
  company: string;
  initials: string;
  status: string;
  tone: NegotiationTone;
  initialOffer: number;
  currentOffer: number;
  progress: number;
  lastUpdate: string;
  strategy: string;
  summary: string;
  transcript: TranscriptEntry[];
  evidence: EvidenceItem[];
}

export interface QuoteLine {
  amount: number;
  label: string;
}

export interface Quote {
  id: string;
  company: string;
  total: number;
  initialTotal: number;
  rating: number;
  reviewCount: number;
  arrival: string;
  deposit: string;
  duration: string;
  included: string[];
  fees: QuoteLine[];
  evidenceCount: number;
  score: number;
  recommended?: boolean;
}

export const moveBrief = {
  id: "RLY-2048",
  title: "Charlotte apartment move",
  route: "Rock Hill, SC → Charlotte, NC",
  date: "Tuesday, July 28",
  window: "8:00–11:00 AM",
  budget: 2000,
  home: "2-bedroom apartment",
  access: "One flight at pickup · elevator at drop-off",
  inventory: "26 boxes · sectional · queen bed · dining table",
  notes: "Customer can accept the earliest arrival window.",
} as const;

export const negotiations: Negotiation[] = [
  {
    id: "pine",
    company: "Pine & Co. Moving",
    initials: "PC",
    status: "Offer improved",
    tone: "complete",
    initialOffer: 2210,
    currentOffer: 1840,
    progress: 100,
    lastUpdate: "2 min ago",
    strategy: "Flexible timing + competing quote",
    summary:
      "Pine removed its fuel surcharge and matched the lowest labor rate after Relay confirmed a flexible start window.",
    transcript: [
      {
        at: "12:38",
        speaker: "Sara",
        text: "The inventory and access are unchanged. If we accept your earliest Tuesday window, can you improve the all-in price?",
      },
      {
        at: "12:41",
        speaker: "Business",
        text: "I can remove the $140 fuel surcharge and reduce labor by $230. Your new guaranteed total is $1,840.",
      },
      {
        at: "12:42",
        speaker: "Sara",
        text: "Please confirm that includes stairs, mileage, and the two wardrobe boxes with no same-day add-ons.",
      },
      {
        at: "12:42",
        speaker: "Business",
        text: "Confirmed. Those items are included in the $1,840 total.",
      },
    ],
    evidence: [
      {
        id: "pine-price",
        label: "$1,840 guaranteed total",
        detail: "Confirmed verbally and repeated in the written quote.",
        source: "Call transcript · 12:42",
      },
      {
        id: "pine-fees",
        label: "No fuel or stair surcharge",
        detail: "Both fees are marked included in the revised estimate.",
        source: "Revised quote · lines 6–8",
      },
      {
        id: "pine-window",
        label: "8:00–9:00 AM arrival",
        detail: "One-hour arrival window, confirmed by dispatcher.",
        source: "Call transcript · 12:39",
      },
    ],
  },
  {
    id: "carolina",
    company: "Carolina Transit",
    initials: "CT",
    status: "Negotiating live",
    tone: "live",
    initialOffer: 2090,
    currentOffer: 1920,
    progress: 74,
    lastUpdate: "Now",
    strategy: "Price match + deposit terms",
    summary:
      "The dispatcher matched labor pricing. Relay is asking for a smaller deposit and a narrower arrival window.",
    transcript: [
      {
        at: "12:44",
        speaker: "Sara",
        text: "Your $1,920 total is competitive. The remaining difference is the 40% deposit and three-hour arrival window.",
      },
      {
        at: "12:45",
        speaker: "Business",
        text: "I need a supervisor for the deposit, but I may be able to narrow arrival to 9:00–11:00 AM.",
      },
      {
        at: "12:45",
        speaker: "Sara",
        text: "Thank you. I can hold while you confirm both terms without changing the quoted inventory.",
      },
    ],
    evidence: [
      {
        id: "carolina-price",
        label: "$1,920 current total",
        detail: "Labor discount confirmed; final terms remain open.",
        source: "Call transcript · 12:44",
      },
      {
        id: "carolina-deposit",
        label: "40% deposit under review",
        detail: "Dispatcher is checking whether it can be reduced to 25%.",
        source: "Live call · 12:45",
      },
    ],
  },
  {
    id: "union",
    company: "Union City Movers",
    initials: "UC",
    status: "Quote received",
    tone: "received",
    initialOffer: 2110,
    currentOffer: 2110,
    progress: 100,
    lastUpdate: "8 min ago",
    strategy: "Itemization request",
    summary:
      "Union City provided a complete itemized quote but would not reduce price without changing crew size.",
    transcript: [
      {
        at: "12:31",
        speaker: "Sara",
        text: "Can you improve the price while keeping the three-person crew and the confirmed inventory unchanged?",
      },
      {
        at: "12:33",
        speaker: "Business",
        text: "Not with three movers. We can only reduce the total by sending two, which could add an hour.",
      },
      {
        at: "12:34",
        speaker: "Sara",
        text: "We will keep the comparable three-person scope. Please send the itemized $2,110 quote.",
      },
    ],
    evidence: [
      {
        id: "union-price",
        label: "$2,110 itemized total",
        detail: "Price includes three movers and all listed inventory.",
        source: "Written quote · received 12:36",
      },
      {
        id: "union-decline",
        label: "Discount declined",
        detail: "A lower price required a smaller, non-comparable crew.",
        source: "Call transcript · 12:33",
      },
    ],
  },
];

export const quotes: Quote[] = [
  {
    id: "pine",
    company: "Pine & Co. Moving",
    total: 1840,
    initialTotal: 2210,
    rating: 4.9,
    reviewCount: 312,
    arrival: "8:00–9:00 AM",
    deposit: "20%",
    duration: "5–6 hours",
    included: ["3-person crew", "Mileage", "Stairs", "2 wardrobe boxes"],
    fees: [
      { label: "Labor", amount: 1660 },
      { label: "Materials", amount: 180 },
      { label: "Fuel and mileage", amount: 0 },
    ],
    evidenceCount: 7,
    score: 94,
    recommended: true,
  },
  {
    id: "carolina",
    company: "Carolina Transit",
    total: 1920,
    initialTotal: 2090,
    rating: 4.7,
    reviewCount: 428,
    arrival: "9:00 AM–12:00 PM",
    deposit: "40%",
    duration: "5–7 hours",
    included: ["3-person crew", "Mileage", "Stairs"],
    fees: [
      { label: "Labor", amount: 1740 },
      { label: "Materials", amount: 120 },
      { label: "Fuel", amount: 60 },
    ],
    evidenceCount: 5,
    score: 87,
  },
  {
    id: "union",
    company: "Union City Movers",
    total: 2110,
    initialTotal: 2110,
    rating: 4.8,
    reviewCount: 194,
    arrival: "8:00 AM–12:00 PM",
    deposit: "25%",
    duration: "5–6 hours",
    included: ["3-person crew", "Mileage", "Basic protection"],
    fees: [
      { label: "Labor", amount: 1830 },
      { label: "Materials", amount: 140 },
      { label: "Fuel", amount: 90 },
      { label: "Stairs", amount: 50 },
    ],
    evidenceCount: 4,
    score: 81,
  },
];

export const recommendation = {
  quoteId: "pine",
  savings: 370,
  confidence: 94,
  headline: "Pine & Co. is the strongest verified value",
  rationale: [
    "$80 below the next-best offer",
    "All known fees confirmed in writing",
    "Narrowest arrival window",
    "Lowest deposit at 20%",
  ],
} as const;

export const sessionActivity = [
  {
    at: "12:45",
    label: "Deposit terms escalated",
    company: "Carolina Transit",
  },
  { at: "12:42", label: "Guaranteed total confirmed", company: "Pine & Co." },
  { at: "12:36", label: "Itemized quote received", company: "Union City" },
] as const;
