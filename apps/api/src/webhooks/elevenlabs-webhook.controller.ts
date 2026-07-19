import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";

import { PublicRoute } from "../auth/public-route.decorator.js";
import type { WebhookAcceptance } from "./elevenlabs-webhook.service.js";
// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ElevenLabsWebhookService } from "./elevenlabs-webhook.service.js";

interface RawWebhookRequest {
  readonly headers: IncomingHttpHeaders;
  readonly rawBody?: Uint8Array;
}

function boundedHeader(
  value: readonly string[] | string | undefined,
): string | undefined {
  const firstValue = typeof value === "string" ? value : value?.[0];
  const normalized = firstValue?.trim();
  return normalized !== undefined && normalized.length > 0
    ? normalized.slice(0, 200)
    : undefined;
}

@Controller("webhooks/elevenlabs")
@PublicRoute()
export class ElevenLabsWebhookController {
  constructor(private readonly webhooks: ElevenLabsWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  receive(@Req() request: RawWebhookRequest): Promise<WebhookAcceptance> {
    if (!(request.rawBody instanceof Uint8Array)) {
      throw new BadRequestException("A raw webhook body is required.");
    }

    const requestId =
      boundedHeader(request.headers["x-request-id"]) ?? randomUUID();
    const traceId = boundedHeader(request.headers["x-trace-id"]) ?? requestId;

    return this.webhooks.receive({
      body: request.rawBody,
      headers: request.headers,
      requestId,
      traceId,
    });
  }
}
