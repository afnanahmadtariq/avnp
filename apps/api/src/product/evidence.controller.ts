import { Controller, Get, Header, Param } from "@nestjs/common";

// Runtime imports are required for Nest's emitted injection metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { EvidenceAccessService } from "./evidence-access.service.js";

@Controller("evidence")
export class EvidenceController {
  constructor(private readonly evidenceAccess: EvidenceAccessService) {}

  @Get(":evidenceId/access")
  @Header("Cache-Control", "no-store")
  getSignedReadAccess(@Param("evidenceId") evidenceId: string) {
    return this.evidenceAccess.createSignedReadAccess(evidenceId);
  }
}
