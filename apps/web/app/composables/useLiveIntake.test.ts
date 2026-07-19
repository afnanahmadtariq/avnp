import { effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { JobDetail, JobSpecification } from "../types/api";
import { useLiveIntake } from "./useLiveIntake";

const specification: JobSpecification = {
  bedrooms: 2,
  dropoffAddress: { formattedAddress: "Charlotte, NC" },
  dropoffStairs: 0,
  hasElevator: true,
  inventory: [{ name: "boxes", quantity: 20 }],
  movingDate: "2026-08-15",
  packingPreference: "none",
  pickupAddress: { formattedAddress: "Rock Hill, SC" },
  pickupStairs: 1,
  vertical: "moving",
};

const job: JobDetail = {
  bestOfferCents: null,
  candidateCount: 0,
  confirmedVersion: null,
  consent: { calling: false, recording: false },
  draft: specification,
  latestRunId: null,
  movingDate: "2026-08-15",
  nextAction: "review_brief",
  publicId: "RLY-3001",
  route: { destination: "Charlotte, NC", pickup: "Rock Hill, SC" },
  savingsCents: null,
  stage: "draft",
  status: "draft",
  title: "Charlotte move",
  updatedAt: "2026-07-19T10:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("live intake", () => {
  it("lazily creates one draft, extracts a document, and saves manual edits", async () => {
    const api = {
      completeIntakeVoice: vi.fn(),
      createIntakeVoiceSession: vi.fn(),
      createJob: vi.fn().mockResolvedValue(job),
      updateJobDraft: vi.fn().mockResolvedValue(job),
      uploadIntakeDocument: vi.fn().mockResolvedValue({
        extraction: {
          confidence: 0.92,
          facts: { movingDate: "2026-08-20" },
          sourceSummary: "Uploaded estimate",
        },
        job,
      }),
    };
    vi.stubGlobal("useRelayApi", () => api);

    const scope = effectScope();
    const intake = scope.run(() => useLiveIntake());
    expect(intake).toBeDefined();
    if (!intake) throw new Error("Intake composable was not created.");

    const file = new File(["estimate"], "estimate.pdf", {
      type: "application/pdf",
    });
    await intake.uploadDocument(file, "Charlotte move");

    expect(api.createJob).toHaveBeenCalledOnce();
    expect(api.createJob).toHaveBeenCalledWith({ title: "Charlotte move" });
    expect(api.uploadIntakeDocument).toHaveBeenCalledWith("RLY-3001", file);
    expect(intake.extraction.value?.facts.movingDate).toBe("2026-08-20");
    expect(intake.processedFileName.value).toBe("estimate.pdf");

    await intake.saveDraft(
      { ...specification, movingDate: "2026-08-20" },
      "Charlotte move",
    );
    expect(api.createJob).toHaveBeenCalledOnce();
    expect(api.updateJobDraft).toHaveBeenCalledWith(
      "RLY-3001",
      expect.objectContaining({ movingDate: "2026-08-20" }),
      "Charlotte move",
    );
    scope.stop();
  });

  it("preserves the created draft when document extraction fails", async () => {
    const api = {
      completeIntakeVoice: vi.fn(),
      createIntakeVoiceSession: vi.fn(),
      createJob: vi.fn().mockResolvedValue(job),
      updateJobDraft: vi.fn(),
      uploadIntakeDocument: vi.fn().mockRejectedValue(new Error("Bad file")),
    };
    vi.stubGlobal("useRelayApi", () => api);

    const scope = effectScope();
    const intake = scope.run(() => useLiveIntake());
    if (!intake) throw new Error("Intake composable was not created.");

    await intake.uploadDocument(
      new File(["estimate"], "estimate.pdf"),
      "Charlotte move",
    );

    expect(intake.draftPublicId.value).toBe("RLY-3001");
    expect(intake.error.value).toBe("Bad file");
    expect(intake.documentPending.value).toBe(false);
    scope.stop();
  });

  it("explains when a voice provider is unavailable before requesting the microphone", async () => {
    const getUserMedia = vi.fn();
    const api = {
      completeIntakeVoice: vi.fn(),
      createIntakeVoiceSession: vi.fn().mockResolvedValue({
        available: false,
        message: "Configure ElevenLabs to enable voice interviews.",
        mode: "fixture",
      }),
      createJob: vi.fn().mockResolvedValue(job),
      updateJobDraft: vi.fn(),
      uploadIntakeDocument: vi.fn(),
    };
    vi.stubGlobal("useRelayApi", () => api);
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia,
      },
    });

    const scope = effectScope();
    const intake = scope.run(() => useLiveIntake());
    if (!intake) throw new Error("Intake composable was not created.");

    await intake.startVoiceInterview("Charlotte move");

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(api.createJob).toHaveBeenCalledWith({ title: "Charlotte move" });
    expect(intake.voiceStatus.value).toBe("error");
    expect(intake.error.value).toContain("Configure ElevenLabs");
    scope.stop();
  });
});
