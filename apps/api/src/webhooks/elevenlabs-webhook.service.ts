import { createHash } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  CallStatus as DatabaseCallStatus,
  type DatabaseClient,
} from "@relay/database";
import type { ProviderFailure, VerifiedCallEvent } from "@relay/integrations";
import { createQueueJob } from "@relay/queue";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../database/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProviderCompositionService } from "../providers/provider-composition.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { QueueService } from "../queue/queue.service.js";

export interface WebhookAcceptance {
  readonly accepted: true;
  readonly duplicate: boolean;
}

export interface WebhookIngressRequest {
  readonly body: Uint8Array;
  readonly headers: Readonly<
    Record<string, readonly string[] | string | undefined>
  >;
  readonly requestId: string;
  readonly traceId: string;
}

interface PersistedCallSnapshot {
  readonly endedAt: Date | null;
  readonly id: string;
  readonly jobId: string;
  readonly runId: string | null;
  readonly startedAt: Date | null;
  readonly status: DatabaseCallStatus;
  readonly transcriptText: string | null;
  readonly updatedAt: Date;
}

const callSelect = {
  endedAt: true,
  id: true,
  jobId: true,
  runId: true,
  startedAt: true,
  status: true,
  transcriptText: true,
  updatedAt: true,
} as const;

const statusOrder: Readonly<Record<DatabaseCallStatus, number>> = {
  [DatabaseCallStatus.QUEUED]: 0,
  [DatabaseCallStatus.DIALING]: 1,
  [DatabaseCallStatus.IN_PROGRESS]: 2,
  [DatabaseCallStatus.NEGOTIATING]: 3,
  [DatabaseCallStatus.COMPLETED]: 4,
  [DatabaseCallStatus.FAILED]: 4,
  [DatabaseCallStatus.CANCELLED]: 4,
};

const terminalStatuses = new Set<DatabaseCallStatus>([
  DatabaseCallStatus.COMPLETED,
  DatabaseCallStatus.FAILED,
  DatabaseCallStatus.CANCELLED,
]);

function databaseStatus(
  status: VerifiedCallEvent["status"],
): DatabaseCallStatus {
  switch (status) {
    case "queued":
      return DatabaseCallStatus.QUEUED;
    case "dialing":
      return DatabaseCallStatus.DIALING;
    case "in_progress":
      return DatabaseCallStatus.IN_PROGRESS;
    case "negotiating":
      return DatabaseCallStatus.NEGOTIATING;
    case "completed":
      return DatabaseCallStatus.COMPLETED;
    case "failed":
      return DatabaseCallStatus.FAILED;
    case "cancelled":
      return DatabaseCallStatus.CANCELLED;
  }
}

function nextStatus(
  current: DatabaseCallStatus,
  incoming: DatabaseCallStatus,
): DatabaseCallStatus {
  if (terminalStatuses.has(current)) {
    return current;
  }

  return statusOrder[incoming] > statusOrder[current] ? incoming : current;
}

function newerTranscript(
  current: string | null,
  incoming: string | undefined,
): string | null {
  const candidate = incoming?.trim();
  if (candidate === undefined || candidate.length === 0) {
    return current;
  }
  return current === null || candidate.length > current.length
    ? candidate
    : current;
}

@Injectable()
export class ElevenLabsWebhookService {
  private readonly logger = new Logger(ElevenLabsWebhookService.name);

  constructor(
    private readonly providers: ProviderCompositionService,
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async receive(request: WebhookIngressRequest): Promise<WebhookAcceptance> {
    const callProvider = this.providers.callProvider;
    if (callProvider === undefined) {
      throw new NotFoundException("The call webhook endpoint is unavailable.");
    }

    const verification = await callProvider.verifyWebhook(
      { body: request.body, headers: request.headers },
      this.providers.createContext({
        requestId: request.requestId,
        traceId: request.traceId,
      }),
    );
    if (!verification.ok) {
      this.throwProviderFailure(verification.error);
    }

    const event = verification.value;
    const provider = callProvider.name;
    const payloadHash = createHash("sha256").update(request.body).digest("hex");
    const client = this.prisma.client;
    const call = await this.findCall(client, provider, event.providerCallId);
    const webhookEvent = await this.upsertWebhookEvent(
      client,
      provider,
      event,
      payloadHash,
      call?.jobId,
    );

    if (webhookEvent.payloadHash !== payloadHash) {
      throw new ConflictException("The webhook event identity is invalid.");
    }
    if (webhookEvent.processedAt !== null) {
      return { accepted: true, duplicate: true };
    }

    if (call === null || call.runId === null) {
      await this.markIgnored(
        client,
        webhookEvent.id,
        call === null
          ? "No matching provider call was registered."
          : "The matching call is not attached to a negotiation run.",
      );
      return { accepted: true, duplicate: false };
    }

    await this.updateCallMonotonically(client, call, event);

    if (!this.queue.enabled) {
      await this.markDeliveryFailure(
        client,
        webhookEvent.id,
        "Durable outcome processing is unavailable.",
      );
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }

    try {
      await this.queue.enqueue(
        createQueueJob(
          "call.outcome.process",
          {
            callId: call.id,
            providerEventId: event.eventId,
            runId: call.runId,
          },
          {
            idempotencyKey: `webhook:${provider}:${event.eventId}`,
            traceId: request.traceId,
          },
        ),
      );
    } catch (error) {
      this.logInfrastructureFailure("queue", error);
      await this.markDeliveryFailure(
        client,
        webhookEvent.id,
        "Outcome delivery will be retried.",
      );
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }

    try {
      await client.webhookEvent.update({
        data: { failureMessage: null, processedAt: new Date() },
        where: { id: webhookEvent.id },
      });
    } catch (error) {
      this.logInfrastructureFailure("database", error);
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }

    return { accepted: true, duplicate: false };
  }

  private async findCall(
    client: DatabaseClient,
    provider: string,
    providerCallId: string,
  ): Promise<PersistedCallSnapshot | null> {
    try {
      return await client.call.findUnique({
        select: callSelect,
        where: {
          provider_providerCallId: { provider, providerCallId },
        },
      });
    } catch (error) {
      this.logInfrastructureFailure("database", error);
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }
  }

  private async upsertWebhookEvent(
    client: DatabaseClient,
    provider: string,
    event: VerifiedCallEvent,
    payloadHash: string,
    jobId: string | undefined,
  ): Promise<{
    readonly id: string;
    readonly payloadHash: string;
    readonly processedAt: Date | null;
  }> {
    try {
      return await client.webhookEvent.upsert({
        create: {
          eventType: `call.${event.status}`,
          ...(jobId === undefined ? {} : { jobId }),
          payloadHash,
          provider,
          providerEventId: event.eventId,
        },
        select: { id: true, payloadHash: true, processedAt: true },
        update: {},
        where: {
          provider_providerEventId: {
            provider,
            providerEventId: event.eventId,
          },
        },
      });
    } catch (error) {
      this.logInfrastructureFailure("database", error);
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }
  }

  private async updateCallMonotonically(
    client: DatabaseClient,
    initial: PersistedCallSnapshot,
    event: VerifiedCallEvent,
  ): Promise<void> {
    let current = initial;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const incomingStatus = databaseStatus(event.status);
      const status = nextStatus(current.status, incomingStatus);
      const transcriptText = newerTranscript(
        current.transcriptText,
        event.transcriptText,
      );
      const occurredAt = new Date(event.occurredAt);
      const startedAt =
        current.startedAt ??
        (statusOrder[status] > statusOrder[DatabaseCallStatus.QUEUED]
          ? occurredAt
          : null);
      const endedAt =
        current.endedAt ?? (terminalStatuses.has(status) ? occurredAt : null);

      if (
        status === current.status &&
        transcriptText === current.transcriptText &&
        startedAt === current.startedAt &&
        endedAt === current.endedAt
      ) {
        return;
      }

      try {
        const update = await client.call.updateMany({
          data: {
            endedAt,
            ...(status === DatabaseCallStatus.COMPLETED
              ? { failureCode: null, failureMessage: null }
              : status === DatabaseCallStatus.FAILED
                ? {
                    failureCode: "provider_call_failed",
                    failureMessage:
                      "The provider reported that the call failed.",
                  }
                : {}),
            startedAt,
            status,
            transcriptText,
          },
          where: { id: current.id, updatedAt: current.updatedAt },
        });
        if (update.count === 1) {
          return;
        }

        const refreshed = await client.call.findUnique({
          select: callSelect,
          where: { id: current.id },
        });
        if (refreshed === null) {
          return;
        }
        current = refreshed;
      } catch (error) {
        this.logInfrastructureFailure("database", error);
        throw new ServiceUnavailableException(
          "Webhook processing is temporarily unavailable.",
        );
      }
    }
  }

  private async markIgnored(
    client: DatabaseClient,
    id: string,
    reason: string,
  ): Promise<void> {
    try {
      await client.webhookEvent.update({
        data: { failureMessage: reason, processedAt: new Date() },
        where: { id },
      });
    } catch (error) {
      this.logInfrastructureFailure("database", error);
      throw new ServiceUnavailableException(
        "Webhook processing is temporarily unavailable.",
      );
    }
  }

  private async markDeliveryFailure(
    client: DatabaseClient,
    id: string,
    failureMessage: string,
  ): Promise<void> {
    try {
      await client.webhookEvent.update({
        data: { failureMessage },
        where: { id },
      });
    } catch (error) {
      this.logInfrastructureFailure("database", error);
    }
  }

  private throwProviderFailure(error: ProviderFailure): never {
    this.logger.warn(
      `Rejected ${error.provider} webhook (${error.code}; retryable=${String(error.retryable)})`,
    );

    switch (error.code) {
      case "authentication":
        throw new UnauthorizedException("Webhook authentication failed.");
      case "conflict":
        throw new ConflictException("The webhook event conflicts with state.");
      case "invalid-response":
        throw new BadRequestException("The webhook payload is invalid.");
      case "not-found":
        throw new NotFoundException("The webhook resource was not found.");
      case "rate-limited":
        throw new HttpException(
          "Webhook verification is temporarily rate limited.",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      case "misconfigured":
      case "timeout":
      case "unavailable":
      case "unknown":
        throw new ServiceUnavailableException(
          "Webhook verification is temporarily unavailable.",
        );
    }
  }

  private logInfrastructureFailure(area: string, error: unknown): void {
    const errorType = error instanceof Error ? error.name : "UnknownError";
    this.logger.error(`${area} webhook operation failed (${errorType})`);
  }
}
