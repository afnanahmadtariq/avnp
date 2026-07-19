import type {
  ApiErrorBody,
  CandidateBusiness,
  EvidenceAccess,
  IntakeResult,
  IntakeVoiceSession,
  JobDetail,
  JobSpecification,
  JobSummary,
  RelayAccountExport,
  RelayProfile,
  RelayProfileUpdate,
  RelaySettings,
  RelaySettingsUpdate,
  RunEvent,
  RunReport,
  RunSnapshot,
} from "~/types/api";
import { useAuth } from "@clerk/nuxt/composables";

interface CreateJobInput {
  specification?: JobSpecification;
  title?: string;
}

interface ConfirmJobInput {
  callingConsent: boolean;
  recordingConsent: boolean;
}

interface ApiRequestOptions {
  body?: unknown;
  method?: "GET" | "PATCH" | "POST" | "PUT";
}

export class RelayApiError extends Error {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "RelayApiError";
    this.statusCode = statusCode;
  }
}

const INTERNAL_SERVICE_ERROR =
  /(?:elevenlabs|google places|openai|provider|redis|supabase|twilio|invalid response|stack|prisma)/i;

export function relayApiErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "Relay could not reach the service. Please try again.";
  }

  const candidate = error as {
    data?: ApiErrorBody;
    message?: string;
    statusCode?: number;
    status?: number;
  };
  const statusCode = candidate.statusCode ?? candidate.status;
  const responseMessage = candidate.data?.message;
  const rawMessage = Array.isArray(responseMessage)
    ? responseMessage.join(" ")
    : (responseMessage ?? candidate.message);

  if (statusCode === 401) return "Your session expired. Sign in to continue.";
  if (statusCode === 403) return "You do not have access to that Relay item.";
  if (statusCode === 429)
    return "Relay is handling a high number of requests. Try again shortly.";
  if (
    (statusCode !== undefined && statusCode >= 500) ||
    (rawMessage !== undefined && INTERNAL_SERVICE_ERROR.test(rawMessage))
  ) {
    return "Relay could not complete that step. Try again, or open Support if it continues.";
  }

  return rawMessage ?? "Relay could not reach the service. Please try again.";
}

export function useRelayApi() {
  const config = useRuntimeConfig();
  const route = useRoute();
  const baseURL = String(config.public.apiBase).replace(/\/$/, "");
  const clerkAuth =
    config.public.authProvider === "clerk" ? useAuth() : undefined;

  async function request<T>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    try {
      const token = await clerkAuth?.getToken.value();
      return await $fetch<T>(`${baseURL}${path}`, {
        body: options.body as BodyInit | Record<string, unknown> | undefined,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        method: options.method ?? "GET",
      });
    } catch (error: unknown) {
      const candidate = error as { status?: number; statusCode?: number };
      const statusCode = candidate.statusCode ?? candidate.status;
      if (
        statusCode === 401 &&
        import.meta.client &&
        !route.path.startsWith("/sign-in")
      ) {
        await navigateTo({
          path: "/sign-in",
          query: { redirect_url: route.fullPath },
        });
      }
      throw new RelayApiError(relayApiErrorMessage(error), statusCode);
    }
  }

  return {
    exportAccount: () => request<RelayAccountExport>("/account/export"),
    getCandidates: (publicId: string) =>
      request<{
        items: CandidateBusiness[];
        jobPublicId?: string;
        mode?: string;
        status?: string;
      }>(`/jobs/${encodeURIComponent(publicId)}/candidates`),
    getEvents: (runId: string) =>
      request<{ items: RunEvent[]; sequence: number }>(
        `/runs/${encodeURIComponent(runId)}/events`,
      ),
    getEvidenceAccess: (evidenceId: string) =>
      request<EvidenceAccess>(
        `/evidence/${encodeURIComponent(evidenceId)}/access`,
      ),
    getJob: (publicId: string) =>
      request<JobDetail>(`/jobs/${encodeURIComponent(publicId)}`),
    getJobs: () => request<{ items: JobSummary[] }>("/jobs"),
    getProfile: () => request<RelayProfile>("/profile"),
    getReport: (runId: string) =>
      request<RunReport>(`/runs/${encodeURIComponent(runId)}/report`),
    getRun: (runId: string) =>
      request<RunSnapshot>(`/runs/${encodeURIComponent(runId)}`),
    getSettings: () => request<RelaySettings>("/settings"),
    createJob: (input: CreateJobInput) =>
      request<JobDetail>("/jobs", { body: input, method: "POST" }),
    completeIntakeVoice: (
      publicId: string,
      sessionId: string,
      conversationId: string,
    ) =>
      request<IntakeResult>(
        `/jobs/${encodeURIComponent(publicId)}/intake/voice/complete`,
        { body: { conversationId, sessionId }, method: "POST" },
      ),
    confirmJob: (publicId: string, input: ConfirmJobInput) =>
      request<JobDetail>(`/jobs/${encodeURIComponent(publicId)}/confirm`, {
        body: input,
        method: "POST",
      }),
    discoverBusinesses: (publicId: string) =>
      request<{
        items: CandidateBusiness[];
        jobPublicId: string;
        mode: string;
        status: string;
      }>(`/jobs/${encodeURIComponent(publicId)}/discovery`, { method: "POST" }),
    createIntakeVoiceSession: (publicId: string) =>
      request<IntakeVoiceSession>(
        `/jobs/${encodeURIComponent(publicId)}/intake/voice/session`,
        { method: "POST" },
      ),
    saveDecision: (runId: string, quoteId: string) =>
      request<{ quoteId: string; saved: boolean; savedAt: string }>(
        `/runs/${encodeURIComponent(runId)}/decision`,
        { body: { quoteId }, method: "PUT" },
      ),
    startRun: (publicId: string, businessIds: string[]) =>
      request<RunSnapshot>(`/jobs/${encodeURIComponent(publicId)}/runs`, {
        body: { businessIds },
        method: "POST",
      }),
    updateJobDraft: (
      publicId: string,
      specification: JobSpecification,
      title?: string,
    ) =>
      request<JobDetail>(`/jobs/${encodeURIComponent(publicId)}/draft`, {
        body: { specification, ...(title ? { title } : {}) },
        method: "PATCH",
      }),
    uploadIntakeDocument: (publicId: string, file: File) => {
      const body = new FormData();
      body.append("file", file, file.name);

      return request<IntakeResult>(
        `/jobs/${encodeURIComponent(publicId)}/intake/documents`,
        { body, method: "POST" },
      );
    },
    updateProfile: (profile: RelayProfileUpdate) =>
      request<RelayProfile>("/profile", { body: profile, method: "PATCH" }),
    updateRun: (runId: string, action: "cancel" | "pause" | "resume") =>
      request<RunSnapshot>(`/runs/${encodeURIComponent(runId)}/${action}`, {
        method: "POST",
      }),
    updateSettings: (settings: RelaySettingsUpdate) =>
      request<RelaySettings>("/settings", {
        body: settings,
        method: "PATCH",
      }),
  };
}
