import "reflect-metadata";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { configureApplication } from "../app.setup.js";
import { AccountController } from "./account.controller.js";
import { JobsController } from "./jobs.controller.js";
import { ProductService } from "./product.service.js";
import { RunsController } from "./runs.controller.js";

describe("product API validation and routing", () => {
  const productService = {
    confirmJob: vi.fn().mockResolvedValue({ publicId: "RLY-2048" }),
    createRun: vi.fn().mockResolvedValue({ id: "run-1" }),
    discoverBusinesses: vi.fn().mockResolvedValue({ items: [] }),
    getRunEvents: vi.fn().mockResolvedValue({ items: [] }),
    saveDecision: vi.fn().mockResolvedValue({ saved: true }),
    updateProfile: vi.fn().mockResolvedValue({ displayName: "Relay Demo" }),
    updateSettings: vi.fn().mockResolvedValue({ aiDisclosure: true }),
  };
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JobsController, RunsController, AccountController],
      providers: [{ provide: ProductService, useValue: productService }],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects confirmation until calling and recording consent are explicit", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/jobs/RLY-2048/confirm")
      .send({ callingConsent: true })
      .expect(400);

    expect(productService.confirmJob).not.toHaveBeenCalled();
  });

  it("accepts an explicitly consented confirmation", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/jobs/RLY-2048/confirm")
      .send({ callingConsent: true, recordingConsent: true })
      .expect(200);

    expect(productService.confirmJob).toHaveBeenCalledWith("RLY-2048", {
      callingConsent: true,
      recordingConsent: true,
    });
  });

  it("requires at least three unique businesses for a run", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/jobs/RLY-2048/runs")
      .send({ businessIds: ["business-a", "business-a", "business-b"] })
      .expect(400);

    expect(productService.createRun).not.toHaveBeenCalled();
  });

  it("starts a validated run through the service", async () => {
    const businessIds = ["business-a", "business-b", "business-c"];

    await request(app.getHttpServer())
      .post("/api/v1/jobs/RLY-2048/runs")
      .send({ businessIds })
      .expect(202);

    expect(productService.createRun).toHaveBeenCalledWith("RLY-2048", {
      businessIds,
    });
  });

  it("transforms an event cursor to a number", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/runs/run-1/events?after=4")
      .expect(200);

    expect(productService.getRunEvents).toHaveBeenCalledWith("run-1", 4);
  });

  it("forbids unknown profile fields", async () => {
    await request(app.getHttpServer())
      .patch("/api/v1/profile")
      .send({ displayName: "Relay Demo", isAdmin: true })
      .expect(400);

    expect(productService.updateProfile).not.toHaveBeenCalled();
  });

  it("does not allow the required AI disclosure to be disabled", async () => {
    await request(app.getHttpServer())
      .patch("/api/v1/settings")
      .send({ aiDisclosure: false })
      .expect(400);

    expect(productService.updateSettings).not.toHaveBeenCalled();
  });

  it("accepts canonical privacy settings", async () => {
    const settings = {
      aiDisclosure: true,
      evidenceRetentionDays: 30,
      recordingConsentDefault: false,
    };

    await request(app.getHttpServer())
      .patch("/api/v1/settings")
      .send(settings)
      .expect(200);

    expect(productService.updateSettings).toHaveBeenCalledWith(settings);
  });
});
