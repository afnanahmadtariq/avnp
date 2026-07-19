import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { configureApplication } from "../app.setup.js";
import { EvidenceAccessService } from "./evidence-access.service.js";
import { EvidenceController } from "./evidence.controller.js";

describe("evidence access API", () => {
  const createSignedReadAccess = vi.fn().mockResolvedValue({
    contentType: "text/plain",
    evidenceId: "evidence-1",
    expiresAt: "2026-07-19T10:05:00.000Z",
    url: "https://storage.example/signed/transcript",
  });
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [EvidenceController],
      providers: [
        {
          provide: EvidenceAccessService,
          useValue: { createSignedReadAccess },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns signed access through the versioned evidence route", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/evidence/evidence-1/access")
      .expect(200)
      .expect("Cache-Control", "no-store")
      .expect(({ body }) => {
        expect(body).toMatchObject({
          evidenceId: "evidence-1",
          url: "https://storage.example/signed/transcript",
        });
      });

    expect(createSignedReadAccess).toHaveBeenCalledWith("evidence-1");
  });
});
