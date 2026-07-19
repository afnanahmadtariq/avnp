import type { Conversation as ElevenLabsConversation } from "@elevenlabs/client";
import { computed, onScopeDispose, ref, shallowRef } from "vue";

import type {
  IntakeResult,
  JobDetail,
  JobSpecification,
  JobSpecificationExtraction,
} from "~/types/api";

type IntakeActivity = "document" | "idle" | "voice";
type VoiceMode = "listening" | "speaking";
type VoiceStatus =
  | "complete"
  | "connecting"
  | "error"
  | "idle"
  | "listening"
  | "permission"
  | "processing";

function intakeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}

function resultJob(result: IntakeResult | JobDetail): JobDetail {
  return "job" in result ? result.job : result;
}

function resultExtraction(
  result: IntakeResult | JobDetail,
): JobSpecificationExtraction | undefined {
  return "extraction" in result ? result.extraction : undefined;
}

export function useLiveIntake() {
  const api = useRelayApi();
  const activity = ref<IntakeActivity>("idle");
  const draftJob = shallowRef<JobDetail>();
  const error = ref("");
  const extraction = shallowRef<JobSpecificationExtraction>();
  const processedFileName = ref("");
  const voiceConversationId = ref("");
  const voiceMode = ref<VoiceMode>("listening");
  const voiceStatus = ref<VoiceStatus>("idle");
  let conversation: ElevenLabsConversation | undefined;
  let completingConversation: Promise<JobDetail | undefined> | undefined;
  let endingIntentionally = false;

  const draftPublicId = computed(() => draftJob.value?.publicId);
  const documentPending = computed(() => activity.value === "document");
  const voiceActive = computed(() =>
    ["connecting", "listening", "permission"].includes(voiceStatus.value),
  );

  function clearError(): void {
    error.value = "";
    if (voiceStatus.value === "error") voiceStatus.value = "idle";
  }

  function applyResult(result: IntakeResult | JobDetail): JobDetail {
    const job = resultJob(result);
    draftJob.value = job;
    extraction.value = resultExtraction(result);
    return job;
  }

  async function ensureDraft(title: string): Promise<JobDetail> {
    if (draftJob.value) return draftJob.value;

    const created = await api.createJob({ title });
    draftJob.value = created;
    return created;
  }

  async function uploadDocument(
    file: File,
    title: string,
  ): Promise<JobDetail | undefined> {
    if (documentPending.value || voiceActive.value) return undefined;

    activity.value = "document";
    error.value = "";
    processedFileName.value = "";

    try {
      const job = await ensureDraft(title);
      const result = await api.uploadIntakeDocument(job.publicId, file);
      processedFileName.value = file.name;
      return applyResult(result);
    } catch (cause: unknown) {
      error.value = intakeErrorMessage(
        cause,
        "Relay could not read this document. Please try another file.",
      );
      return undefined;
    } finally {
      activity.value = "idle";
    }
  }

  async function completeConversation(
    conversationId: string,
    endActiveSession: boolean,
  ): Promise<JobDetail | undefined> {
    if (completingConversation) return completingConversation;

    completingConversation = (async () => {
      activity.value = "voice";
      error.value = "";
      voiceStatus.value = "processing";

      try {
        if (endActiveSession && conversation) {
          const currentConversation = conversation;
          conversation = undefined;
          endingIntentionally = true;
          await currentConversation.endSession();
        }

        const publicId = draftJob.value?.publicId;
        if (!publicId)
          throw new Error("Create a draft before processing audio.");

        const result = await api.completeIntakeVoice(publicId, conversationId);
        const job = applyResult(result);
        voiceStatus.value = "complete";
        return job;
      } catch (cause: unknown) {
        voiceStatus.value = "error";
        error.value = intakeErrorMessage(
          cause,
          "Relay could not process this interview. Your manual details are still available.",
        );
        return undefined;
      } finally {
        activity.value = "idle";
        endingIntentionally = false;
        completingConversation = undefined;
      }
    })();

    return completingConversation;
  }

  async function startVoiceInterview(title: string): Promise<void> {
    if (voiceActive.value || documentPending.value) return;

    error.value = "";
    extraction.value = undefined;
    voiceConversationId.value = "";
    voiceMode.value = "listening";
    voiceStatus.value = "connecting";

    try {
      const job = await ensureDraft(title);
      const session = await api.createIntakeVoiceSession(job.publicId);
      if (!session.available || !session.signedUrl) {
        throw new Error(
          session.message ??
            "Voice interviews are not available in this workspace yet.",
        );
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Voice interviews need a browser with microphone access.",
        );
      }

      voiceStatus.value = "permission";
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      for (const track of permissionStream.getTracks()) track.stop();

      voiceStatus.value = "connecting";
      const { Conversation } = await import("@elevenlabs/client");

      conversation = await Conversation.startSession({
        onConnect: ({ conversationId }) => {
          voiceConversationId.value = conversationId;
          voiceStatus.value = "listening";
        },
        onDisconnect: (details) => {
          conversation = undefined;
          if (
            !endingIntentionally &&
            details.reason === "agent" &&
            voiceConversationId.value
          ) {
            void completeConversation(voiceConversationId.value, false);
          }
        },
        onError: (message) => {
          if (voiceStatus.value === "processing") return;
          error.value = message || "The voice interview was interrupted.";
          voiceStatus.value = "error";
        },
        onModeChange: ({ mode }) => {
          voiceMode.value = mode;
          voiceStatus.value = "listening";
        },
        signedUrl: session.signedUrl,
      });

      voiceConversationId.value ||= conversation.getId();
    } catch (cause: unknown) {
      conversation = undefined;
      voiceStatus.value = "error";
      error.value = intakeErrorMessage(
        cause,
        "Relay could not start the voice interview. Check microphone access and try again.",
      );
    }
  }

  async function finishVoiceInterview(): Promise<JobDetail | undefined> {
    const conversationId =
      voiceConversationId.value || conversation?.getId() || "";
    if (!conversationId) {
      error.value = "The interview has not connected yet. Please try again.";
      return undefined;
    }

    return completeConversation(conversationId, true);
  }

  async function retryVoiceProcessing(): Promise<JobDetail | undefined> {
    if (!voiceConversationId.value) return undefined;

    return completeConversation(
      voiceConversationId.value,
      Boolean(conversation),
    );
  }

  async function saveDraft(
    specification: JobSpecification,
    title: string,
  ): Promise<JobDetail> {
    error.value = "";
    try {
      const saved = draftJob.value
        ? await api.updateJobDraft(
            draftJob.value.publicId,
            specification,
            title,
          )
        : await api.createJob({ specification, title });
      draftJob.value = saved;
      return saved;
    } catch (cause: unknown) {
      error.value = intakeErrorMessage(
        cause,
        "Relay could not save this request. Please try again.",
      );
      throw cause;
    }
  }

  onScopeDispose(() => {
    if (!conversation) return;

    endingIntentionally = true;
    void conversation.endSession();
    conversation = undefined;
  });

  return {
    activity,
    clearError,
    documentPending,
    draftJob,
    draftPublicId,
    error,
    extraction,
    finishVoiceInterview,
    processedFileName,
    retryVoiceProcessing,
    saveDraft,
    startVoiceInterview,
    uploadDocument,
    voiceActive,
    voiceConversationId,
    voiceMode,
    voiceStatus,
  };
}
