import { randomUUID } from "node:crypto";

import {
  BadGatewayException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CurrentIdentityService } from "../auth/current-identity.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../database/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProviderCompositionService } from "../providers/provider-composition.service.js";

const SIGNED_READ_TTL_SECONDS = 5 * 60;

@Injectable()
export class EvidenceAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentIdentity: CurrentIdentityService,
    private readonly providers: ProviderCompositionService,
  ) {}

  async createSignedReadAccess(evidenceId: string): Promise<{
    contentType: string;
    evidenceId: string;
    expiresAt: string;
    url: string;
  }> {
    const evidence = await this.prisma.client.evidence.findFirst({
      select: {
        contentType: true,
        id: true,
        retentionUntil: true,
        storageKey: true,
      },
      where: {
        id: evidenceId,
        job: { userId: this.currentIdentity.identity.subject },
      },
    });

    if (!evidence) {
      throw new NotFoundException("Evidence was not found.");
    }
    if (
      evidence.retentionUntil !== null &&
      evidence.retentionUntil.getTime() <= Date.now()
    ) {
      throw new GoneException("The evidence retention period has ended.");
    }

    const storage = this.providers.getEvidenceStorage();
    if (!storage || evidence.storageKey.startsWith("fixture://")) {
      throw new ServiceUnavailableException(
        "Stored evidence is not available for download.",
      );
    }

    const traceId = randomUUID();
    const signed = await storage.getSignedReadUrl(
      {
        expiresInSeconds: SIGNED_READ_TTL_SECONDS,
        key: evidence.storageKey,
      },
      this.providers.createContext({ requestId: traceId, traceId }),
    );
    if (!signed.ok) {
      if (signed.error.code === "invalid-response") {
        throw new BadGatewayException(
          "Evidence storage returned an invalid response.",
        );
      }
      throw new ServiceUnavailableException(
        "Stored evidence is temporarily unavailable.",
      );
    }

    return {
      contentType: evidence.contentType,
      evidenceId: evidence.id,
      expiresAt: new Date(
        Date.now() + SIGNED_READ_TTL_SECONDS * 1_000,
      ).toISOString(),
      url: signed.value,
    };
  }
}
