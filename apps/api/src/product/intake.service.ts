import { createHash, randomUUID } from "node:crypto";

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  EvidenceKind,
  VoiceIntakeSessionStatus,
  type Prisma,
} from "@relay/database";
import type {
  EvidenceContentType,
  ExtractionFileContentType,
  JobSpecificationExtraction,
  ProviderFailure,
} from "@relay/integrations";

// Nest constructor dependencies must remain runtime imports for emitted metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from "../database/prisma.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProviderCompositionService } from "../providers/provider-composition.service.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ProductService } from "./product.service.js";

const MAXIMUM_DOCUMENT_BYTES = 20 * 1024 * 1024;
const INTERVIEW_FINALIZATION_ATTEMPTS = 5;
const INTERVIEW_FINALIZATION_DELAY_MS = 1_000;
const INTERVIEW_SESSION_TTL_MS = 15 * 60 * 1_000;

export interface IntakeUpload {
  readonly buffer: Buffer;
  readonly mimetype: string;
  readonly originalname: string;
  readonly size: number;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function checksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function safeFilename(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replaceAll(/[^A-Za-z0-9._-]/g, "-")
    .replaceAll(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return normalized || "intake-document";
}

function detectedContentType(
  body: Uint8Array,
): ExtractionFileContentType | undefined {
  if (
    body.length >= 5 &&
    String.fromCharCode(...body.subarray(0, 5)) === "%PDF-"
  ) {
    return "application/pdf";
  }
  if (
    body.length >= 3 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    body.length >= 8 &&
    body[0] === 0x89 &&
    body[1] === 0x50 &&
    body[2] === 0x4e &&
    body[3] === 0x47 &&
    body[4] === 0x0d &&
    body[5] === 0x0a &&
    body[6] === 0x1a &&
    body[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    body.length >= 12 &&
    String.fromCharCode(...body.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...body.subarray(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return undefined;
}

function extension(contentType: EvidenceContentType): string {
  const extensions: Readonly<Record<EvidenceContentType, string>> = {
    "application/json": "json",
    "application/pdf": "pdf",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/plain": "txt",
  };
  return extensions[contentType];
}

function storedFilename(
  filename: string,
  contentType: EvidenceContentType,
): string {
  const normalized = safeFilename(filename);
  const suffix = `.${extension(contentType)}`;
  return normalized.toLowerCase().endsWith(suffix)
    ? normalized
    : `${normalized}${suffix}`;
}

@Injectable()
export class IntakeService {
  constructor(
    private readonly product: ProductService,
    private readonly prisma: PrismaService,
    private readonly providers: ProviderCompositionService,
  ) {}

  async extractDocument(
    publicId: string,
    upload: IntakeUpload,
  ): Promise<unknown> {
    if (
      upload.size <= 0 ||
      upload.buffer.length <= 0 ||
      upload.size > MAXIMUM_DOCUMENT_BYTES ||
      upload.buffer.length > MAXIMUM_DOCUMENT_BYTES
    ) {
      throw new BadRequestException(
        "The document must be between 1 byte and 20 MB.",
      );
    }
    const contentType = detectedContentType(upload.buffer);
    if (!contentType) {
      throw new BadRequestException(
        "Only genuine PDF, JPEG, PNG, or WebP documents are supported.",
      );
    }
    if (
      upload.mimetype !== "application/octet-stream" &&
      upload.mimetype !== contentType
    ) {
      throw new BadRequestException(
        "The uploaded document type does not match its contents.",
      );
    }

    const context = await this.product.getIntakeContext(publicId);
    const sourceEvidenceId = randomUUID();
    await this.persistEvidence({
      body: upload.buffer,
      contentType,
      evidenceId: sourceEvidenceId,
      filename: safeFilename(upload.originalname),
      jobId: context.jobId,
      kind:
        contentType === "application/pdf"
          ? EvidenceKind.WRITTEN_QUOTE
          : EvidenceKind.SCREENSHOT,
      metadata: { purpose: "job_specification_intake" },
      mode: context.mode,
      retentionDays: context.retentionDays,
    });

    const extractor = this.providers.extractionProvider;
    if (!extractor) {
      const extraction: JobSpecificationExtraction = {
        confidence: 0,
        facts: { vertical: "moving" },
        sourceSummary: "The document was accepted in fixture mode.",
        warnings: [
          "Automatic document extraction activates when live OpenAI credentials are configured.",
        ],
      };
      return this.product.applyIntakeExtraction(publicId, extraction, {
        evidenceIds: [sourceEvidenceId],
        kind: "document",
        provider: "fixture",
      });
    }

    const traceId = randomUUID();
    const result = await extractor.extractJobSpecification(
      {
        input: {
          body: upload.buffer,
          contentType,
          filename: safeFilename(upload.originalname),
          kind: "file",
        },
      },
      this.providers.createContext({ requestId: traceId, traceId }),
    );
    if (!result.ok) this.throwProviderFailure(result.error, "document");

    const structuredEvidenceId = randomUUID();
    await this.persistEvidence({
      body: new TextEncoder().encode(JSON.stringify(result.value)),
      contentType: "application/json",
      evidenceId: structuredEvidenceId,
      filename: "extraction.json",
      jobId: context.jobId,
      kind: EvidenceKind.STRUCTURED_EXTRACTION,
      metadata: {
        purpose: "job_specification_extraction",
        sourceEvidenceId,
      },
      mode: context.mode,
      retentionDays: context.retentionDays,
    });
    return this.product.applyIntakeExtraction(publicId, result.value, {
      evidenceIds: [sourceEvidenceId, structuredEvidenceId],
      kind: "document",
      provider: extractor.name,
    });
  }

  async createVoiceSession(publicId: string): Promise<unknown> {
    const context = await this.product.getIntakeContext(publicId);
    if (context.mode === "fixture") {
      return {
        available: false,
        message:
          "Voice interviews activate in live mode after ElevenLabs is configured.",
        mode: context.mode,
        signedUrl: null,
      };
    }

    const traceId = randomUUID();
    const result = await this.providers.createSignedInterviewUrl({
      requestId: traceId,
      traceId,
    });
    if (!result.ok) this.throwProviderFailure(result.error, "voice");
    const sessionId = `intake_${randomUUID().replaceAll("-", "")}`;
    await this.prisma.client.voiceIntakeSession.create({
      data: {
        conversationId: sessionId,
        expiresAt: new Date(Date.now() + INTERVIEW_SESSION_TTL_MS),
        jobId: context.jobId,
      },
    });
    return {
      available: true,
      mode: context.mode,
      sessionId,
      signedUrl: result.value.signedUrl,
    };
  }

  async completeVoiceSession(
    publicId: string,
    sessionId: string,
    conversationId: string,
  ): Promise<unknown> {
    const context = await this.product.getIntakeContext(publicId);
    if (context.mode === "fixture") {
      throw new UnprocessableEntityException(
        "Voice interview completion requires live ElevenLabs configuration.",
      );
    }

    let claimed = { count: 0 };
    try {
      claimed = await this.prisma.client.voiceIntakeSession.updateMany({
        data: {
          conversationId,
          status: VoiceIntakeSessionStatus.PROCESSING,
        },
        where: {
          conversationId: sessionId,
          expiresAt: { gt: new Date() },
          jobId: context.jobId,
          status: VoiceIntakeSessionStatus.READY,
        },
      });
    } catch {
      // A unique provider ID can only be retried through the already-bound row.
    }
    if (claimed.count === 0) {
      claimed = await this.prisma.client.voiceIntakeSession.updateMany({
        data: { status: VoiceIntakeSessionStatus.PROCESSING },
        where: {
          conversationId,
          expiresAt: { gt: new Date() },
          jobId: context.jobId,
          status: VoiceIntakeSessionStatus.READY,
        },
      });
    }
    if (claimed.count !== 1) {
      throw new UnprocessableEntityException(
        "This voice interview is expired, already processed, or does not belong to this request.",
      );
    }

    const traceId = randomUUID();
    let durableWritesStarted = false;
    try {
      let snapshot = await this.providers.fetchFinishedConversation(
        conversationId,
        { requestId: traceId, traceId },
      );
      for (
        let attempt = 1;
        snapshot.ok &&
        snapshot.value.status !== "completed" &&
        !["cancelled", "failed"].includes(snapshot.value.status) &&
        attempt < INTERVIEW_FINALIZATION_ATTEMPTS;
        attempt += 1
      ) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, INTERVIEW_FINALIZATION_DELAY_MS);
        });
        snapshot = await this.providers.fetchFinishedConversation(
          conversationId,
          { requestId: traceId, traceId },
        );
      }
      if (!snapshot.ok) this.throwProviderFailure(snapshot.error, "voice");
      if (
        !this.providers.isExpectedInterviewConversation(
          snapshot.value,
          sessionId,
        )
      ) {
        durableWritesStarted = true;
        throw new UnprocessableEntityException(
          "This voice interview could not be verified for this request.",
        );
      }
      const transcript = snapshot.value.transcriptText?.trim();
      if (snapshot.value.status !== "completed" || !transcript) {
        throw new UnprocessableEntityException(
          "Finish the voice interview before importing its answers.",
        );
      }

      const extractor = this.providers.extractionProvider;
      if (!extractor) {
        throw new ServiceUnavailableException(
          "Voice interview extraction is temporarily unavailable.",
        );
      }
      const extracted = await extractor.extractJobSpecification(
        { input: { kind: "text", text: transcript } },
        this.providers.createContext({ requestId: traceId, traceId }),
      );
      if (!extracted.ok) this.throwProviderFailure(extracted.error, "voice");

      durableWritesStarted = true;
      const transcriptEvidenceId = randomUUID();
      await this.persistEvidence({
        body: new TextEncoder().encode(transcript),
        contentType: "text/plain",
        evidenceId: transcriptEvidenceId,
        filename: "interview-transcript.txt",
        jobId: context.jobId,
        kind: EvidenceKind.TRANSCRIPT,
        metadata: { conversationId, purpose: "job_specification_intake" },
        mode: context.mode,
        retentionDays: context.retentionDays,
      });

      const structuredEvidenceId = randomUUID();
      await this.persistEvidence({
        body: new TextEncoder().encode(JSON.stringify(extracted.value)),
        contentType: "application/json",
        evidenceId: structuredEvidenceId,
        filename: "extraction.json",
        jobId: context.jobId,
        kind: EvidenceKind.STRUCTURED_EXTRACTION,
        metadata: {
          conversationId,
          purpose: "job_specification_extraction",
          sourceEvidenceId: transcriptEvidenceId,
        },
        mode: context.mode,
        retentionDays: context.retentionDays,
      });
      const result = await this.product.applyIntakeExtraction(
        publicId,
        extracted.value,
        {
          evidenceIds: [transcriptEvidenceId, structuredEvidenceId],
          kind: "voice",
          provider: extractor.name,
        },
      );
      await this.prisma.client.voiceIntakeSession.update({
        data: {
          completedAt: new Date(),
          status: VoiceIntakeSessionStatus.COMPLETED,
        },
        where: { conversationId },
      });
      return result;
    } catch (error: unknown) {
      await this.prisma.client.voiceIntakeSession
        .updateMany({
          data: {
            status: durableWritesStarted
              ? VoiceIntakeSessionStatus.FAILED
              : VoiceIntakeSessionStatus.READY,
          },
          where: {
            conversationId,
            jobId: context.jobId,
            status: VoiceIntakeSessionStatus.PROCESSING,
          },
        })
        .catch(() => undefined);
      throw error;
    }
  }

  private async persistEvidence(input: {
    readonly body: Uint8Array;
    readonly contentType: EvidenceContentType;
    readonly evidenceId: string;
    readonly filename: string;
    readonly jobId: string;
    readonly kind: EvidenceKind;
    readonly metadata: Readonly<Record<string, string>>;
    readonly mode: "fixture" | "live";
    readonly retentionDays: number;
  }): Promise<void> {
    const retentionUntil = new Date(
      Date.now() + input.retentionDays * 86_400_000,
    );
    const storageKey = `jobs/${input.jobId}/intake/${input.evidenceId}/${storedFilename(input.filename, input.contentType)}`;
    const storage = this.providers.evidenceStorage;
    let stored:
      | {
          readonly contentLength: number;
          readonly etag: string;
          readonly key: string;
        }
      | undefined;
    if (storage) {
      const traceId = randomUUID();
      const result = await storage.put(
        {
          body: input.body,
          contentType: input.contentType,
          key: storageKey,
          metadata: input.metadata,
          retentionUntil: retentionUntil.toISOString(),
        },
        this.providers.createContext({ requestId: traceId, traceId }),
      );
      if (!result.ok) this.throwProviderFailure(result.error, "storage");
      stored = result.value;
    }

    await this.prisma.client.evidence.create({
      data: {
        checksum: checksum(input.body),
        contentLength: stored?.contentLength ?? input.body.byteLength,
        contentType: input.contentType,
        id: input.evidenceId,
        jobId: input.jobId,
        kind: input.kind,
        metadata: toJson({
          ...input.metadata,
          fixturePersistence:
            input.mode === "fixture" ? "metadata_only" : undefined,
        }),
        provider: storage?.name ?? "fixture",
        retentionUntil,
        storageKey: stored?.key ?? `fixture://${storageKey}`,
      },
    });
  }

  private throwProviderFailure(
    failure: ProviderFailure,
    operation: "document" | "storage" | "voice",
  ): never {
    if (failure.code === "invalid-response") {
      throw new BadGatewayException(
        `The ${operation} provider returned an invalid response.`,
      );
    }
    if (failure.code === "not-found") {
      throw new UnprocessableEntityException(
        `The ${operation} resource could not be found.`,
      );
    }
    throw new ServiceUnavailableException(
      `The ${operation} service is temporarily unavailable.`,
    );
  }
}
