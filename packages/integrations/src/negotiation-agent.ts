import type {
  Business,
  JobSpecification,
  NegotiationStrategy,
  Quote,
} from "@relay/contracts";

import type { ProviderRequestContext, ProviderResult } from "./result.js";

export interface NegotiationTranscriptTurn {
  readonly at: string;
  readonly speaker: "agent" | "business";
  readonly text: string;
}

export interface NegotiationTurnRequest {
  readonly business: Business;
  readonly currentQuote?: Quote;
  readonly job: JobSpecification;
  readonly strategy: NegotiationStrategy;
  readonly transcript: readonly NegotiationTranscriptTurn[];
  /** Leverage must be evidenced by an actual quote before it reaches this port. */
  readonly truthfulCompetingQuote?: Quote;
}

export interface NegotiationTurnResponse {
  readonly action: "accept" | "counter" | "end" | "speak";
  readonly extractedQuote?: Quote;
  readonly rationale: string;
  readonly spokenText: string;
}

export interface NegotiationAgentProvider {
  readonly name: string;

  nextTurn(
    request: NegotiationTurnRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<NegotiationTurnResponse>>;
}
