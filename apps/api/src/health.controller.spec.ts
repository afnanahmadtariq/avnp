import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { healthResponseSchema } from "@relay/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { configureApplication } from "./app.setup.js";
import { HealthController } from "./health.controller.js";

describe("GET /api/v1/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the shared healthy response without external providers", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/health")
      .expect(200);

    const parsedResponse = healthResponseSchema.safeParse(response.body);

    expect(parsedResponse.success).toBe(true);
    expect(response.body).toMatchObject({
      service: "api",
      status: "ok",
      version: "0.0.0",
    });
  });
});
