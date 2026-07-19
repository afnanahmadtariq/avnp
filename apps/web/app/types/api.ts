export interface ApiAddress {
  formattedAddress: string;
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface ApiMoney {
  amountMinor: number;
  currency: string;
}

export interface ApiInventoryItem {
  name: string;
  quantity: number;
  specialHandling?: boolean;
  notes?: string;
}

export interface JobSpecification {
  vertical: "moving";
  pickupAddress: ApiAddress;
  dropoffAddress: ApiAddress;
  movingDate: string;
  bedrooms: number;
  pickupStairs: number;
  dropoffStairs: number;
  hasElevator: boolean;
  inventory: ApiInventoryItem[];
  specialItems?: string[];
  packingPreference: "none" | "materials" | "partial" | "full";
  budget?: ApiMoney;
  notes?: string;
}

export interface JobSummary {
  publicId: string;
  title: string;
  status: string;
  stage: string;
  route: {
    pickup: string;
    destination: string;
  };
  movingDate: string | null;
  bestOfferCents: number | null;
  savingsCents: number | null;
  updatedAt: string;
  nextAction: string;
}

export interface JobDetail extends JobSummary {
  draft: JobSpecification;
  confirmedVersion: {
    id: string;
    version: number;
    confirmedAt: string;
    digest: string;
  } | null;
  consent: {
    calling: boolean;
    recording: boolean;
  };
  candidateCount: number;
  latestRunId: string | null;
}

export interface JobSpecificationExtraction {
  confidence?: number;
  facts: Partial<JobSpecification> & { vertical?: "moving" };
  sourceSummary?: string;
  warnings?: string[];
}

export interface IntakeResult {
  evidenceIds?: string[];
  extraction?: JobSpecificationExtraction;
  job: JobDetail;
  mode?: string;
}

export interface IntakeVoiceSession {
  available: boolean;
  message?: string;
  mode?: string;
  sessionId?: string | null;
  signedUrl?: string | null;
}

export interface CandidateBusiness {
  id: string;
  name: string;
  phone: string | null;
  location: string;
  rating: number | null;
  reviewCount: number | null;
  distanceMiles?: number;
  source: string;
  status: string;
  selected: boolean;
}

export interface EvidenceAccess {
  contentType: string;
  evidenceId: string;
  expiresAt: string;
  url: string;
}

export interface RunEvidenceItem {
  available: boolean;
  contentType: string;
  id: string;
  kind: string;
  label: string;
}

export interface RunCall {
  id: string;
  businessId: string;
  businessName: string;
  status: string;
  outcome: string | null;
  initialOfferCents?: number;
  currentOfferCents?: number;
  progress: number;
  transcript: string;
  evidence: string[];
  evidenceItems?: RunEvidenceItem[];
}

export interface RunQuote {
  id: string;
  businessId: string;
  businessName: string;
  status: string;
  totalCents: number;
  originalTotalCents?: number;
  savingsCents?: number;
  confidence: number;
  score?: number;
  depositCents?: number;
  arrivalWindow?: string;
  estimatedDuration?: string;
  rating?: number;
  reviewCount?: number;
  inclusions: string[];
  riskFlags: string[];
  evidenceCount: number;
}

export interface RunMetrics {
  callsHandled: number;
  completedQuotes: number;
  timeAvoidedMinutes: number;
  verifiedSavingsCents: number;
}

export interface RunSnapshot {
  id: string;
  jobPublicId: string;
  status: string;
  paused: boolean;
  stage: string;
  calls: RunCall[];
  quotes: RunQuote[];
  metrics: RunMetrics;
  mode?: "fixture" | "live";
  decision: {
    decidedAt: string;
    quoteId: string | null;
  } | null;
  specificationVersion?: {
    id: string;
    version: number;
  };
  updatedAt: string;
}

export interface RunEvent {
  id: string;
  type: string;
  at: string;
  message: string;
  callId?: string;
}

export interface RankedOffer extends RunQuote {
  rank: number;
  rationale: string;
}

export interface RunReport {
  runId: string;
  mode?: "fixture" | "live";
  rankedOffers: RankedOffer[];
  recommendation: {
    quoteId: string;
    businessName: string;
    totalCents: number;
    savingsCents: number;
    confidence: number;
    rationale: string;
  };
  metrics: RunMetrics;
  decision: {
    quoteId: string;
    savedAt: string;
  } | null;
}

export interface RelayProfile {
  displayName: string;
  email: string;
  id: string;
  location: string;
  phone: string | null;
  representedAs: string;
  timezone: string;
  updatedAt: string;
}

export type RelayProfileUpdate = Omit<
  RelayProfile,
  "email" | "id" | "updatedAt"
>;

export interface RelaySettings {
  aiDisclosure: true;
  callbackAlerts: boolean;
  callMilestones: boolean;
  emailUpdates: boolean;
  evidenceRetentionDays: 7 | 30 | 90;
  recordingConsentDefault: boolean;
  updatedAt: string;
}

export type RelaySettingsUpdate = Omit<RelaySettings, "updatedAt">;

export interface RelayAccountExport {
  generatedAt: string;
  jobs: unknown[];
  kind: string;
  profile: RelayProfile;
  settings: RelaySettings;
  version: number;
}

export interface ApiErrorBody {
  message?: string | string[];
}
