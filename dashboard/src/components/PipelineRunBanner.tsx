import type { WorkflowRun } from "../lib/githubActions";
import { formatRelative } from "../lib/format";

/**
 * Shows currently in_progress/queued GitHub Actions runs. Renders nothing
 * when there are none — Header.tsx's LIVE/IDLE badge already covers the
 * idle state; this banner is specifically for "something is running now."
 * `runs` comes from the shared usePipelineRuns() hook (see
 * lib/githubActions.ts), polled once at the App level and reused here and
 * by TriggerPipelineButton rather than fetched twice.
 */
export function PipelineRunBanner({ runs }: { runs: WorkflowRun[] }) {
  if (runs.length === 0) return null;

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <a
          key={run.id}
          href={run.html_url}
          target="_blank"
          rel="noreferrer"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-sm text-emerald-200 transition hover:bg-emerald-400/15"
        >
          <span className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.7)]"
              aria-hidden="true"
            />
            <span className="font-semibold">{run.name}</span>
            <span className="text-emerald-300/80">&middot; {run.status === "queued" ? "queued" : "running"}</span>
          </span>
          <span className="text-xs text-emerald-300/70">
            {run.status === "in_progress" && run.run_started_at ? `started ${formatRelative(run.run_started_at)}` : "waiting to start"}
          </span>
        </a>
      ))}
    </div>
  );
}
