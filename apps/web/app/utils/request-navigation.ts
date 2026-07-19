import type { JobSummary } from "../types/api";

export type RequestStage = "businesses" | "report" | "review" | "workspace";

const nextStageByAction: Readonly<Record<string, RequestStage>> = {
  approve_and_start: "businesses",
  discover_businesses: "businesses",
  follow_run: "workspace",
  resume_or_cancel: "workspace",
  review_and_confirm: "review",
  review_brief: "review",
  review_report: "report",
  start_over: "businesses",
};

const stageLabels: Readonly<Record<RequestStage, string>> = {
  businesses: "Review businesses",
  report: "Review report",
  review: "Review brief",
  workspace: "Open live calls",
};

export function requestNextStage(
  job: Pick<JobSummary, "nextAction">,
): RequestStage {
  return nextStageByAction[job.nextAction] ?? "review";
}

export function requestDestination(
  job: Pick<JobSummary, "nextAction" | "publicId">,
): string {
  const stage = requestNextStage(job);
  return `/requests/${encodeURIComponent(job.publicId)}/${stage}`;
}

export function requestStageLabel(stage: RequestStage): string {
  return stageLabels[stage];
}

export function isRequestStageAvailable(
  job: Pick<JobSummary, "nextAction">,
  stage: RequestStage,
): boolean {
  if (stage === "review") return true;

  const nextStage = requestNextStage(job);
  if (stage === "workspace") {
    return nextStage === "workspace" || nextStage === "report";
  }

  return stage === nextStage;
}
