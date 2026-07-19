import type { QueueJobName } from "./contracts.js";

export interface QueueRetryPolicy {
  readonly attempts: number;
  readonly backoff: {
    readonly delay: number;
    readonly jitter: number;
    readonly type: "exponential";
  };
}

export const queueRetryPolicies = {
  "business.discover": retryPolicy(5, 2_000),
  "call.cancel": retryPolicy(5, 2_000),
  "call.outcome.process": retryPolicy(8, 1_000),
  // Provider-side idempotency must use the envelope idempotency key because a
  // timeout can occur after a billable call has already been accepted.
  "call.place": retryPolicy(3, 5_000),
  "negotiation.continue": retryPolicy(3, 5_000),
  "quote.normalize": retryPolicy(5, 2_000),
  "quote.rank": retryPolicy(5, 2_000),
} as const satisfies Readonly<Record<QueueJobName, QueueRetryPolicy>>;

function retryPolicy(attempts: number, delay: number): QueueRetryPolicy {
  return {
    attempts,
    backoff: {
      delay,
      jitter: 0.2,
      type: "exponential",
    },
  };
}
