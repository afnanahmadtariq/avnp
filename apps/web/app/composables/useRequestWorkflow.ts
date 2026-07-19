import { readonly } from "vue";

import type { JobDetail } from "../types/api";

interface LoadJobOptions {
  force?: boolean;
}

export function useRequestWorkflow() {
  const api = useRelayApi();
  const job = useState<JobDetail | null>(
    "relay-request-workflow-job",
    () => null,
  );
  const pending = useState("relay-request-workflow-pending", () => false);
  const loadSequence = useState("relay-request-workflow-sequence", () => 0);

  function clearJob(): void {
    loadSequence.value += 1;
    job.value = null;
    pending.value = false;
  }

  function setJob(nextJob: JobDetail): void {
    loadSequence.value += 1;
    job.value = nextJob;
    pending.value = false;
  }

  async function loadJob(
    publicId: string,
    options: LoadJobOptions = {},
  ): Promise<JobDetail | undefined> {
    if (!publicId) {
      clearJob();
      return undefined;
    }

    if (!options.force && job.value?.publicId === publicId) {
      return job.value;
    }

    const sequence = loadSequence.value + 1;
    loadSequence.value = sequence;
    if (job.value?.publicId !== publicId) job.value = null;
    pending.value = true;

    try {
      const loadedJob = await api.getJob(publicId);
      if (loadSequence.value !== sequence) return undefined;

      job.value = loadedJob;
      return loadedJob;
    } finally {
      if (loadSequence.value === sequence) pending.value = false;
    }
  }

  return {
    clearJob,
    job: readonly(job),
    loadJob,
    pending: readonly(pending),
    setJob,
  };
}
