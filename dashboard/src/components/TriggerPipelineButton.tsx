import { useEffect, useState } from "react";
import { PIPELINE_WORKFLOW_FILE, REPO_SLUG } from "../lib/githubActions";
import { clearToken, getToken, onTokenChange } from "../lib/githubToken";

type TriggerState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "auth-error"; message: string }
  | { kind: "error"; message: string };

/**
 * No theme input — a dispatch always uses the workflow's auto-select
 * default, same as the weekly cron trigger. Costs real Anthropic + Gemini
 * API spend per click and opens a real PR, so this always confirms first
 * and never retries automatically.
 */
export function TriggerPipelineButton({
  isPipelineRunning,
  onTriggered,
}: {
  isPipelineRunning: boolean;
  /** Called after a successful dispatch so the caller can re-poll part 3's Actions state sooner than the normal interval. */
  onTriggered: () => void;
}) {
  const [state, setState] = useState<TriggerState>({ kind: "idle" });
  const [hasToken, setHasToken] = useState(() => getToken() !== null);

  useEffect(() => onTokenChange(() => setHasToken(getToken() !== null)), []);

  const disabledReason = !hasToken
    ? "Save a GitHub token first (gear icon above) to trigger a run."
    : isPipelineRunning
      ? "A pipeline run is already in progress or queued."
      : null;

  async function dispatch() {
    const token = getToken();
    if (!token) {
      setState({ kind: "auth-error", message: "No token saved." });
      return;
    }
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO_SLUG}/actions/workflows/${PIPELINE_WORKFLOW_FILE}/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        body: JSON.stringify({ ref: "main" }),
      });

      if (res.status === 204) {
        setState({ kind: "success" });
        setTimeout(onTriggered, 5_000);
        return;
      }
      if (res.status === 401 || res.status === 403) {
        clearToken();
        setState({
          kind: "auth-error",
          message: "GitHub rejected the token (401/403) — it was cleared. Re-enter a valid token via the gear icon.",
        });
        return;
      }
      setState({ kind: "error", message: `GitHub responded ${res.status} ${res.statusText}` });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (state.kind === "confirming") {
    return (
      <div className="max-w-sm rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
        <p>
          Run the pipeline now? This researches and generates a new coloring book batch using real Anthropic + Gemini API
          credits and opens a PR for review.
        </p>
        <div className="mt-2.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setState({ kind: "idle" })}
            className="rounded border border-slate-700 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={dispatch}
            className="rounded border border-amber-400/50 bg-amber-400/20 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-400/30"
          >
            Run pipeline
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        disabled={Boolean(disabledReason) || state.kind === "submitting"}
        title={disabledReason ?? undefined}
        onClick={() => setState({ kind: "confirming" })}
        className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-sky-300 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.kind === "submitting" ? "Triggering…" : "Trigger pipeline run"}
      </button>

      {state.kind === "success" && (
        <p className="text-[11px] text-emerald-300">Triggered — it can take up to a minute to appear as a running workflow.</p>
      )}
      {(state.kind === "auth-error" || state.kind === "error") && (
        <p className="max-w-xs text-right text-[11px] text-red-300">{state.message}</p>
      )}
    </div>
  );
}
