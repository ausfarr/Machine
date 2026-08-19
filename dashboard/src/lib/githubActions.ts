import { useCallback, useEffect, useState } from "react";

export const REPO_OWNER = "ausfarr";
export const REPO_NAME = "Machine";
export const REPO_SLUG = `${REPO_OWNER}/${REPO_NAME}`;
export const PIPELINE_WORKFLOW_FILE = "pipeline.yml";

const API_BASE = `https://api.github.com/repos/${REPO_SLUG}`;

export interface WorkflowRun {
  id: number;
  name: string;
  status: string; // "in_progress" | "queued" | "completed" | ...
  conclusion: string | null;
  html_url: string;
  run_started_at: string;
  path: string; // e.g. ".github/workflows/pipeline.yml"
  event: string;
}

interface RunsResponse {
  workflow_runs: WorkflowRun[];
}

/** Fetches runs at one status. Returns null (not []) on a rate-limited 403, so callers can distinguish "no runs" from "skip this cycle". */
async function fetchRunsByStatus(status: "in_progress" | "queued"): Promise<WorkflowRun[] | null> {
  const res = await fetch(`${API_BASE}/actions/runs?status=${status}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (res.status === 403) {
    console.warn(`GitHub Actions runs fetch (status=${status}) hit the unauthenticated rate limit (403) — skipping this poll cycle.`);
    return null;
  }
  if (!res.ok) {
    throw new Error(`GitHub Actions runs fetch (status=${status}) failed: ${res.status}`);
  }
  const data = (await res.json()) as RunsResponse;
  return data.workflow_runs ?? [];
}

export function isPipelineWorkflowRun(run: WorkflowRun): boolean {
  return run.path.endsWith(`/${PIPELINE_WORKFLOW_FILE}`) || run.path === PIPELINE_WORKFLOW_FILE;
}

/**
 * Polls in_progress + queued Actions runs on a shared ~20s interval. Both
 * PipelineRunBanner and TriggerPipelineButton read from this one hook
 * instance's state (passed down as props) rather than each polling the
 * API themselves.
 */
export function usePipelineRuns(pollMs = 20_000) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);

  const refetch = useCallback(async () => {
    try {
      const [inProgress, queued] = await Promise.all([fetchRunsByStatus("in_progress"), fetchRunsByStatus("queued")]);
      if (inProgress === null || queued === null) return; // rate-limited this cycle; keep prior state
      setRuns([...inProgress, ...queued]);
    } catch (err) {
      console.error("Failed to poll GitHub Actions runs:", err);
    }
  }, []);

  useEffect(() => {
    refetch();
    const id = setInterval(refetch, pollMs);
    return () => clearInterval(id);
  }, [refetch, pollMs]);

  const isPipelineRunning = runs.some(isPipelineWorkflowRun);

  return { runs, isPipelineRunning, refetch };
}
