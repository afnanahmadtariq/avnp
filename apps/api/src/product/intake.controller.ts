import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

// Runtime imports are required for Nest's emitted validation and injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CompleteVoiceIntakeDto } from "./intake.dto.js";
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IntakeService, type IntakeUpload } from "./intake.service.js";

const MAXIMUM_DOCUMENT_BYTES = 20 * 1024 * 1024;

@Controller("jobs/:publicId/intake")
export class IntakeController {
  constructor(private readonly intakeService: IntakeService) {}

  @Post("documents")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAXIMUM_DOCUMENT_BYTES, files: 1 },
    }),
  )
  uploadDocument(
    @Param("publicId") publicId: string,
    @UploadedFile() file: IntakeUpload | undefined,
  ): Promise<unknown> {
    if (!file) {
      throw new BadRequestException(
        "Attach one PDF, JPEG, PNG, or WebP document.",
      );
    }
    return this.intakeService.extractDocument(publicId, file);
  }

  @Post("voice/session")
  createVoiceSession(@Param("publicId") publicId: string): Promise<unknown> {
    return this.intakeService.createVoiceSession(publicId);
  }

  @Post("voice/complete")
  @HttpCode(HttpStatus.OK)
  completeVoiceSession(
    @Param("publicId") publicId: string,
    @Body() dto: CompleteVoiceIntakeDto,
  ): Promise<unknown> {
    return this.intakeService.completeVoiceSession(
      publicId,
      dto.sessionId,
      dto.conversationId,
    );
  }
}
